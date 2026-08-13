/* Conversión de secuencias de escape ANSI (SGR) a HTML.
   Soporta: reset, negrita, atenuado, cursiva, subrayado, inverso,
   colores 30-37 / 90-97 / 40-47 / 100-107 y 38;5;n / 48;5;n. */

export const ESC = "\u001b";

/** Códigos SGR listos para interpolar en plantillas de texto. */
export const A = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  italic: `${ESC}[3m`,
  under: `${ESC}[4m`,
  rev: `${ESC}[7m`,
  black: `${ESC}[30m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  blue: `${ESC}[34m`,
  magenta: `${ESC}[35m`,
  cyan: `${ESC}[36m`,
  white: `${ESC}[37m`,
  gray: `${ESC}[90m`,
  bred: `${ESC}[91m`,
  bgreen: `${ESC}[92m`,
  byellow: `${ESC}[93m`,
  bblue: `${ESC}[94m`,
  bmagenta: `${ESC}[95m`,
  bcyan: `${ESC}[96m`,
  bwhite: `${ESC}[97m`,
  onblack: `${ESC}[40m`,
  onred: `${ESC}[41m`,
  ongreen: `${ESC}[42m`,
  onyellow: `${ESC}[43m`,
  onblue: `${ESC}[44m`,
  onmagenta: `${ESC}[45m`,
  oncyan: `${ESC}[46m`,
  onwhite: `${ESC}[47m`,
};

/** Envuelve `text` entre uno o varios códigos y un reset. */
export function paint(codes, text) {
  return `${Array.isArray(codes) ? codes.join("") : codes}${text}${A.reset}`;
}

export function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Longitud visible de una cadena, ignorando los escapes ANSI. */
export function visibleLength(s) {
  return stripAnsi(s).length;
}

export function stripAnsi(s) {
  return String(s).replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}

/** Rellena a la derecha teniendo en cuenta los escapes ANSI. */
export function padEndAnsi(s, width, fill = " ") {
  const len = visibleLength(s);
  return len >= width ? s : s + fill.repeat(width - len);
}

export function padStartAnsi(s, width, fill = " ") {
  const len = visibleLength(s);
  return len >= width ? s : fill.repeat(width - len) + s;
}

const XTERM_STEPS = [0, 95, 135, 175, 215, 255];

function xterm256(n) {
  if (n < 16) return null; // se resuelve con las clases de la paleta
  if (n < 232) {
    const i = n - 16;
    const r = XTERM_STEPS[Math.floor(i / 36) % 6];
    const g = XTERM_STEPS[Math.floor(i / 6) % 6];
    const b = XTERM_STEPS[i % 6];
    return `rgb(${r},${g},${b})`;
  }
  const v = 8 + (n - 232) * 10;
  return `rgb(${v},${v},${v})`;
}

function emptyState() {
  return { fg: null, bg: null, fgRGB: null, bgRGB: null, bold: false, dim: false, italic: false, under: false, rev: false };
}

function isPlain(st) {
  return (
    st.fg === null && st.bg === null && st.fgRGB === null && st.bgRGB === null &&
    !st.bold && !st.dim && !st.italic && !st.under && !st.rev
  );
}

function openTag(st) {
  const cls = [];
  const style = [];
  if (st.fg !== null) cls.push(`f${st.fg}`);
  if (st.bg !== null) cls.push(`b${st.bg}`);
  if (st.fgRGB) style.push(`color:${st.fgRGB}`);
  if (st.bgRGB) style.push(`background:${st.bgRGB}`);
  if (st.bold) cls.push("bo");
  if (st.dim) cls.push("dm");
  if (st.italic) cls.push("it");
  if (st.under) cls.push("un");
  if (st.rev) cls.push("rv");
  const c = cls.length ? ` class="${cls.join(" ")}"` : "";
  const s = style.length ? ` style="${style.join(";")}"` : "";
  return `<span${c}${s}>`;
}

function applySGR(st, params) {
  const nums = params === "" ? [0] : params.split(";").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (n === 0) {
      Object.assign(st, emptyState());
    } else if (n === 1) st.bold = true;
    else if (n === 2) st.dim = true;
    else if (n === 3) st.italic = true;
    else if (n === 4) st.under = true;
    else if (n === 7) st.rev = true;
    else if (n === 22) { st.bold = false; st.dim = false; }
    else if (n === 23) st.italic = false;
    else if (n === 24) st.under = false;
    else if (n === 27) st.rev = false;
    else if (n >= 30 && n <= 37) { st.fg = n - 30; st.fgRGB = null; }
    else if (n === 39) { st.fg = null; st.fgRGB = null; }
    else if (n >= 40 && n <= 47) { st.bg = n - 40; st.bgRGB = null; }
    else if (n === 49) { st.bg = null; st.bgRGB = null; }
    else if (n >= 90 && n <= 97) { st.fg = n - 90 + 8; st.fgRGB = null; }
    else if (n >= 100 && n <= 107) { st.bg = n - 100 + 8; st.bgRGB = null; }
    else if ((n === 38 || n === 48) && nums[i + 1] === 5) {
      const idx = nums[i + 2] || 0;
      const rgb = xterm256(idx);
      if (n === 38) { if (rgb) { st.fgRGB = rgb; st.fg = null; } else { st.fg = idx; st.fgRGB = null; } }
      else { if (rgb) { st.bgRGB = rgb; st.bg = null; } else { st.bg = idx; st.bgRGB = null; } }
      i += 2;
    } else if ((n === 38 || n === 48) && nums[i + 1] === 2) {
      const rgb = `rgb(${nums[i + 2] || 0},${nums[i + 3] || 0},${nums[i + 4] || 0})`;
      if (n === 38) { st.fgRGB = rgb; st.fg = null; } else { st.bgRGB = rgb; st.bg = null; }
      i += 4;
    }
  }
}

const SGR_RE = /\u001b\[([0-9;]*)m/g;

/** Convierte texto con escapes ANSI en HTML seguro (el texto va escapado). */
export function ansiToHTML(input) {
  const text = String(input);
  const st = emptyState();
  let out = "";
  let last = 0;
  SGR_RE.lastIndex = 0;
  let m;

  const emit = (chunk) => {
    if (!chunk) return;
    const safe = escapeHTML(chunk);
    if (isPlain(st)) {
      out += safe;
    } else {
      out += openTag(st) + safe + "</span>";
    }
  };

  while ((m = SGR_RE.exec(text)) !== null) {
    emit(text.slice(last, m.index));
    applySGR(st, m[1]);
    last = m.index + m[0].length;
  }
  emit(text.slice(last));
  return out;
}
