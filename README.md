# Reporte General — S.I.C.

Dashboard de carga física (GPS) del plantel. Es un único archivo HTML
autocontenido (`index.html`): todos los datos, gráficos y escudos de los
clubes quedan incrustados adentro, no necesita backend ni base de datos para
funcionar.

Este repositorio está armado para que **vos puedas actualizar los datos sin
tocar código**: subís la planilla nueva, y un robot (GitHub Actions) reconstruye
y publica el reporte solo.

## Estructura del repositorio

```
data/SIC_Carga.xlsx        <- la planilla con los datos. ESTE es el archivo que actualizás vos.
template/template.html     <- el "esqueleto" del dashboard (HTML + CSS)
template/app.js             <- la lógica del dashboard (filtros, gráficos, etc.)
assets/                      <- escudos de los clubes, ya codificados, no hace falta tocarlos
scripts/build.py            <- script que arma el index.html final
.github/workflows/build.yml <- el robot que corre build.py automáticamente
index.html                   <- EL REPORTE PUBLICADO. Se genera solo, no lo edites a mano.
```

## Cómo actualizar los datos (esto es lo único que vas a hacer normalmente)

1. Entrá al repositorio en GitHub.
2. Andá a la carpeta `data/`.
3. Hacé clic en `SIC_Carga.xlsx` → botón **"..." → Upload files** (o directamente
   "Add file → Upload files" y arrastrás la planilla nueva con el mismo nombre,
   `SIC_Carga.xlsx`, para que reemplace a la anterior).
4. Confirmá el commit ("Commit changes").
5. Eso es todo. GitHub Actions se dispara solo, reprocesa la planilla y publica
   el `index.html` actualizado en 1–2 minutos. Podés ver el progreso en la
   pestaña **Actions** del repositorio (un tilde verde significa que terminó bien).
6. El link del dashboard **no cambia** — apenas termina el proceso, cualquiera
   que lo abra (o refresque la página) ve los datos nuevos.

No hace falta que sepas programar ni que abras ningún archivo de código para
este paso del día a día.

## Primera configuración (esto se hace una sola vez)

1. Creá un repositorio en GitHub y subí **todo** el contenido de esta carpeta
   (manteniendo la estructura de carpetas tal cual está).
2. Andá a **Settings → Pages**. En "Source" elegí **Deploy from a branch**,
   rama **main**, carpeta **/ (root)**, y guardá.
3. Andá a **Settings → Actions → General**, bajá hasta "Workflow permissions"
   y elegí **"Read and write permissions"**. Guardá. (Este paso es necesario
   para que el robot pueda publicar el `index.html` actualizado; si no lo
   hacés, el workflow va a fallar con un error de permisos.)
4. Listo. GitHub te va a mostrar la URL pública en Settings → Pages, con este
   formato: `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`

## Si alguna vez hay que tocar el diseño o la lógica

Eso sí requiere editar código (`template/template.html` o `template/app.js`).
Cualquier cambio ahí se aplica automáticamente la próxima vez que se
reconstruya el reporte (ya sea porque subiste una planilla nueva, o
disparando el workflow a mano desde la pestaña **Actions → Actualizar
reporte → Run workflow**).

## Correcciones de datos conocidas

El script `scripts/build.py` tiene una sección llamada `KNOWN_DATE_FIXES`
donde se corrige automáticamente el error de fecha de las actividades
"SIC #63" y "SIC #64" (que en la planilla original venían con el día y el
mes invertidos). Esto se vuelve a aplicar en cada actualización, así que no
hace falta corregirlo a mano cada vez — pero si en algún momento arreglan el
dato en el origen (Catapult/OpenField), pueden borrar esas líneas del
script.

## Publicar con acceso protegido de verdad (Cloudflare Pages, gratis)

`index.html` tiene una puerta de acceso propia (usuario/contraseña), pero es
del lado del cliente: quien mire el código fuente puede encontrarla. Para una
protección real (a nivel de servidor, imposible de esquivar viendo el
código), este repo incluye `functions/_middleware.js`, pensado para
[Cloudflare Pages](https://pages.cloudflare.com) (plan gratuito).

1. Creá una cuenta gratis en Cloudflare y andá a **Workers & Pages → Create → Pages → Connect to Git**.
2. Elegí este repositorio (`SIC-Rendimiento`).
3. En la configuración de build: **Build command** vacío (no hace falta build,
   `index.html` ya viene generado), **Build output directory**: `/` (la raíz).
4. Antes del primer deploy (o después, y volvés a desplegar), andá a
   **Settings → Environment variables** del proyecto y agregá, como
   **Secret** (encrypted):
   - `BASIC_AUTH_USER` = el usuario que quieras
   - `BASIC_AUTH_PASS` = la contraseña que quieras
5. Desplegá. Cloudflare te da una URL del tipo
   `https://sic-rendimiento.pages.dev` — al entrar, el navegador va a pedir
   usuario y contraseña con el cartel nativo del sistema, **antes** de
   entregar ningún archivo del sitio.

Este mecanismo es independiente del gate que ya tiene `index.html`: podés
mantener las dos cosas (defensa en profundidad) o dejar el gate del
`index.html` solo como cosmético si confiás en la protección de Cloudflare.

## Notas técnicas

- El reporte carga dos librerías externas desde una CDN (Chart.js y
  SheetJS/xlsx) — se necesita conexión a internet para verlo.
- La planilla Excel pesa varios MB; git la va a guardar en el historial del
  repositorio cada vez que se actualice, así que el repositorio va a crecer
  con el tiempo. Si en algún momento se vuelve un problema, se puede migrar
  ese archivo a [Git LFS](https://git-lfs.com/).
- El botón **"Actualizar datos"** que tiene el dashboard adentro (para subir
  un Excel desde el navegador) sigue funcionando, pero es solo una vista
  previa personal en esa sesión del navegador — no publica nada ni afecta lo
  que ven los demás. Para que el cambio quede visible para todos, el camino
  es el de este README (subir el Excel a `data/SIC_Carga.xlsx`).
