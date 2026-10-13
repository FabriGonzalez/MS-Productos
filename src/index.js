import { createApp } from './app.js';

const productosUrl = process.env.Z_URL;
const resenasUrl = process.env.RESENAS_URL || 'https://resenas-service.onrender.com';

if (!productosUrl) {
  console.error('Falta la variable de entorno Z_URL (URL de MS-productos).');
  process.exit(1);
}

const app = createApp({ productosUrl, resenasUrl, serviceName: process.env.SERVICE_NAME });
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`resenas-criticas escuchando en http://localhost:${port}`);
  console.log(`  Z_URL (MS-productos): ${productosUrl}`);
  console.log(`  RESENAS_URL (MS-resenas): ${resenasUrl}`);
});
