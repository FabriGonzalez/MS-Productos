import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

// Subconjunto de la semilla del kit.
const PRODUCTOS = [
  { id: 'PRD001', nombre: 'Smartphone Nova X1 128GB', categoriaId: 'CAT02', marca: 'Nova', precio: 450000 },
  { id: 'PRD005', nombre: 'Auriculares Bluetooth Sonar', categoriaId: 'CAT01', marca: 'Sonar', precio: 65000 },
  { id: 'PRD007', nombre: 'Licuadora Vortex 1200W', categoriaId: 'CAT05', marca: 'Vortex', precio: 54000 },
];

const RESENAS = [
  { id: 'RES001', productoId: 'PRD001', clienteId: 'CLI001', puntaje: 5, titulo: 'Excelente equipo', texto: 'La cámara y la batería superaron mis expectativas.', fecha: '2026-08-20T18:00:00Z' },
  { id: 'RES002', productoId: 'PRD005', clienteId: 'CLI002', puntaje: 4, titulo: 'Buen sonido', texto: 'Cancelan bien el ruido.', fecha: '2026-08-28T20:10:00Z' },
  { id: 'RES003', productoId: 'PRD007', clienteId: 'CLI002', puntaje: 2, titulo: 'Se calienta y hace ruido', texto: 'A los pocos usos empezó a hacer ruido y a oler a quemado.', fecha: '2026-08-30T09:30:00Z' },
  { id: 'RES004', productoId: 'PRD001', clienteId: 'CLI003', puntaje: 1, titulo: 'Malo', texto: 'Se apagó solo.', fecha: '2026-09-01T10:00:00Z' },
];

// Servidor que imita el contrato común (GET /items paginado). `mode` permite simular fallas.
function mockService(data) {
  const state = { mode: 'ok' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (state.mode === 'hang') return; // nunca responde
    if (state.mode === 'error') {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end('{"error":"boom"}');
    }
    if (url.pathname !== '/items') {
      res.writeHead(404);
      return res.end();
    }
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const items = state.mode === 'invalid' ? [{ id: 123 }] : data.slice(offset, offset + limit);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ items, total: data.length, limit, offset }));
  });
  return { server, state };
}

const listen = (server) =>
  new Promise((resolve) => server.listen(0, () => resolve(`http://localhost:${server.address().port}/`)));

describe('resenas-criticas con MS-productos simulado', () => {
  const productos = mockService(PRODUCTOS);
  const resenas = mockService(RESENAS);
  let app;
  let base;

  before(async () => {
    const productosUrl = await listen(productos.server);
    const resenasUrl = await listen(resenas.server);
    app = createApp({ productosUrl, resenasUrl }).listen(0);
    base = `http://localhost:${app.address().port}`;
  });

  after(() => {
    app.close();
    productos.server.closeAllConnections();
    productos.server.close();
    resenas.server.close();
  });

  const get = async (path) => {
    const res = await fetch(base + path);
    return { status: res.status, body: await res.json() };
  };

  test('GET /health responde ok', async () => {
    const { status, body } = await get('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'resenas-criticas');
    assert.ok(body.timestamp);
  });

  test('GET /resenas/criticas devuelve puntaje <= 2 con nombre del producto', async () => {
    const { status, body } = await get('/resenas/criticas');
    assert.equal(status, 200);
    assert.deepEqual(body.map((r) => r.resenaId), ['RES003', 'RES004']);
    assert.deepEqual(body[0], {
      resenaId: 'RES003',
      productoId: 'PRD007',
      nombreProducto: 'Licuadora Vortex 1200W',
      puntaje: 2,
      titulo: 'Se calienta y hace ruido',
      comentario: 'A los pocos usos empezó a hacer ruido y a oler a quemado.',
      fecha: '2026-08-30',
    });
  });

  test('GET /resenas/por-categoria agrupa por categoriaId', async () => {
    const { status, body } = await get('/resenas/por-categoria');
    assert.equal(status, 200);
    assert.deepEqual(body, [
      { categoriaId: 'CAT01', puntajePromedio: 4, cantidadResenas: 1 },
      { categoriaId: 'CAT02', puntajePromedio: 3, cantidadResenas: 2 },
      { categoriaId: 'CAT05', puntajePromedio: 2, cantidadResenas: 1 },
    ]);
  });

  test('ruta inexistente responde 404', async () => {
    const { status, body } = await get('/resenas/NOEXISTE');
    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });

  test('MS-productos con error 500 -> 502', async () => {
    productos.state.mode = 'error';
    try {
      const { status, body } = await get('/resenas/criticas');
      assert.equal(status, 502);
      assert.equal(body.error, 'upstream_unavailable');
      assert.equal(body.upstream.service, 'ms-productos');
      assert.equal(body.upstream.status, 500);
    } finally {
      productos.state.mode = 'ok';
    }
  });

  test('MS-productos con datos inválidos -> 502', async () => {
    productos.state.mode = 'invalid';
    try {
      const { status, body } = await get('/resenas/por-categoria');
      assert.equal(status, 502);
      assert.equal(body.error, 'upstream_unavailable');
    } finally {
      productos.state.mode = 'ok';
    }
  });

  test('MS-productos que no responde -> 502 en ~5 s', async () => {
    productos.state.mode = 'hang';
    try {
      const inicio = Date.now();
      const { status, body } = await get('/resenas/criticas');
      const duracion = Date.now() - inicio;
      assert.equal(status, 502);
      assert.equal(body.error, 'upstream_unavailable');
      assert.ok(duracion >= 4900 && duracion < 6500, `tardó ${duracion} ms`);
    } finally {
      productos.state.mode = 'ok';
    }
  });
});
