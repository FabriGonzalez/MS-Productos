import express from 'express';
import { UpstreamError, fetchAllItems, isProducto, isResena } from './upstream.js';

const PUNTAJE_CRITICO = 2;

const round2 = (n) => Math.round(n * 100) / 100;

export function createApp({ productosUrl, resenasUrl, serviceName = 'resenas-criticas' }) {
  const app = express();
  app.disable('x-powered-by');

  const getProductos = () => fetchAllItems('ms-productos', productosUrl, isProducto);
  const getResenas = () => fetchAllItems('ms-resenas', resenasUrl, isResena);

  // No consulta upstreams: debe responder rápido para el panel de monitoreo.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: serviceName });
  });

  app.get('/resenas/criticas', async (req, res) => {
    const [resenas, productos] = await Promise.all([getResenas(), getProductos()]);
    const productosPorId = new Map(productos.map((p) => [p.id, p]));

    const criticas = resenas
      .filter((r) => r.puntaje <= PUNTAJE_CRITICO)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => ({
        resenaId: r.id,
        productoId: r.productoId,
        nombreProducto: productosPorId.get(r.productoId)?.nombre ?? null,
        puntaje: r.puntaje,
        titulo: r.titulo ?? null,
        comentario: r.texto,
        fecha: r.fecha.slice(0, 10),
      }));

    res.json(criticas);
  });

  app.get('/resenas/por-categoria', async (req, res) => {
    const [resenas, productos] = await Promise.all([getResenas(), getProductos()]);
    const categoriaPorProducto = new Map(productos.map((p) => [p.id, p.categoriaId]));

    const acumulado = new Map();
    for (const r of resenas) {
      const categoriaId = categoriaPorProducto.get(r.productoId);
      if (!categoriaId) continue; // reseña de un producto que MS-productos no conoce
      const a = acumulado.get(categoriaId) ?? { suma: 0, cantidad: 0 };
      a.suma += r.puntaje;
      a.cantidad += 1;
      acumulado.set(categoriaId, a);
    }

    const resultado = [...acumulado.entries()]
      .map(([categoriaId, { suma, cantidad }]) => ({
        categoriaId,
        puntajePromedio: round2(suma / cantidad),
        cantidadResenas: cantidad,
      }))
      .sort((a, b) => a.categoriaId.localeCompare(b.categoriaId));

    res.json(resultado);
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', message: `Ruta inexistente: ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof UpstreamError) {
      console.error(`Falla en ${err.service} (${err.url}): ${err.message}`);
      const upstream = { service: err.service, url: err.url };
      if (err.status !== undefined) upstream.status = err.status;
      return res.status(502).json({
        error: 'upstream_unavailable',
        message: `No se pudo conectar a ${err.service}. Por favor reintenta en unos segundos.`,
        upstream,
      });
    }
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: 'Error interno del servidor.' });
  });

  return app;
}
