/* Punto de entrada: monta la terminal, el sistema de ficheros virtual,
   los comandos, la barra tipo airline y arranca la sesión. */

import { Terminal } from "./terminal.js";
import { buildFS, lookup } from "./vfs.js";
import { registerCommands } from "./commands.js";
import { initAirline } from "./airline.js";
import { boot } from "./boot.js";

function readPayload() {
  const el = document.getElementById("payload");
  if (!el) throw new Error("no se encuentra el payload de contenido");
  return JSON.parse(el.textContent);
}

async function start() {
  const payload = readPayload();

  const term = new Terminal(payload);

  const fs = buildFS(payload);
  term.fs = fs;
  term.lookup = (p) => lookup(fs, p, term.cwd);

  term.applyTheme(term.storedTheme() || payload.site.defaultTheme);
  term.setCRT(term.storedCRT());
  term.setTTYMode(term.storedTTYMode() || payload.site.defaultTTY);

  registerCommands(term);
  initAirline(term);

  window.mcg = term; // por si alguien abre la consola del navegador (guiño)

  document.body.classList.remove("booting");

  const fine = window.matchMedia("(pointer: fine)").matches;
  if (fine) term.focus();

  term.deferScroll = true;
  const bootAnchor = await boot(term);
  term.deferScroll = false;
  term.prompt();
  if (term.ttyMode === "web") {
    // Deja un instante las líneas de kernel a la vista y luego baja al
    // "neofetch", que es donde empieza lo interesante.
    term.scrollToTop();
    const animate = !term.skipRequested;
    if (animate) await term.sleep(450);
    term.scrollElementToTop(bootAnchor, { smooth: animate });
  } else {
    term.scrollToBottom();
  }

  const runHash = () => {
    const h = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
    if (!h) return;
    const cmd = term.resolveCommand(h.split(/\s+/)[0]);
    if (cmd) term.submit(h);
  };
  runHash();
  window.addEventListener("hashchange", runHash);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
