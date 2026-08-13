/* Logo ANSI al estilo `linuxlogo -L 11`: dibujo a la izquierda y datos del
   "sistema" a la derecha. Si la terminal es estrecha, se apila. */

import { A, padEndAnsi, visibleLength } from "./ansi.js";

const ART_W = 20;
const ART_H = 9;

/** Tienda de campaña ASCII generada para que las diagonales siempre cuadren. */
function tentGrid() {
  const cells = [];
  for (let row = 1; row <= ART_H; row++) {
    const line = new Array(ART_W).fill(" ");
    const kind = new Array(ART_W).fill(" ");
    const l = 9 - row;
    const r = 8 + row;
    if (row === ART_H) {
      for (let i = l + 1; i < r; i++) { line[i] = "_"; kind[i] = "g"; }
    }
    line[l] = "/"; kind[l] = "t";
    line[r] = "\\"; kind[r] = "t";
    if (row >= 4) {
      const dl = 12 - row;
      const dr = 5 + row;
      if (dl > l && dr < r) {
        line[dl] = "/"; kind[dl] = "d";
        line[dr] = "\\"; kind[dr] = "d";
      }
    }
    cells.push({ line, kind });
  }
  return cells;
}

export function tentArt() {
  const palette = { t: `${A.bold}${A.byellow}`, d: `${A.bcyan}`, g: `${A.bgreen}`, " ": "" };
  return tentGrid().map(({ line, kind }) => {
    let out = "";
    let cur = null;
    for (let i = 0; i < line.length; i++) {
      const k = kind[i];
      if (k !== cur) {
        if (cur && cur !== " ") out += A.reset;
        cur = k;
        if (k !== " ") out += palette[k];
      }
      out += line[i];
    }
    if (cur && cur !== " ") out += A.reset;
    return out;
  });
}

/** "MindCamp Gaiden" en figlet small (69 columnas). */
export const FIGLET = [
  " __  __ _         _  ___                    ___      _    _          ",
  "|  \\/  (_)_ _  __| |/ __|__ _ _ __  _ __   / __|__ _(_)__| |___ _ _  ",
  "| |\\/| | | ' \\/ _` | (__/ _` | '  \\| '_ \\ | (_ / _` | / _` / -_) ' \\ ",
  "|_|  |_|_|_||_\\__,_|\\___\\__,_|_|_|_| .__/  \\___\\__,_|_\\__,_\\___|_||_|",
  "                                   |_|                               ",
];

export function figletBanner() {
  return FIGLET.map((l, i) => `${A.bold}${i < 3 ? A.byellow : A.yellow}${l}${A.reset}`);
}

function row(label, value, pad = 14) {
  const dots = ".".repeat(Math.max(1, pad - label.length - 1));
  return `${A.bcyan}${label}${A.reset} ${A.gray}${dots}:${A.reset} ${value}`;
}

/** Único dato del transporte que el cliente conoce de verdad: el protocolo
   negociado y el esquema. Nada de inventarse el software del servidor. */
export function connectionHint() {
  let proto = "";
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    proto = (nav && nav.nextHopProtocol) || "";
  } catch (e) { /* navegadores antiguos */ }
  const names = { h3: "HTTP/3", h2: "HTTP/2", "http/1.1": "HTTP/1.1", "http/1.0": "HTTP/1.0" };
  const label = names[proto] || (proto ? proto.toUpperCase() : "desconocido");
  const scheme = location.protocol === "https:" ? "TLS" : "sin TLS";
  return `${label} ${A.gray}· ${scheme} · sitio estático${A.reset}`;
}

/** null si el evento todavía no tiene fecha confirmada en la configuración. */
function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso);
  if (isNaN(target)) return null;
  const now = new Date();
  return Math.ceil((target - now) / 86400000);
}

export function sysInfo(term, compact = false) {
  const s = term.site;
  const nav = window.navigator || {};
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return "?"; }
  })();
  const rows = Math.max(1, Math.floor(term.screen.clientHeight / (term.charWidth * 2)));
  const left = daysUntil(s.startDate);
  const countdown =
    left === null ? `${A.gray}pendiente de fechas${A.reset}`
      : left > 0 ? `${A.bold}${A.byellow}${left}${A.reset} días para el evento`
        : left === 0 ? `${A.bold}${A.bgreen}¡es HOY!${A.reset}`
          : `terminó hace ${Math.abs(left)} días`;
  const pad = compact ? 11 : 14;
  const r = (l, v) => row(l, v, pad);
  const ruleW = compact ? Math.max(18, term.cols - 2) : 46;

  if (compact) {
    return [
      `${A.bold}${A.bwhite}${s.distro}${A.reset}`,
      `${A.gray}${"─".repeat(Math.min(ruleW, 40))}${A.reset}`,
      r("Edición", `${A.bold}${A.byellow}${s.edition}${A.reset}`),
      r("Kernel", `${A.bgreen}${s.kernel}${A.reset}`),
      r("Shell", s.shell),
      r("Conexión", connectionHint()),
      r("Generador", `${A.bmagenta}${s.generator}${A.reset}`),
      r("Terminal", `${term.cols}x${rows}`),
      r("Fechas", `${A.bold}${A.bwhite}${s.datesHuman}${A.reset}`),
      r("Lugar", s.city),
      r("Faltan", countdown),
    ];
  }

  return [
    `${A.bold}${A.bwhite}${s.distro}${A.reset}`,
    `${A.gray}${"─".repeat(ruleW)}${A.reset}`,
    r("Edición", `${A.bold}${A.byellow}${s.edition}${A.reset} ${A.gray}(${s.editionKanji})${A.reset}`),
    r("Kernel", `${A.bgreen}${s.kernel}${A.reset} ${A.gray}${s.arch}${A.reset}`),
    r("Shell", `${s.shell} ${A.gray}· TERM=xterm-256color${A.reset}`),
    r("Conexión", connectionHint()),
    r("Generador", `${A.bmagenta}${s.generator}${A.reset} ${A.gray}· ${s.buildDate}${A.reset}`),
    r("Terminal", `${term.cols}x${rows} ${A.gray}· ${window.innerWidth}x${window.innerHeight} px${A.reset}`),
    r("Cliente", `${nav.platform || "web"} ${A.gray}· ${nav.language || "?"} · ${tz}${A.reset}`),
    r("Fechas", `${A.bold}${A.bwhite}${s.datesHuman}${A.reset}`),
    r("Lugar", `${s.venue} ${A.gray}· ${s.city}${A.reset}`),
    r("Cuenta atrás", countdown),
  ];
}

/** Pinta el logo completo, apilado o en dos columnas según el ancho. */
export function renderLogo(term) {
  const art = tentArt();
  let info = sysInfo(term);
  const widest = Math.max(...info.map((l) => visibleLength(l)));
  const side = ART_W + 2 + widest <= term.cols;
  if (!side) info = sysInfo(term, true);

  // El banner es ASCII de ancho fijo: solo se pinta si cabe entero.
  const bannerW = Math.max(...FIGLET.map((l) => l.length));
  if (term.cols >= bannerW) {
    for (const l of figletBanner()) term.write(l);
    term.write("");
  }

  if (!side) {
    for (const l of art) term.write(l);
    term.write("");
    for (const l of info) term.write(l);
    return;
  }

  const n = Math.max(art.length, info.length);
  for (let i = 0; i < n; i++) {
    term.write(padEndAnsi(art[i] || "", ART_W) + "  " + (info[i] || ""));
  }
}
