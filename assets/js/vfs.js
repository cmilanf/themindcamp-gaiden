/* Sistema de ficheros virtual construido a partir del payload que genera Hugo.
   Las secciones son "binarios" ejecutables en el home; el contenido detallado
   vive en directorios .d al estilo de /etc/*.d */

const MODE_DIR = "drwxr-xr-x";
const MODE_EXE = "-rwxr-xr-x";
const MODE_FILE = "-rw-r--r--";

function dir(name, mtime) {
  return { name, type: "dir", mode: MODE_DIR, size: 4096, mtime, children: new Map() };
}

function add(parent, node) {
  parent.children.set(node.name, node);
  return node;
}

export function buildFS(payload) {
  const site = payload.site;
  const stamp = site.stamp || site.buildDate || "";
  const home = `/home/${site.user}`;

  const root = dir("/", stamp);
  const homeParent = add(add(root, dir("home", stamp)), dir(site.user, stamp));

  // --- Binarios: una sección = un ejecutable -------------------------------
  for (const s of payload.sections) {
    add(homeParent, {
      name: s.slug,
      type: "exe",
      mode: MODE_EXE,
      size: s.size,
      mtime: s.mtime,
      section: s,
    });
  }

  // --- ponentes.d ---------------------------------------------------------
  const pd = add(homeParent, dir("ponentes.d", stamp));
  for (const p of payload.speakers) {
    add(pd, {
      name: `${p.slug}.md`,
      type: "file",
      mode: MODE_FILE,
      size: p.size,
      mtime: p.mtime,
      raw: p.raw,
      speaker: p,
    });
  }

  // --- agenda.d ----------------------------------------------------------
  const ad = add(homeParent, dir("agenda.d", stamp));
  for (const s of payload.agenda) {
    add(ad, {
      name: `${s.slug}.md`,
      type: "file",
      mode: MODE_FILE,
      size: s.size,
      mtime: s.mtime,
      raw: s.raw,
      session: s,
    });
  }

  // --- docs.d ------------------------------------------------------------
  const dd = add(homeParent, dir("docs.d", stamp));
  for (const d of payload.docs || []) {
    add(dd, {
      name: d.name,
      type: "pdf",
      mode: MODE_FILE,
      size: d.size,
      mtime: d.mtime || stamp,
      url: d.url,
    });
  }

  // --- res: imágenes ------------------------------------------------------
  const res = add(homeParent, dir("res", stamp));
  for (const img of payload.images || []) {
    const parts = img.url.replace(/^\/res\//, "").split("/");
    let cur = res;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur.children.has(parts[i])) add(cur, dir(parts[i], stamp));
      cur = cur.children.get(parts[i]);
    }
    add(cur, {
      name: parts[parts.length - 1],
      type: "image",
      mode: MODE_FILE,
      size: img.size || 0,
      mtime: stamp,
      url: img.url,
      alt: img.alt || "",
    });
  }

  // --- ficheros sueltos del home -----------------------------------------
  add(homeParent, {
    name: "README.md",
    type: "file",
    mode: MODE_FILE,
    mtime: stamp,
    raw: readme(site),
  });
  add(homeParent, {
    name: ".mcshrc",
    type: "file",
    mode: MODE_FILE,
    mtime: stamp,
    raw: mcshrc(site),
  });

  for (const n of walk(root)) {
    if (n.type !== "dir" && !n.size) n.size = (n.raw || "").length || 1024;
  }

  return { root, home };
}

function readme(site) {
  return `# ${site.title}

${site.tagline}

    Fechas ....: ${site.datesHuman}
    Lugar .....: ${site.venue}
    Dirección .: ${site.address}
    Precio ....: ${site.price}

Esta web es una terminal. Comandos útiles:

    ls              lista las secciones disponibles
    ./acerca-de     ejecuta una sección (el ./ es opcional)
    help            manual de la consola
    theme list      cambia la paleta de colores

El contenido vive en ficheros markdown dentro del repositorio, así que
'cat ponentes.d/carlos-milan.md' te enseña exactamente la misma fuente que
edita la organización.
`;
}

function mcshrc(site) {
  return `# ~/.mcshrc — se lee al arrancar la sesión
export PS1='\\u@\\h:\\w\\$ '
export EDITOR=vim
export MINDCAMP_EDITION=${site.edition}
export MINDCAMP_CODENAME=${site.editionName}
export TERM=xterm-256color

alias ll='ls -l'
alias la='ls -la'
alias agenda='./agenda'
alias ponentes='./ponentes'

# Nunca hagas esto en un evento con 30 informáticos alrededor:
# alias sudo='sudo rm -rf --no-preserve-root /'
`;
}

export function* walk(node) {
  yield node;
  if (node.type === "dir") {
    for (const child of node.children.values()) yield* walk(child);
  }
}

/** Normaliza una ruta (absoluta o relativa) a un array de segmentos. */
export function resolveSegments(path, cwd, home) {
  let p = String(path || "").trim();
  if (p === "~" || p.startsWith("~/")) p = home + p.slice(1);
  const base = p.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  const segs = base.slice();
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segs.pop();
    else segs.push(part);
  }
  return segs;
}

export function segmentsToPath(segs) {
  return "/" + segs.join("/");
}

/** Devuelve el nodo de una ruta, o null si no existe. */
export function lookup(fs, path, cwd) {
  const segs = resolveSegments(path, cwd, fs.home);
  let node = fs.root;
  for (const s of segs) {
    if (node.type !== "dir") return null;
    node = node.children.get(s);
    if (!node) return null;
  }
  return node;
}

export function dirname(path) {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function prettyPath(path, home) {
  if (path === home) return "~";
  if (path.startsWith(home + "/")) return "~" + path.slice(home.length);
  return path;
}

export function humanSize(n) {
  if (n < 1024) return String(n);
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1024 / 1024).toFixed(1).replace(/\.0$/, "") + "M";
}
