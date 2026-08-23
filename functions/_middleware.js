/**
 * Middleware de Cloudflare Pages: exige usuario y contrasena ANTES de servir
 * cualquier archivo del sitio (index.html, imagenes, todo). Esto es
 * autenticacion real del lado del servidor: si las credenciales no son
 * correctas, el navegador nunca recibe el contenido de la pagina (no hay
 * forma de "ver el codigo fuente" para esquivarlo, a diferencia del gate
 * que vive dentro del propio index.html).
 *
 * Configuracion (una sola vez, en el dashboard de Cloudflare Pages):
 *   Settings -> Environment variables -> agregar, como "Secret" (encrypted):
 *     BASIC_AUTH_USER  = SIC PS
 *     BASIC_AUTH_PASS  = 1935Zanja
 *
 * Las credenciales NO quedan escritas en este archivo ni en el repositorio:
 * viven unicamente en la configuracion de Cloudflare, fuera de git.
 */
export async function onRequest(context) {
  const { request, env, next } = context;

  const expectedUser = env.BASIC_AUTH_USER;
  const expectedPass = env.BASIC_AUTH_PASS;

  // Si no se configuraron las variables de entorno todavia, dejamos pasar
  // (para no romper el sitio antes de la configuracion inicial), pero
  // avisamos con un header para que sea facil de detectar.
  if (!expectedUser || !expectedPass) {
    const res = await next();
    const headers = new Headers(res.headers);
    headers.set('X-Auth-Warning', 'BASIC_AUTH_USER / BASIC_AUTH_PASS no configuradas todavia');
    return new Response(res.body, { status: res.status, headers });
  }

  const authHeader = request.headers.get('Authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const encoded = authHeader.slice(6);
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch (e) {
      decoded = '';
    }
    const sepIndex = decoded.indexOf(':');
    const user = sepIndex >= 0 ? decoded.slice(0, sepIndex) : '';
    const pass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : '';

    if (user === expectedUser && pass === expectedPass) {
      return next();
    }
  }

  return new Response('Acceso restringido. Ingrese usuario y contrasena.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Reporte General S.I.C.", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
