# resenas-criticas

Servicio derivado de la etapa 2. Combina las reseñas de **MS-resenas** (nuestra colección) con los productos de **MS-productos** (servicio Z, de otro grupo) para obtener:

- las reseñas críticas (puntaje ≤ 2) con el nombre del producto reseñado;
- el puntaje promedio de las reseñas agrupado por categoría del producto.

Ninguno de los dos servicios entrega estos datos por separado: las reseñas no conocen el nombre ni la categoría del producto, y los productos no conocen sus reseñas.

Ambos servicios se consultan solo por HTTP, usando su contrato común (`GET /items`).

## Variables de entorno

| Variable | Requerida | Descripción | Valor en Render |
|---|---|---|---|
| `Z_URL` | Sí | URL de MS-productos (servicio Z) | `https://ms-productos-1uz6.onrender.com` |
| `RESENAS_URL` | No | URL de nuestro MS-resenas | `https://resenas-service.onrender.com` (por defecto) |
| `SERVICE_NAME` | No | Nombre que devuelve `/health` | `resenas-criticas` (por defecto) |
| `PORT` | No | Puerto HTTP | `3000` (Render lo define solo) |

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio. No consulta upstreams, responde al instante. |
| GET | `/resenas/criticas` | Reseñas con puntaje ≤ 2 con el nombre del producto, ordenadas por `resenaId`. |
| GET | `/resenas/por-categoria` | Puntaje promedio y cantidad de reseñas por `categoriaId`, ordenado por `categoriaId`. |

### `GET /health`

```json
{ "status": "ok", "timestamp": "2026-10-13T14:11:00.000Z", "service": "resenas-criticas" }
```

### `GET /resenas/criticas`

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `resenaId` | string | sí | `RES<número>` |
| `productoId` | string | sí | `PRD<número>` |
| `nombreProducto` | string | nullable | `null` si MS-productos no conoce el producto |
| `puntaje` | integer | sí | 1 o 2 |
| `titulo` | string | nullable | |
| `comentario` | string | sí | Texto de la reseña |
| `fecha` | string (date) | sí | `YYYY-MM-DD` |

```json
[
  {
    "resenaId": "RES003",
    "productoId": "PRD007",
    "nombreProducto": "Licuadora Vortex 1200W",
    "puntaje": 2,
    "titulo": "Se calienta y hace ruido",
    "comentario": "A los pocos usos empezó a hacer ruido y a oler a quemado.",
    "fecha": "2026-08-30"
  }
]
```

### `GET /resenas/por-categoria`

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `categoriaId` | string | sí | `CAT<número>` |
| `puntajePromedio` | number | sí | Entre 1 y 5, redondeado a 2 decimales |
| `cantidadResenas` | integer | sí | Mayor a 0 |

MS-productos solo expone `categoriaId`, no el nombre de la categoría, por eso la respuesta no incluye `nombreCategoria`.

```json
[
  { "categoriaId": "CAT01", "puntajePromedio": 4.17, "cantidadResenas": 6 },
  { "categoriaId": "CAT02", "puntajePromedio": 4.07, "cantidadResenas": 15 }
]
```

### Errores

Si MS-productos o MS-resenas no responden en 5 segundos, devuelven un error o datos con formato inesperado, el servicio responde **502**:

```json
{
  "error": "upstream_unavailable",
  "message": "No se pudo conectar a ms-productos. Por favor reintenta en unos segundos.",
  "upstream": { "service": "ms-productos", "url": "https://ms-productos-1uz6.onrender.com", "status": 500 }
}
```

`upstream.status` aparece solo si se recibió una respuesta HTTP. Una ruta inexistente responde **404** con `{ "error": "not_found", "message": "..." }`.

## Ejemplos con curl

```bash
BASE=https://resenas-criticas.onrender.com

curl $BASE/health
curl $BASE/resenas/criticas
curl $BASE/resenas/por-categoria
```

## Ejecutar localmente

```bash
npm install
Z_URL=https://ms-productos-1uz6.onrender.com npm start
```

## Pruebas

```bash
npm test           # MS-productos y MS-resenas simulados con datos de la semilla (incluye fallas y timeout)
npm run test:real  # contra los servicios reales desplegados en Render
```
