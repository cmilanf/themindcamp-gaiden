/* Pequeños ayudantes para construir salida HTML de la terminal
   (necesaria cuando queremos elementos clicables o imágenes). */

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sp(cls, text) {
  return `<span class="${cls}">${esc(text)}</span>`;
}

/** Texto clicable que ejecuta un comando al pulsarlo o con Enter. */
export function act(cmd, cls, text, title = "") {
  return (
    `<span class="act ${cls}" data-cmd="${esc(cmd)}" role="link" tabindex="0"` +
    (title ? ` title="${esc(title)}"` : "") +
    `>${esc(text)}</span>`
  );
}

export function pad(n) {
  return n > 0 ? " ".repeat(n) : "";
}

/** Distribuye items en columnas al estilo `ls` (relleno por columnas). */
export function columns(items, cols, gap = 2) {
  const width = Math.max(...items.map((i) => i.len), 1) + gap;
  const perRow = Math.max(1, Math.floor(cols / width));
  const rows = Math.ceil(items.length / perRow);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < perRow; c++) {
      const idx = c * rows + r;
      if (idx >= items.length) continue;
      const it = items[idx];
      line += it.html + pad(width - it.len);
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines;
}

/** Marco de imagen con nombre de fichero, como un visor de terminal. */
export function imageFrame({ url, caption = "", alt = "", link = "" }) {
  const img = `<img src="${esc(url)}" alt="${esc(alt || caption)}" loading="lazy" decoding="async">`;
  const inner = link
    ? `<a href="${esc(link)}" target="_blank" rel="noopener">${img}</a>`
    : `<span class="imgwrap">${img}</span>`;
  const cap = caption
    ? `<figcaption><b>${esc(url.replace(/^\//, ""))}</b> — ${esc(caption)}</figcaption>`
    : `<figcaption><b>${esc(url.replace(/^\//, ""))}</b></figcaption>`;
  return `<figure class="imgframe">${inner}${cap}</figure>`;
}
