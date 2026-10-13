const TIMEOUT_MS = 5000;
const PAGE_SIZE = 100;

export class UpstreamError extends Error {
  constructor(service, url, status, detail) {
    super(detail);
    this.service = service;
    this.url = url;
    this.status = status;
  }
}

async function getJson(service, baseUrl, path) {
  let res;
  try {
    res = await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new UpstreamError(service, baseUrl, undefined, err.name === 'TimeoutError' ? 'timeout' : err.message);
  }
  if (!res.ok) {
    throw new UpstreamError(service, baseUrl, res.status, `HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new UpstreamError(service, baseUrl, res.status, 'respuesta no es JSON');
  }
}

/**
 * Trae todos los elementos de un servicio con el contrato común (GET /items paginado)
 * y valida cada uno con `validate`. Cualquier dato inesperado se trata como falla del upstream.
 */
export async function fetchAllItems(service, baseUrl, validate) {
  const items = [];
  let offset = 0;
  for (;;) {
    const page = await getJson(service, baseUrl, `items?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!page || !Array.isArray(page.items) || !Number.isInteger(page.total)) {
      throw new UpstreamError(service, baseUrl, 200, 'formato de /items inválido');
    }
    for (const item of page.items) {
      if (!validate(item)) {
        throw new UpstreamError(service, baseUrl, 200, `elemento inválido: ${JSON.stringify(item)}`);
      }
      items.push(item);
    }
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return items;
  }
}

const isString = (v) => typeof v === 'string' && v.length > 0;

export const isProducto = (p) =>
  p !== null && typeof p === 'object' && isString(p.id) && isString(p.nombre) && isString(p.categoriaId);

export const isResena = (r) =>
  r !== null &&
  typeof r === 'object' &&
  isString(r.id) &&
  isString(r.productoId) &&
  Number.isInteger(r.puntaje) &&
  typeof r.texto === 'string' &&
  isString(r.fecha);
