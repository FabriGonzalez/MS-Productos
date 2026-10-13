import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

// Prueba contra los servicios reales desplegados en Render.
// Si están dormidos, conviene despertarlos antes (abrir /health) porque el timeout es de 5 s.
const productosUrl = process.env.Z_URL || 'https://ms-productos-1uz6.onrender.com';
const resenasUrl = process.env.RESENAS_URL || 'https://resenas-service.onrender.com';

describe('resenas-criticas contra MS-productos real', () => {
  let app;
  let base;

  before(async () => {
    // Despierta los servicios de Render (sin el límite de 5 s).
    await Promise.all([fetch(new URL('health', productosUrl)), fetch(new URL('health', resenasUrl))]);
    app = createApp({ productosUrl, resenasUrl }).listen(0);
    base = `http://localhost:${app.address().port}`;
  });

  after(() => app.close());

  test('RES003 aparece como crítica con el nombre del producto', async () => {
    const res = await fetch(`${base}/resenas/criticas`);
    assert.equal(res.status, 200);
    const body = await res.json();
    const res003 = body.find((r) => r.resenaId === 'RES003');
    assert.ok(res003, 'RES003 no está en la respuesta');
    assert.equal(res003.productoId, 'PRD007');
    assert.equal(res003.nombreProducto, 'Licuadora Vortex 1200W');
    assert.ok(body.every((r) => r.puntaje <= 2 && r.nombreProducto));
  });

  test('por-categoria devuelve promedios entre 1 y 5', async () => {
    const res = await fetch(`${base}/resenas/por-categoria`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.length > 0);
    for (const c of body) {
      assert.match(c.categoriaId, /^CAT\d+$/);
      assert.ok(c.puntajePromedio >= 1 && c.puntajePromedio <= 5);
      assert.ok(c.cantidadResenas > 0);
    }
  });
});
