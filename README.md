# The MindCamp Gaiden — web-consola

Sitio estático del evento **The MindCamp Gaiden**. La web se presenta como
una terminal tipo bash con colores ANSI: se navega escribiendo comandos o
pinchando en la barra superior estilo `vim-airline`.

Todo el contenido vive en ficheros markdown. Hugo los compila a un payload JSON
que se incrusta en `index.html`, y el cliente (JavaScript puro, sin frameworks
ni dependencias npm) lo renderiza dentro de la consola.

## Requisitos

Solo [Hugo extended](https://gohugo.io/installation/) (≥ 0.146). El bundle de
JavaScript se construye con el esbuild que Hugo trae dentro, así que **no hay
`package.json` ni `node_modules`**.

```bash
hugo server -D     # desarrollo en http://localhost:1313
hugo               # build de producción en public/
```

Tras clonar, activa el hook de pre-commit una vez:

```bash
git config core.hooksPath .githooks
```

Rechaza claves privadas, ficheros `.env` y salida de build (`public/`,
`resources/`) forzada con `git add -f`, y si tienes `gitleaks` instalado repite
en local el escaneo que hace CI.

## Cómo editar el contenido

| Qué quieres cambiar        | Dónde                                     |
| -------------------------- | ----------------------------------------- |
| Secciones (= "binarios")   | `content/sections/*.md`                   |
| Ponentes                   | `content/ponentes/*.md`                   |
| Sesiones de la agenda      | `content/agenda/*.md`                      |
| Fechas, lugar, precio, etc.| `[params]` en `hugo.toml`                 |
| Imágenes y documentos      | `assets/res/`, `assets/docs/`             |

### Secciones

Cada fichero en `content/sections/` se convierte en un ejecutable del home, o
sea, en un comando de la consola. El nombre del fichero es el nombre del
comando (`acerca-de.md` → `./acerca-de`).

```yaml
---
title: "Acerca de"          # título que se imprime
summary: "¿Qué es esto?"    # descripción en `ls -l` y en `help`
weight: 10                  # orden en `ls` y en el menú
generator: "agenda"         # opcional: agenda | speakers
---
```

`generator` añade contenido calculado detrás del cuerpo markdown: el listado de
la agenda o la lista de ponentes.

### Ponentes

```yaml
---
title: "Carlos Milán"
role: "Principal Solutions Architect"
company: "AWS"
photo: "/res/speakers/carlos.jpg"
twitter: "cmilanf"          # opcional, sin la arroba
web: "https://calnus.com/"  # opcional
weight: 10
---
```

El nombre del fichero es el identificador que se usa en `ponentes <id>` y en el
campo `speakers` de las sesiones.

### Sesiones de la agenda

Una sesión por fichero. Se agrupan por `day` y se ordenan por `weight` (no por
la hora, para que las charlas de después de medianoche sigan cayendo en la
noche del día anterior).

```yaml
---
title: "Fabricando agentes autónomos con gym-retro"
day: 1                      # 1, 2, 3 → ver [[params.days]] en hugo.toml
time: "00:00"
weight: 50
tipo: "charla"              # ver tabla de códigos
speakers: ["kartones"]      # ids de content/ponentes/
image: "/res/antena.jpg"    # opcional: miniatura si la sesión no tiene ponente
imageCaption: "MDSCC"       # opcional: pie de esa miniatura
---
```

`tipo` en lugar de `kind` porque `kind` es una clave reservada de Hugo. Cada
valor se pinta como una letra entre corchetes en el listado de la agenda:

| `tipo`     | Código | Significado                      |
| ---------- | ------ | -------------------------------- |
| `keynote`  | `[K]`  | keynote                          |
| `charla`   | `[C]`  | charla                           |
| `descanso` | `[D]`  | desayuno, comida, cena, café...  |
| `ocio`     | `[F]`  | free-for-all / networking        |
| `registro` | `[R]`  | registro                         |
| `visita`   | `[V]`  | visita                           |
| `cierre`   | `[X]`  | cierre                           |

Se aceptan sinónimos (`comida`, `cafe`, `cena` → `descanso`; `networking` →
`ocio`). Los ponentes de cada slot se muestran con su foto en miniatura.

Los días y sus etiquetas se definen en `hugo.toml`:

```toml
[[params.days]]
  n = 1
  label = 'Viernes (noche)'
```

Mientras las fechas no estén confirmadas, `startDate`/`endDate` se dejan vacíos
y `datesHuman` dice «Fechas por confirmar»: la cuenta atrás (`countdown`,
`uptime` y el bloque del logo) se desactiva sola. En cuanto se cierre el fin de
semana basta con rellenar los tres parámetros y las etiquetas de `params.days`.
Para esta edición ya están cerradas: 27-29 de noviembre de 2026.

## Cómo funciona la consola

```
assets/js/
  main.js       arranque y enrutado por hash (#agenda ejecuta ./agenda)
  terminal.js   motor: prompt, historial, completado con Tab, ejecución
  ansi.js       parser de escapes ANSI (SGR) → HTML con la paleta activa
  vfs.js        sistema de ficheros virtual construido desde el payload
  commands.js   comandos de shell, sistema y easter eggs
  content.js    renderizado de secciones, agenda y ponentes
  logo.js       logo ANSI estilo `linuxlogo` + datos del "sistema"
  boot.js       secuencia de arranque y MOTD
  airline.js    barra superior con el menú de secciones
assets/css/terminal.css   paletas de 16 colores y chrome de la terminal
layouts/partials/payload.html   markdown → JSON que consume el cliente
```

Detalles útiles:

- **Rutas compartibles**: `https://…/#agenda` ejecuta el comando al cargar.
- **Paletas**: `theme list` → `tty` (por defecto: fondo negro, texto blanco y
  acentos azul/verde/amarillo/naranja/rojo/morado), gruvbox, dracula, matrix,
  amber, solarized, c64. La elección se recuerda en `localStorage`; el valor
  inicial es `params.defaultTheme` en `hugo.toml`.
- **`reboot`** (alias `home`, `inicio`, `init`) reinicia la sesión y vuelve a la
  pantalla de bienvenida sin recargar la página. El bloque `⑂ main` de la
  esquina superior izquierda de la barra hace lo mismo.
- **`tty web` / `tty term`** decide cómo se desplaza la consola al ejecutar un
  comando:
  - `web` (por defecto, `params.defaultTTY`): deja arriba la línea del comando,
    de forma que la salida se lee como un documento y el usuario baja a su
    ritmo. En cuanto se teclea algo, la vista salta al prompt.
  - `term`: persigue el final de la salida, como una terminal de verdad.
- **`reset`** borra los ajustes guardados en el navegador (paleta, CRT, modo tty
  e historial) previa confirmación `[s/N]`. Se cancela con `n` o con
  <kbd>Ctrl</kbd>+<kbd>C</kbd>.
- **Versión del sitio**: `params.version` alimenta el kernel (`mcg 1.0`), la
  shell (`mcsh 1.0`) y `uname -r`.
- La línea *Conexión* del `neofetch` no inventa el servidor: usa
  `PerformanceNavigationTiming.nextHopProtocol` y el esquema de la URL, que es
  lo único que el cliente sabe de verdad del transporte.
- **Sin JavaScript**: la página incluye un `<noscript>` con todo el contenido en
  HTML plano, para buscadores y lectores de pantalla que lo necesiten.
- **Imágenes**: se muestran como salida de comando (`imgcat`, `ponentes <id>`,
  `map`) con un marco que indica el nombre del fichero.

## Añadir un comando nuevo

En `assets/js/commands.js`:

```js
term.register({
  name: "wifi",
  group: "sistema",
  usage: "wifi",
  desc: "Credenciales de la red de la casa",
  run: (args, t) => t.write("SSID: mindcamp  ·  clave: pregunta-a-la-organizacion"),
});
```

Si en vez de un comando quieres una sección de contenido, casi siempre basta con
crear un markdown en `content/sections/`.

## Despliegue

Cada push a `main` ejecuta `.github/workflows/release.yml`. El workflow instala
Hugo extended 0.164.0, genera el sitio en `public/`, comprueba que exista
`public/index.html` y copia el contenido por SCP al alojamiento estático.

Configura estos secretos en **Settings → Secrets and variables → Actions**:

| Secreto        | Contenido                                                   |
| -------------- | ----------------------------------------------------------- |
| `SCP_HOST`        | Nombre o dirección del servidor                             |
| `SCP_PORT`        | Puerto SSH; opcional, utiliza `22` si no está configurado   |
| `SCP_USER`        | Usuario SSH                                                 |
| `SCP_PATH`        | Directorio remoto dedicado al sitio publicado               |
| `SCP_PASSWORD`    | Contraseña SSH; necesaria si no se configura `SCP_KEY`      |
| `SCP_KEY`         | Clave privada SSH; necesaria si no se configura contraseña  |
| `SCP_FINGERPRINT` | Huella SHA256 del host SSH; opcional pero recomendada        |

Hay que configurar al menos uno de `SCP_KEY` y `SCP_PASSWORD`. Si ambos están
presentes, `SCP_KEY` tiene precedencia y el workflow no entrega la contraseña a
la action de SCP. La clave debe contener el texto completo de la clave privada,
incluidas sus líneas `BEGIN` y `END`.

`SCP_FINGERPRINT` es opcional. Si está configurado, la action verifica que la
huella SHA256 presentada por el servidor SSH coincida antes de transferir los
ficheros; si está vacío, se omite esa verificación.

El directorio indicado por `SCP_PATH` debe estar dedicado exclusivamente a
este sitio, y `SCP_USER` debe poder eliminarlo y volver a crearlo. La opción
`rm: true` elimina recursivamente el destino antes de cada subida para que no
queden ficheros obsoletos. El workflow rechaza valores vacíos o rutas raíz
obvias, pero una ruta válida mal configurada todavía podría borrar otros
ficheros remotos.

Las actions están fijadas a commits completos y el token automático del
workflow solo tiene permiso de lectura sobre el contenido del repositorio. La
versión que muestra la consola combina `params.version` con el SHA corto del
commit desplegado, por ejemplo `1.0+a1b2c3d`.

### Desarrollo en local

```bash
hugo server -D          # http://localhost:1313, recarga en caliente
hugo                    # build de producción en public/
```

### Imagen Docker opcional

`Dockerfile` y `compose.yaml` permiten construir una imagen autocontenida para
pruebas locales o para quien prefiera alojarla de forma independiente. No forman
parte del workflow de publicación por SCP.

```bash
docker compose up -d --build   # http://localhost:8080
docker compose down
```

La imagen compila el sitio con Hugo y sirve los ficheros estáticos con Nginx,
usando el `nginx.conf` de este repositorio en vez de la configuración por
defecto de la imagen. No incluye backend ni endpoint de identificación del
visitante; la única diferencia respecto al Nginx estándar son las cabeceras de
seguridad descritas a continuación.

## HTTP security headers

El sitio es completamente estático: una sola página HTML, CSS y JS con hash
(`fingerprint`) e integridad (SRI) en `home.html`, sin formularios, sin
`fetch`/`XHR`, y sin contenido de terceros embebido (los enlaces a GitHub,
Twitter y YouTube abren en pestaña nueva, nunca en un `<iframe>`). Eso permite
una política de cabeceras estricta.

`nginx.conf` la aplica para la imagen Docker opcional. **El despliegue de
producción no pasa por esa imagen** (ver "Despliegue" más arriba): sube los
ficheros estáticos por SCP a un alojamiento externo, así que estas cabeceras
hay que replicarlas en la configuración del servidor web o proxy que sirva
`themindcamp.net` de verdad.

| Cabecera                     | Valor                                                                                                                                                                                                                                | Por qué |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `Content-Security-Policy`     | `default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; upgrade-insecure-requests` | Todo se sirve desde `'self'`; no hace falta `unsafe-inline` en `script-src` porque el JS se carga como fichero con SRI. `style-src-attr 'unsafe-inline'` es necesario porque `assets/js/ansi.js` escribe atributos `style="color:...;background:..."` en línea para los colores ANSI de 256/RGB que quedan fuera de las 16 clases CSS de la paleta. |
| `Strict-Transport-Security`   | `max-age=63072000; includeSubDomains`                                                                                                                                                                                                | Fuerza HTTPS en visitas futuras. Se omite `preload` a propósito: es un compromiso de todo el dominio difícil de revertir; añádelo aparte solo si tienes claro que todos los subdominios serán siempre HTTPS. |
| `X-Content-Type-Options`      | `nosniff`                                                                                                                                                                                                                            | Evita que el navegador reinterprete el tipo MIME de un fichero servido. |
| `X-Frame-Options`             | `DENY`                                                                                                                                                                                                                               | Nada en el sitio necesita ser embebido en un `<iframe>` de otro dominio. |
| `Referrer-Policy`             | `strict-origin-when-cross-origin`                                                                                                                                                                                                   | No filtra la ruta completa al navegar a un dominio externo. |
| `Permissions-Policy`          | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`                                                                                                                                                  | Desactiva APIs de navegador que el sitio no usa. |
| `Cross-Origin-Opener-Policy`  | `same-origin`                                                                                                                                                                                                                        | Aísla la ventana de `window.opener` de otros orígenes. |
| `Cross-Origin-Resource-Policy`| `same-origin`                                                                                                                                                                                                                        | Impide que otros orígenes carguen los recursos del sitio (imágenes, CSS, JS). |

Cabeceras que se evitan a propósito:

- `X-XSS-Protection`: obsoleta, sustituida por CSP y puede introducir
  problemas en navegadores antiguos; se omite en vez de fijarla a `0`.
- `Cross-Origin-Embedder-Policy`: nada en el sitio necesita aislamiento de
  origen cruzado (`SharedArrayBuffer`, etc.) y podría romper la carga de la
  imagen `og-preview.png` u otros recursos si se configura mal.
