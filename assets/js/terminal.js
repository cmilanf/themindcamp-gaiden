/* Motor de la terminal: pintado, prompt, historial, completado y ejecución. */

import { ansiToHTML, escapeHTML, A } from "./ansi.js";
import { prettyPath } from "./vfs.js";

const STORE_PREFIX = "mcg.";
const HIST_KEY = "mcg.history";
const THEME_KEY = "mcg.theme";
const CRT_KEY = "mcg.crt";
const TTY_KEY = "mcg.tty";
export const THEMES = ["tty", "gruvbox", "dracula", "matrix", "amber", "solarized", "c64"];
export const TTY_MODES = ["web", "term"];

export class Terminal {
  constructor(payload) {
    this.payload = payload;
    this.site = payload.site;
    this.commands = new Map();
    this.aliases = new Map();
    this.output = document.getElementById("output");
    this.promptLine = document.getElementById("promptline");
    this.input = document.getElementById("stdin");
    this.screen = document.getElementById("terminal");
    this.measureEl = document.getElementById("measure");
    this.posEl = document.getElementById("al-pos");
    this.fileEl = document.getElementById("al-file");

    this.cwd = `/home/${this.site.user}`;
    this.history = this.loadHistory();
    this.histIdx = this.history.length;
    this.draft = "";
    this.busy = false;
    this.skipRequested = false;
    this.charWidth = 8;
    this.cols = 80;

    // Modo de desplazamiento: "web" deja el inicio de la salida arriba,
    // "term" persigue el final como una terminal de verdad.
    this.ttyMode = "web";
    this.deferScroll = false;
    this.pendingAnchor = null;
    this.pendingRead = null;

    this.bindInput();
    this.armSkip();
    this.measure();
    window.addEventListener("resize", () => this.measure());
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this.measure()).catch(() => {});
    }
  }

  /* ---- Temas ------------------------------------------------------------ */

  applyTheme(name, persist = true) {
    const theme = THEMES.includes(name) ? name : this.site.defaultTheme || "tty";
    document.body.classList.remove(...THEMES.map((t) => `theme-${t}`));
    document.body.classList.add(`theme-${theme}`);
    this.theme = theme;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* modo privado */ }
    }
    return theme;
  }

  storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  setCRT(on, persist = true) {
    document.body.classList.toggle("crt", !!on);
    if (persist) {
      try { localStorage.setItem(CRT_KEY, on ? "1" : "0"); } catch (e) { /* noop */ }
    }
  }

  storedCRT() {
    try { return localStorage.getItem(CRT_KEY) === "1"; } catch (e) { return false; }
  }

  /* ---- Modo de terminal (desplazamiento) -------------------------------- */

  setTTYMode(mode, persist = true) {
    this.ttyMode = TTY_MODES.includes(mode) ? mode : "web";
    document.body.dataset.tty = this.ttyMode;
    if (persist) {
      try { localStorage.setItem(TTY_KEY, this.ttyMode); } catch (e) { /* noop */ }
    }
    return this.ttyMode;
  }

  storedTTYMode() {
    try { return localStorage.getItem(TTY_KEY); } catch (e) { return null; }
  }

  /** Borra los ajustes que guarda la consola. Devuelve las claves eliminadas. */
  clearStorage() {
    const removed = [];
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORE_PREFIX)) { removed.push(k); localStorage.removeItem(k); }
      }
    } catch (e) { /* almacenamiento no disponible */ }
    return removed.sort();
  }

  /* ---- Métricas --------------------------------------------------------- */

  measure() {
    if (!this.measureEl) return;
    this.measureEl.textContent = "M".repeat(100);
    const w = this.measureEl.getBoundingClientRect().width / 100;
    if (w > 0) this.charWidth = w;
    const style = getComputedStyle(this.screen);
    const avail =
      this.screen.clientWidth -
      parseFloat(style.paddingLeft || 0) -
      parseFloat(style.paddingRight || 0);
    this.cols = Math.max(28, Math.floor(avail / this.charWidth));
  }

  /* ---- Registro de comandos -------------------------------------------- */

  register(spec) {
    this.commands.set(spec.name, spec);
    for (const a of spec.aliases || []) this.aliases.set(a, spec.name);
  }

  resolveCommand(name) {
    if (this.commands.has(name)) return this.commands.get(name);
    if (this.aliases.has(name)) return this.commands.get(this.aliases.get(name));
    // Permite ejecutar ./binario y rutas absolutas al home
    const bare = name.replace(/^\.\//, "").replace(/^~\//, "").replace(/^\/home\/[^/]+\//, "");
    if (this.commands.has(bare)) return this.commands.get(bare);
    if (this.aliases.has(bare)) return this.commands.get(this.aliases.get(bare));
    return null;
  }

  /* ---- Salida ----------------------------------------------------------- */

  appendEl(el) {
    this.output.appendChild(el);
    this.scroll();
    return el;
  }

  /** Escribe texto con escapes ANSI. Cada salto de línea es un div. */
  write(text = "", { wrap = false } = {}) {
    const lines = String(text).split("\n");
    const frag = document.createDocumentFragment();
    for (const line of lines) {
      const div = document.createElement("div");
      div.className = wrap ? "tline wrap" : "tline";
      div.innerHTML = line === "" ? "&nbsp;" : ansiToHTML(line);
      frag.appendChild(div);
    }
    this.output.appendChild(frag);
    this.scroll();
  }

  /** Igual que write pero con ajuste de línea (para textos largos). */
  writeWrapped(text) {
    this.write(text, { wrap: true });
  }

  /** Una línea de HTML ya formateado (permite elementos clicables). */
  writeLineHTML(html, cls = "tline wrap") {
    const div = document.createElement("div");
    div.className = cls;
    div.innerHTML = html;
    return this.appendEl(div);
  }

  writeHTML(html, className = "blk") {
    const div = document.createElement("div");
    div.className = className;
    div.innerHTML = html;
    return this.appendEl(div);
  }

  blank(n = 1) {
    for (let i = 0; i < n; i++) this.write("");
  }

  error(msg) {
    this.write(`${A.bold}${A.red}${msg}${A.reset}`, { wrap: true });
  }

  /** Regla horizontal con etiqueta, tipo separador de vim. */
  rule(label = "", { color = A.gray, width = null } = {}) {
    const w = Math.min(width || this.cols, 100);
    if (!label) return `${color}${"─".repeat(w)}${A.reset}`;
    const text = ` ${label} `;
    const left = 2;
    const right = Math.max(2, w - left - text.length);
    return `${color}${"─".repeat(left)}${A.reset}${A.bold}${A.byellow}${text}${A.reset}${color}${"─".repeat(right)}${A.reset}`;
  }

  clear() {
    this.output.replaceChildren();
    this.pendingAnchor = null;
  }

  /** En modo "web" el desplazamiento se decide al terminar el comando. */
  scroll() {
    if (this.ttyMode === "web" && this.deferScroll) return;
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.screen.scrollTop = this.screen.scrollHeight;
  }

  scrollToTop() {
    this.screen.scrollTop = 0;
  }

  /** Coloca arriba la línea donde empezó el último comando. */
  scrollToAnchor() {
    const a = this.pendingAnchor;
    if (!a || !a.isConnected) return this.scrollToTop();
    this.scrollElementToTop(a);
  }

  /** Coloca arriba un elemento concreto de la salida. */
  scrollElementToTop(el, { smooth = false } = {}) {
    if (!el || !el.isConnected) return;
    const pad = parseFloat(getComputedStyle(this.screen).paddingTop) || 0;
    const screenTop = this.screen.getBoundingClientRect().top;
    const top = this.screen.scrollTop + el.getBoundingClientRect().top - screenTop - pad;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (smooth && !reduce && this.screen.scrollTo) {
      this.screen.scrollTo({ top, behavior: "smooth" });
    } else {
      this.screen.scrollTop = top;
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Imprime líneas con retardo, saltable con cualquier tecla. */
  async typeLines(lines, delay = 40, opts = { wrap: true }) {
    for (const line of lines) {
      this.write(line, opts);
      if (!this.skipRequested) await this.sleep(delay);
    }
  }

  /* ---- Prompt ----------------------------------------------------------- */

  ps1HTML() {
    const s = this.site;
    const path = prettyPath(this.cwd, `/home/${s.user}`);
    return (
      `<span class="p-user">${escapeHTML(s.user)}</span>` +
      `<span class="p-at">@</span>` +
      `<span class="p-host">${escapeHTML(s.hostname)}</span>` +
      `<span class="p-at">:</span>` +
      `<span class="p-path">${escapeHTML(path)}</span>` +
      `<span class="p-sig">$&nbsp;</span>`
    );
  }

  refreshPS1() {
    const el = this.promptLine.querySelector(".ps1");
    if (el) el.innerHTML = this.ps1HTML();
  }

  /** Vuelca en el log la línea ejecutada, como haría un shell real. */
  echoCommand(line) {
    const div = document.createElement("div");
    div.className = "promptline";
    div.innerHTML =
      `<span class="ps1">${this.ps1HTML()}</span>` +
      `<span class="cmdtext">${colorizeHTML(line)}</span>`;
    this.appendEl(div);
    return div;
  }

  updatePos() {
    if (!this.posEl) return;
    const pos = (this.input.selectionStart ?? this.input.value.length) + 1;
    this.posEl.textContent = `${this.output.childElementCount}:${pos}`;
  }

  renderInput() {
    const v = this.input.value;
    const pos = Math.min(this.input.selectionStart ?? v.length, v.length);
    const el = this.promptLine.querySelector(".cmdtext");
    if (!el) return;
    const focused = document.activeElement === this.input;
    const cursor = `<span class="cursor${focused ? "" : " hollow"}"></span>`;
    el.innerHTML = colorizeHTML(v.slice(0, pos)) + cursor + colorizeHTML(v.slice(pos));
    this.updatePos();
  }

  setLine(value, cursorAtEnd = true) {
    this.input.value = value;
    if (cursorAtEnd) this.input.setSelectionRange(value.length, value.length);
    this.renderInput();
  }

  focus() {
    // En móvil, focus() abre el teclado: solo lo hacemos si el usuario ha tocado.
    this.input.focus({ preventScroll: true });
  }

  /* ---- Entrada ---------------------------------------------------------- */

  bindInput() {
    const el = this.input;

    // Al teclear saltamos al prompt: en modo "web" puede estar fuera de vista.
    el.addEventListener("input", () => { this.renderInput(); this.scrollToBottom(); });
    el.addEventListener("click", () => this.renderInput());
    el.addEventListener("select", () => this.renderInput());
    el.addEventListener("focus", () => this.renderInput());
    el.addEventListener("blur", () => this.renderInput());

    el.addEventListener("keydown", (e) => this.onKeyDown(e));

    this.screen.addEventListener("mousedown", (e) => {
      if (e.target.closest("a, button, .act")) return;
      // No robamos el foco si el usuario está seleccionando texto.
      if (window.getSelection && String(window.getSelection()).length) return;
      setTimeout(() => this.focus(), 0);
    });

    // Clicks en elementos generados con data-cmd ejecutan comandos.
    this.output.addEventListener("click", (e) => {
      const t = e.target.closest("[data-cmd]");
      if (!t) return;
      e.preventDefault();
      this.submit(t.dataset.cmd);
    });
    this.output.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const t = e.target.closest("[data-cmd]");
      if (!t) return;
      e.preventDefault();
      this.submit(t.dataset.cmd);
    });
  }

  /** Cualquier tecla salta la animación de arranque (se re-arma en `reboot`). */
  armSkip() {
    this.skipRequested = false;
    window.addEventListener("keydown", () => { this.skipRequested = true; }, { once: true });
  }

  /** Deja la sesión como recién cargada, sin recargar la página. */
  reset() {
    this.clear();
    this.cwd = `/home/${this.site.user}`;
    this.armSkip();
    this.refreshPS1();
    if (this.setCurrentSection) this.setCurrentSection(null);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const line = this.input.value;
      this.setLine("");
      if (this.pendingRead) {
        const resolve = this.pendingRead;
        this.pendingRead = null;
        this.write(`${A.bold}${line}${A.reset}`);
        this.scrollToBottom();
        resolve(line);
        return;
      }
      this.submit(line);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      this.complete();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      this.historyPrev();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.historyNext();
      return;
    }
    if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      this.clear();
      return;
    }
    if (e.ctrlKey && (e.key === "c" || e.key === "C") && !window.getSelection().toString()) {
      e.preventDefault();
      if (this.pendingRead) {
        const resolve = this.pendingRead;
        this.pendingRead = null;
        this.write(`${A.gray}^C${A.reset}`);
        resolve("");
        return;
      }
      this.echoCommand(this.input.value + "^C");
      this.setLine("");
      return;
    }
    if (e.ctrlKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      this.setLine("");
      return;
    }
    if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      this.submit("exit");
      return;
    }
    if (e.key === "Escape") {
      this.input.blur();
      return;
    }
    setTimeout(() => this.renderInput(), 0);
  }

  historyPrev() {
    if (this.histIdx === this.history.length) this.draft = this.input.value;
    if (this.histIdx > 0) {
      this.histIdx--;
      this.setLine(this.history[this.histIdx]);
    }
  }

  historyNext() {
    if (this.histIdx < this.history.length - 1) {
      this.histIdx++;
      this.setLine(this.history[this.histIdx]);
    } else if (this.histIdx === this.history.length - 1) {
      this.histIdx = this.history.length;
      this.setLine(this.draft || "");
    }
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(HIST_KEY);
      return raw ? JSON.parse(raw).slice(-200) : [];
    } catch (e) {
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(this.history.slice(-200)));
    } catch (e) { /* noop */ }
  }

  /* ---- Lectura interactiva ---------------------------------------------- */

  /** Hace una pregunta y espera la respuesta del usuario (Enter o Ctrl+C). */
  ask(question) {
    this.write(question, { wrap: true });
    this.scrollToBottom();
    this.focus();
    return new Promise((resolve) => { this.pendingRead = resolve; });
  }

  /** Pregunta de sí/no. Por defecto, no. */
  async confirm(question) {
    const answer = await this.ask(`${question} ${A.gray}[s/N]${A.reset} `);
    return /^(s|si|sí|y|yes)$/i.test(answer.trim());
  }

  /* ---- Completado ------------------------------------------------------- */

  complete() {
    const v = this.input.value;
    const pos = this.input.selectionStart ?? v.length;
    const head = v.slice(0, pos);
    const tail = v.slice(pos);
    const m = head.match(/(\S*)$/);
    const frag = m ? m[1] : "";
    const isFirst = head.trimStart().length === frag.length;

    let cands;
    if (isFirst) {
      const prefix = frag.replace(/^\.\//, "");
      const names = [...this.commands.keys(), ...this.aliases.keys()]
        .filter((n) => !(this.commands.get(n) || {}).hidden)
        .filter((n) => n.startsWith(prefix));
      cands = names.map((n) => (frag.startsWith("./") ? `./${n}` : n));
    } else {
      cands = this.completePath(frag);
    }

    cands = [...new Set(cands)].sort();
    if (cands.length === 0) return;
    if (cands.length === 1) {
      const done = cands[0].endsWith("/") ? cands[0] : cands[0] + " ";
      const value = head.slice(0, head.length - frag.length) + done;
      this.input.value = value + tail;
      this.input.setSelectionRange(value.length, value.length);
      this.renderInput();
      return;
    }
    const common = commonPrefix(cands);
    if (common.length > frag.length) {
      const value = head.slice(0, head.length - frag.length) + common;
      this.setLine(value + tail, false);
      this.input.setSelectionRange(value.length, value.length);
      this.renderInput();
    }
    this.echoCommand(v);
    this.write(cands.map((c) => `${A.bgreen}${c}${A.reset}`).join("  "), { wrap: true });
  }

  completePath(frag) {
    if (!this.fs) return [];
    const slash = frag.lastIndexOf("/");
    const dirPart = slash >= 0 ? frag.slice(0, slash + 1) : "";
    const base = slash >= 0 ? frag.slice(slash + 1) : frag;
    const node = this.lookup(dirPart || ".");
    if (!node || node.type !== "dir") return [];
    const out = [];
    for (const child of node.children.values()) {
      if (child.name.startsWith(base)) {
        out.push(dirPart + child.name + (child.type === "dir" ? "/" : ""));
      }
    }
    return out;
  }

  /* ---- Ejecución -------------------------------------------------------- */

  async submit(line) {
    if (this.busy) return;
    const raw = String(line);
    const trimmed = raw.trim();

    if (trimmed === "!!") {
      const prev = this.history[this.history.length - 1];
      if (!prev) { this.echoCommand("!!"); this.error("mcsh: !!: no hay historial"); this.prompt(); return; }
      return this.submit(prev);
    }

    this.pendingAnchor = this.echoCommand(raw);
    if (trimmed) {
      if (this.history[this.history.length - 1] !== trimmed) this.history.push(trimmed);
      this.saveHistory();
      this.histIdx = this.history.length;
      this.draft = "";
    }
    if (!trimmed) { this.scrollToBottom(); return; }

    this.busy = true;
    this.deferScroll = true;
    try {
      for (const part of splitStatements(trimmed)) {
        await this.exec(part);
      }
    } catch (err) {
      this.error(`mcsh: error interno: ${err && err.message ? err.message : err}`);
      if (window.console) console.error(err);
    } finally {
      this.busy = false;
      this.deferScroll = false;
      this.prompt();
      if (this.ttyMode === "web") this.scrollToAnchor();
      else this.scrollToBottom();
    }
  }

  async exec(statement) {
    const argv = tokenize(statement);
    if (!argv.length) return;
    const name = argv[0];
    const cmd = this.resolveCommand(name);
    if (!cmd) {
      this.error(`mcsh: ${name}: orden no encontrada`);
      const near = suggest(name, [...this.commands.keys()]);
      if (near) this.write(`${A.gray}¿Quisiste decir ${A.byellow}${near}${A.gray}? Prueba con ${A.bgreen}help${A.reset}`);
      else this.write(`${A.gray}Escribe ${A.bgreen}help${A.gray} o ${A.bgreen}ls${A.gray} para ver qué hay por aquí.${A.reset}`);
      return;
    }
    await cmd.run(argv.slice(1), this);
  }

  prompt() {
    this.refreshPS1();
    this.renderInput();
  }
}

/* ---- utilidades ------------------------------------------------------- */

export function tokenize(line) {
  const out = [];
  let cur = "";
  let quote = null;
  let has = false;
  for (const ch of String(line)) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = "";
      has = false;
      continue;
    }
    cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** Divide por ; y && (sin semántica de códigos de salida, es cosmético). */
function splitStatements(line) {
  return line
    .split(/\s*(?:;|&&)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Colorea la línea de comandos que se muestra en el prompt. */
export function colorizeHTML(line) {
  const parts = String(line).split(/(\s+)/);
  let first = true;
  let html = "";
  for (const p of parts) {
    if (/^\s+$/.test(p) || p === "") {
      html += escapeHTML(p).replace(/ /g, "&nbsp;");
      continue;
    }
    let cls = "";
    if (first) { cls = "tok-cmd"; first = false; }
    else if (p.startsWith("-")) cls = "tok-flag";
    else if (/^["']/.test(p)) cls = "tok-str";
    html += cls ? `<span class="${cls}">${escapeHTML(p)}</span>` : escapeHTML(p);
  }
  return html;
}

function commonPrefix(list) {
  if (!list.length) return "";
  let p = list[0];
  for (const s of list) {
    while (!s.startsWith(p)) p = p.slice(0, -1);
    if (!p) break;
  }
  return p;
}

/** Sugerencia por distancia de edición, para el clásico "¿quisiste decir?". */
function suggest(word, list) {
  let best = null;
  let bestD = Infinity;
  for (const c of list) {
    const d = editDistance(word, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}
