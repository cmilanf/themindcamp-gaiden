/* Comandos de la consola. */

import { A } from "./ansi.js";
import { act, columns, esc, imageFrame, sp } from "./ui.js";
import { humanSize, lookup, prettyPath, resolveSegments, segmentsToPath } from "./vfs.js";
import { figletBanner, renderLogo } from "./logo.js";
import { runSection, sectionHeader } from "./content.js";
import { THEMES, TTY_MODES } from "./terminal.js";
import { boot } from "./boot.js";

const TYPE_STYLE = {
  dir: { cls: "f12 bo", suffix: "/" },
  exe: { cls: "f10 bo", suffix: "*" },
  image: { cls: "f13", suffix: "" },
  pdf: { cls: "f9", suffix: "" },
  file: { cls: "f7", suffix: "" },
};

/** Fecha de inicio del evento, o null si todavía está sin confirmar. */
function eventStart(site) {
  if (!site.startDate) return null;
  const d = new Date(site.startDate);
  return isNaN(d) ? null : d;
}

function nodeHTML(node, { clickable = true } = {}) {
  const st = TYPE_STYLE[node.type] || TYPE_STYLE.file;
  const label = node.name + st.suffix;
  if (!clickable) return sp(st.cls, label);
  if (node.type === "exe") return act(`./${node.name}`, st.cls, label, `Ejecutar ${node.name}`);
  if (node.type === "dir") return act(`ls ${node.name}`, st.cls, label, `Listar ${node.name}`);
  if (node.type === "image") return act(`imgcat ${node.name}`, st.cls, label, "Mostrar imagen");
  if (node.type === "pdf") return act(`open ${node.name}`, st.cls, label, "Abrir documento");
  return act(`cat ${node.name}`, st.cls, label, `Ver ${node.name}`);
}

/* ---- resaltado de markdown para `cat` -------------------------------- */

function highlightMarkdown(raw) {
  const lines = String(raw).split("\n");
  let inFront = false;
  let inFence = false;
  const out = [];
  lines.forEach((line, i) => {
    if (i === 0 && line.trim() === "---") { inFront = true; out.push(`${A.gray}${line}${A.reset}`); return; }
    if (inFront) {
      if (line.trim() === "---") { inFront = false; out.push(`${A.gray}${line}${A.reset}`); return; }
      const m = line.match(/^([\w-]+)(:)(.*)$/);
      out.push(m ? `${A.bmagenta}${m[1]}${A.gray}:${A.reset}${A.bcyan}${m[3]}${A.reset}` : `${A.gray}${line}${A.reset}`);
      return;
    }
    if (/^\s*```/.test(line)) { inFence = !inFence; out.push(`${A.gray}${line}${A.reset}`); return; }
    if (inFence) { out.push(`${A.bcyan}${line}${A.reset}`); return; }
    if (/^#{1,6}\s/.test(line)) { out.push(`${A.bold}${A.byellow}${line}${A.reset}`); return; }
    if (/^\s*>/.test(line)) { out.push(`${A.cyan}${line}${A.reset}`); return; }
    if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      out.push(line.replace(/^(\s*)([-*+]|\d+\.)(\s)/, `$1${A.bgreen}$2${A.reset}$3`));
      return;
    }
    out.push(
      line
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${A.bcyan}[$1]${A.reset}${A.gray}($2)${A.reset}`)
        .replace(/`([^`]+)`/g, `${A.byellow}\`$1\`${A.reset}`)
        .replace(/\*\*([^*]+)\*\*/g, `${A.bold}${A.bwhite}**$1**${A.reset}`)
    );
  });
  return out.join("\n");
}

/* ---- registro --------------------------------------------------------- */

export function registerCommands(term) {
  const payload = term.payload;
  const site = payload.site;
  const fs = term.fs;
  const at = (p) => lookup(fs, p, term.cwd);

  /* --- secciones como binarios ---------------------------------------- */
  for (const sec of payload.sections) {
    term.register({
      name: sec.slug,
      group: "secciones",
      usage: `${sec.slug}${sec.generator === "speakers" ? " [id|--all]" : sec.generator === "agenda" ? " [1|2|3|id|--full]" : ""}`,
      desc: sec.summary || sec.title,
      run: (args) => runSection(term, sec, args),
    });
  }
  term.aliases.set("speakers", "ponentes");
  term.aliases.set("about", "acerca-de");
  term.aliases.set("schedule", "agenda");
  term.aliases.set("venue", "lugar");
  term.aliases.set("price", "precio");
  term.aliases.set("contact", "contacto");

  /* --- navegación ------------------------------------------------------ */

  term.register({
    name: "ls",
    group: "shell",
    usage: "ls [-l] [-a] [ruta...]",
    desc: "Lista el contenido del directorio actual",
    run: (args) => {
      const flags = args.filter((a) => a.startsWith("-")).join("");
      const paths = args.filter((a) => !a.startsWith("-"));
      const long = flags.includes("l");
      const all = flags.includes("a");
      const targets = paths.length ? paths : ["."];

      targets.forEach((p, idx) => {
        const node = at(p);
        if (!node) return term.error(`ls: no se puede acceder a '${p}': no existe`);
        if (targets.length > 1) {
          if (idx) term.write("");
          term.write(`${A.bblue}${p}:${A.reset}`);
        }
        if (node.type !== "dir") {
          term.writeLineHTML(long ? longLine(node, site) : nodeHTML(node));
          return;
        }
        let items = [...node.children.values()];
        if (!all) items = items.filter((n) => !n.name.startsWith("."));
        items.sort((a, b) => a.name.localeCompare(b.name));

        if (long) {
          const total = items.reduce((s, n) => s + n.size, 0);
          term.write(`${A.gray}total ${Math.ceil(total / 1024)}${A.reset}`);
          for (const n of items) term.writeLineHTML(longLine(n, site));
        } else {
          const cells = items.map((n) => {
            const st = TYPE_STYLE[n.type] || TYPE_STYLE.file;
            return { html: nodeHTML(n), len: (n.name + st.suffix).length };
          });
          for (const line of columns(cells, term.cols)) term.writeLineHTML(line, "tline");
        }
      });
    },
  });

  term.register({
    name: "cd",
    group: "shell",
    usage: "cd [ruta]",
    desc: "Cambia de directorio",
    run: (args) => {
      const target = args[0] || "~";
      const node = at(target);
      if (!node) return term.error(`cd: ${target}: no existe`);
      if (node.type !== "dir") return term.error(`cd: ${target}: no es un directorio`);
      term.cwd = segmentsToPath(resolveSegments(target, term.cwd, fs.home));
      term.refreshPS1();
    },
  });

  term.register({
    name: "pwd",
    group: "shell",
    desc: "Muestra el directorio actual",
    run: () => term.write(term.cwd),
  });

  term.register({
    name: "cat",
    group: "shell",
    aliases: ["less", "more", "bat"],
    usage: "cat <fichero...>",
    desc: "Muestra el markdown original de un fichero",
    run: (args) => {
      if (!args.length) return term.error("cat: falta el fichero. Prueba: cat README.md");
      for (const p of args) {
        const node = at(p);
        if (!node) { term.error(`cat: ${p}: no existe`); continue; }
        if (node.type === "dir") { term.error(`cat: ${p}: es un directorio`); continue; }
        if (node.type === "exe") {
          term.write(`${A.gray}# ${p} es un binario. Ejecútalo con ${A.bgreen}./${node.name}${A.reset}`);
          term.write(`${A.gray}# Su fuente markdown vive en sections/${node.name}.md${A.reset}`);
          if (node.section) term.write(highlightMarkdown(node.section.raw));
          continue;
        }
        if (node.type === "image") {
          term.write(`${A.gray}cat: ${p}: datos binarios (usa ${A.bgreen}imgcat ${p}${A.gray})${A.reset}`);
          continue;
        }
        if (node.type === "pdf") {
          term.write(`${A.gray}cat: ${p}: PDF (usa ${A.bgreen}open ${p}${A.gray})${A.reset}`);
          continue;
        }
        term.write(highlightMarkdown(node.raw || ""));
      }
    },
  });

  term.register({
    name: "tree",
    group: "shell",
    usage: "tree [ruta]",
    desc: "Muestra el árbol de directorios",
    run: (args) => {
      const start = at(args[0] || ".");
      if (!start) return term.error(`tree: ${args[0]}: no existe`);
      let dirs = 0;
      let files = 0;
      term.writeLineHTML(sp("f12 bo", prettyPath(segmentsToPath(resolveSegments(args[0] || ".", term.cwd, fs.home)), fs.home)));
      const walkTree = (node, prefix) => {
        const kids = [...node.children.values()].filter((n) => !n.name.startsWith("."));
        kids.sort((a, b) => a.name.localeCompare(b.name));
        kids.forEach((n, i) => {
          const last = i === kids.length - 1;
          term.writeLineHTML(sp("f8", prefix + (last ? "└── " : "├── ")) + nodeHTML(n), "tline");
          if (n.type === "dir") { dirs++; walkTree(n, prefix + (last ? "    " : "│   ")); }
          else files++;
        });
      };
      if (start.type === "dir") walkTree(start, "");
      term.write("");
      term.write(`${A.gray}${dirs} directorios, ${files} ficheros${A.reset}`);
    },
  });

  term.register({
    name: "file",
    group: "shell",
    usage: "file <fichero>",
    desc: "Identifica el tipo de un fichero",
    run: (args) => {
      for (const p of args.length ? args : ["."]) {
        const n = at(p);
        if (!n) { term.error(`file: ${p}: no existe`); continue; }
        const desc = {
          dir: "directory",
          exe: "MindCamp section binary, dynamically linked, not stripped",
          image: "JPEG image data, baseline, precision 8",
          pdf: "PDF document, version 1.4",
          file: "Unicode text, UTF-8 text, Markdown document",
        }[n.type];
        term.write(`${A.bcyan}${p}${A.reset}${A.gray}:${A.reset} ${desc}`);
      }
    },
  });

  /* --- contenido con argumentos propios -------------------------------- */

  term.register({
    name: "grep",
    group: "shell",
    usage: "grep <patrón>",
    desc: "Busca texto en todo el contenido del evento",
    run: (args) => {
      const pattern = args.filter((a) => !a.startsWith("-")).join(" ");
      if (!pattern) return term.error("grep: falta el patrón");
      let re;
      try { re = new RegExp(pattern, "i"); } catch (e) { return term.error(`grep: patrón inválido: ${e.message}`); }
      const corpus = [
        ...payload.sections.map((s) => ({ file: `sections/${s.slug}.md`, raw: s.raw, cmd: `./${s.slug}` })),
        ...payload.speakers.map((s) => ({ file: `ponentes.d/${s.slug}.md`, raw: s.raw, cmd: `ponentes ${s.slug}` })),
        ...payload.agenda.map((s) => ({ file: `agenda.d/${s.slug}.md`, raw: s.raw, cmd: `agenda ${s.slug}` })),
      ];
      let hits = 0;
      for (const item of corpus) {
        const lines = item.raw.split("\n");
        lines.forEach((line, i) => {
          if (!re.test(line)) return;
          hits++;
          const marked = line.replace(new RegExp(pattern, "gi"), (m) => `\u0000${m}\u0001`);
          const html = esc(marked.trim())
            .replace(/\u0000/g, '<span class="f11 bo">')
            .replace(/\u0001/g, "</span>");
          term.writeLineHTML(
            `${act(item.cmd, "f13", item.file)}${sp("f8", ":" + (i + 1) + ": ")}${html}`
          );
        });
      }
      term.write("");
      term.write(hits ? `${A.gray}${hits} coincidencias${A.reset}` : `${A.gray}sin coincidencias${A.reset}`);
    },
  });

  term.register({
    name: "imgcat",
    group: "media",
    aliases: ["display", "feh", "eog"],
    usage: "imgcat <imagen>",
    desc: "Muestra una imagen en la terminal",
    run: (args) => {
      if (!args.length) {
        term.error("imgcat: falta la imagen");
        term.write(`${A.gray}Prueba: ${A.bgreen}ls res${A.reset}`);
        return;
      }
      for (const p of args) {
        let node = at(p);
        if (!node) node = at(`res/${p}`);
        if (!node) node = at(`~/res/${p}`);
        if (!node || node.type !== "image") { term.error(`imgcat: ${p}: no es una imagen`); continue; }
        term.writeHTML(imageFrame({ url: node.url, caption: node.alt || "", alt: node.alt || node.name }), "blk");
      }
    },
  });

  term.register({
    name: "open",
    group: "media",
    aliases: ["xdg-open", "start"],
    usage: "open <fichero|url>",
    desc: "Abre un documento o URL en una pestaña nueva",
    run: (args) => {
      const target = args[0];
      if (!target) return term.error("open: falta el destino");
      if (/^https?:\/\//.test(target)) {
        window.open(target, "_blank", "noopener");
        term.write(`${A.gray}abriendo ${target}${A.reset}`);
        return;
      }
      const node = at(target) || at(`docs.d/${target}`) || at(`res/${target}`);
      if (!node || !node.url) return term.error(`open: ${target}: no sé abrir eso`);
      window.open(node.url, "_blank", "noopener");
      term.write(`${A.gray}abriendo ${node.url}${A.reset}`);
    },
  });

  term.register({
    name: "github",
    group: "media",
    aliases: ["repo", "source", "src"],
    desc: "Abre el repositorio de este site en GitHub",
    run: () => {
      const url = "https://github.com/cmilanf/themindcamp-gaiden";
      window.open(url, "_blank", "noopener");
      term.write(`${A.gray}abriendo ${url}${A.reset}`);
    },
  });

  term.register({
    name: "map",
    group: "media",
    aliases: ["mapa"],
    desc: "Abre la ubicación en Google Maps",
    run: () => {
      term.writeHTML(
        imageFrame({ url: "/res/map.jpg", caption: site.venue, alt: `Mapa de ${site.venue}`, link: site.mapURL }),
        "blk"
      );
      term.write(`${A.gray}${site.address}${A.reset}`);
      if (site.venuePhone) term.write(`${A.gray}Tel. ${site.venuePhone}${A.reset}`);
      term.writeLineHTML(`<a href="${esc(site.mapURL)}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>`);
      if (site.venueURL) {
        term.writeLineHTML(`<a href="${esc(site.venueURL)}" target="_blank" rel="noopener">Web de ${esc(site.venue)} ↗</a>`);
      }
    },
  });

  /* --- sistema --------------------------------------------------------- */

  term.register({
    name: "help",
    group: "sistema",
    aliases: ["ayuda", "?"],
    usage: "help [comando]",
    desc: "Muestra esta ayuda",
    run: (args) => {
      if (args.length) return manPage(term, args[0]);
      sectionHeader(term, "help", "mcsh 5.2.21");
      term.write(`${A.gray}Esta web es una terminal. Escribe un comando y pulsa ${A.reset}${A.byellow}Enter${A.reset}${A.gray}, o usa el menú de arriba.${A.reset}`);
      term.write("");

      const groups = new Map();
      for (const c of term.commands.values()) {
        if (c.hidden) continue;
        const g = c.group || "otros";
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(c);
      }
      const order = ["secciones", "shell", "media", "sistema", "diversión", "otros"];
      const names = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      for (const g of names) {
        const list = groups.get(g).sort((a, b) => a.name.localeCompare(b.name));
        term.write(`${A.bold}${A.byellow}${g.toUpperCase()}${A.reset}`);
        const w = Math.max(...list.map((c) => (c.usage || c.name).length)) + 2;
        for (const c of list) {
          const u = c.usage || c.name;
          term.writeLineHTML(
            `  ${act(c.name, "f10", u.padEnd(w))}${sp("f7", c.desc || "")}`
          );
        }
        term.write("");
      }
      term.write(`${A.gray}Atajos: ${A.reset}${A.byellow}Tab${A.reset}${A.gray} completa · ${A.reset}${A.byellow}↑↓${A.reset}${A.gray} historial · ${A.reset}${A.byellow}Ctrl+L${A.reset}${A.gray} limpia · ${A.reset}${A.byellow}Ctrl+C${A.reset}${A.gray} cancela${A.reset}`);
      term.write(`${A.gray}Detalle de un comando: ${A.reset}${A.bgreen}man ls${A.reset}`);
    },
  });

  term.register({
    name: "man",
    group: "sistema",
    usage: "man <comando>",
    desc: "Manual de un comando",
    run: (args) => {
      if (!args.length) return term.error("¿Qué página de manual quieres? (prueba: man ls)");
      manPage(term, args[0]);
    },
  });

  term.register({
    name: "clear",
    group: "sistema",
    aliases: ["cls"],
    desc: "Limpia la pantalla",
    run: () => term.clear(),
  });

  term.register({
    name: "history",
    group: "sistema",
    desc: "Historial de comandos",
    run: () => {
      term.history.forEach((h, i) => {
        term.writeLineHTML(`${sp("f8", String(i + 1).padStart(5) + "  ")}${act(h, "f7", h, "Repetir")}`);
      });
    },
  });

  term.register({
    name: "neofetch",
    group: "sistema",
    aliases: ["linuxlogo", "logo", "screenfetch", "motd"],
    desc: "Logo ANSI y datos del sistema",
    run: () => { renderLogo(term); },
  });

  term.register({
    name: "banner",
    group: "sistema",
    aliases: ["figlet"],
    desc: "El nombre del evento en ASCII gigante",
    run: () => { for (const l of figletBanner()) term.write(l); },
  });

  term.register({
    name: "uname",
    group: "sistema",
    usage: "uname [-a|-r|-m]",
    desc: "Información del sistema",
    run: (args) => {
      const flags = args.join("");
      if (flags.includes("a")) {
        term.write(
          `MindCampOS ${site.hostname} ${site.version} #${site.edition} SMP PREEMPT_DYNAMIC ` +
            `${site.buildDate} ${site.arch} GNU/MindCamp`
        );
      } else if (flags.includes("r")) term.write(site.version);
      else if (flags.includes("m")) term.write(site.arch);
      else term.write("MindCampOS");
    },
  });

  term.register({
    name: "tty",
    group: "sistema",
    usage: "tty [web|term]",
    desc: "Cómo se desplaza la consola al ejecutar un comando",
    run: (args) => {
      const mode = args[0] && args[0].toLowerCase();
      if (mode && !TTY_MODES.includes(mode)) {
        term.error(`tty: modo «${args[0]}» desconocido (usa web o term)`);
        return;
      }
      if (mode) term.setTTYMode(mode);
      term.write(`/dev/pts/0`);
      term.write("");
      for (const m of TTY_MODES) {
        const active = m === term.ttyMode;
        const desc =
          m === "web"
            ? "el inicio de la salida queda arriba; bajas leyendo tú"
            : "la consola persigue el final, como una terminal de verdad";
        term.writeLineHTML(
          `  ${act(`tty ${m}`, active ? "f11 bo" : "f10", m.padEnd(6))}` +
            sp("f7", desc) +
            sp("f8", active ? "   ← activo" : "")
        );
      }
      term.write("");
      term.write(`${A.gray}El ajuste se guarda en el navegador. Se borra con ${A.reset}${A.bgreen}reset${A.reset}${A.gray}.${A.reset}`);
    },
  });

  term.register({
    name: "reset",
    group: "sistema",
    desc: "Borra los ajustes guardados en el navegador",
    run: async () => {
      term.write(`${A.gray}Se borrarán del almacenamiento local del navegador:${A.reset}`);
      term.write(`${A.gray}  · la paleta de colores (${A.reset}${term.theme}${A.gray})${A.reset}`);
      term.write(`${A.gray}  · el efecto CRT${A.reset}`);
      term.write(`${A.gray}  · el modo de terminal (${A.reset}${term.ttyMode}${A.gray})${A.reset}`);
      const n = term.history.length;
      term.write(`${A.gray}  · el historial de comandos (${A.reset}${n}${A.gray} ${n === 1 ? "entrada" : "entradas"})${A.reset}`);
      term.write("");
      const yes = await term.confirm(`${A.bold}${A.byellow}¿Continuar?${A.reset}`);
      if (!yes) {
        term.write(`${A.gray}Cancelado. No se ha borrado nada.${A.reset}`);
        return;
      }
      const removed = term.clearStorage();
      term.history.length = 0;
      term.histIdx = 0;
      term.applyTheme(site.defaultTheme, false);
      term.setCRT(false, false);
      term.setTTYMode(site.defaultTTY, false);
      term.write("");
      if (removed.length) {
        for (const k of removed) term.write(`${A.gray}removed '${A.reset}${k}${A.gray}'${A.reset}`);
      } else {
        term.write(`${A.gray}No había nada guardado.${A.reset}`);
      }
      term.write("");
      term.write(`${A.bgreen}Ajustes restaurados a los valores por defecto.${A.reset}`);
      term.write(`${A.gray}Vuelve a empezar con ${A.reset}${A.bgreen}reboot${A.reset}${A.gray}.${A.reset}`);
    },
  });

  term.register({
    name: "reboot",
    group: "sistema",
    aliases: ["home", "inicio", "init"],
    desc: "Reinicia la sesión y vuelve a la pantalla de bienvenida",
    run: async () => {
      term.write("");
      await term.typeLines(
        [
          `${A.gray}Broadcast message from root@${site.hostname}:${A.reset}`,
          `${A.gray}  El sistema se está reiniciando AHORA.${A.reset}`,
          `${A.gray}systemd-shutdown: enviando SIGTERM a todos los procesos...${A.reset}`,
          `${A.gray}desconferencia.service: detenido (los datos siguen en git)${A.reset}`,
        ],
        90
      );
      await term.sleep(320);
      term.reset();
      const anchor = await boot(term);
      // Deja ver un momento las líneas de kernel antes de bajar al "neofetch".
      term.scrollToTop();
      if (!term.skipRequested) await term.sleep(450);
      term.pendingAnchor = anchor;
    },
  });

  term.register({
    name: "whoami",
    group: "sistema",
    desc: "¿Quién eres?",
    run: () => {
      term.write(site.user);
      term.write(`${A.gray}Un participante más. Aquí no hay asistentes pasivos: si tienes algo que contar, ${A.reset}${A.bgreen}./contacto${A.reset}`);
    },
  });

  term.register({
    name: "date",
    group: "sistema",
    desc: "Fecha y hora local",
    run: () => term.write(new Date().toString()),
  });

  term.register({
    name: "uptime",
    group: "sistema",
    desc: "Cuánto llevas aquí y cuánto queda para el evento",
    run: () => {
      const secs = Math.floor(performance.now() / 1000);
      const mm = String(Math.floor(secs / 60)).padStart(2, "0");
      const ss = String(secs % 60).padStart(2, "0");
      const start = eventStart(site);
      term.write(
        ` ${new Date().toTimeString().slice(0, 8)} up ${mm}:${ss}, 1 user, ` +
          `load average: 0.42, 0.31, 0.28`
      );
      if (!start) {
        term.write(
          `${A.gray}${site.title} todavía no tiene fecha: ${A.reset}${A.byellow}pendiente de confirmar${A.reset}${A.gray}.${A.reset}`
        );
        return;
      }
      const days = Math.ceil((start - new Date()) / 86400000);
      term.write(
        days > 0
          ? `${A.gray}Faltan ${A.reset}${A.bold}${A.byellow}${days}${A.reset}${A.gray} días para ${site.title}.${A.reset}`
          : `${A.bgreen}El evento ya ha pasado (o está pasando). Nos vemos en la siguiente.${A.reset}`
      );
    },
  });

  term.register({
    name: "countdown",
    group: "sistema",
    aliases: ["cuenta"],
    desc: "Cuenta atrás detallada",
    run: () => {
      const start = eventStart(site);
      if (!start) {
        term.write(
          `${A.byellow}Aún no hay fecha que contar.${A.reset}${A.gray} Las fechas de ${site.edition} están sin confirmar;${A.reset}`
        );
        term.write(
          `${A.gray}en cuanto se cierren, esta cuenta atrás empieza a correr. Avisamos por ${A.reset}${A.bcyan}@${site.twitter}${A.reset}${A.gray}.${A.reset}`
        );
        return;
      }
      const diff = start - new Date();
      if (diff <= 0) return term.write(`${A.bgreen}¡Ya estamos dentro!${A.reset}`);
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      term.write(`${A.bold}${A.byellow}${d}${A.reset}${A.gray}d ${A.reset}${A.bold}${A.byellow}${h}${A.reset}${A.gray}h ${A.reset}${A.bold}${A.byellow}${m}${A.reset}${A.gray}m ${A.reset}${A.bold}${A.byellow}${s}${A.reset}${A.gray}s para ${site.datesHuman}${A.reset}`);
    },
  });

  term.register({
    name: "echo",
    group: "sistema",
    usage: "echo <texto>",
    desc: "Repite lo que le digas",
    run: (args) => term.write(args.join(" "), { wrap: true }),
  });

  term.register({
    name: "env",
    group: "sistema",
    desc: "Variables de entorno",
    run: () => {
      const env = {
        USER: site.user,
        HOME: fs.home,
        SHELL: `/bin/${site.shell.split(" ")[0]}`,
        TERM: "xterm-256color",
        COLUMNS: term.cols,
        LANG: "es_ES.UTF-8",
        MINDCAMP_EDITION: site.edition,
        MINDCAMP_CODENAME: site.editionName,
        MINDCAMP_DATES: site.datesHuman,
        MINDCAMP_VENUE: site.venue,
        THEME: term.theme,
      };
      for (const [k, v] of Object.entries(env)) {
        term.write(`${A.bcyan}${k}${A.gray}=${A.reset}${v}`);
      }
    },
  });

  term.register({
    name: "theme",
    group: "sistema",
    usage: "theme [nombre|list]",
    desc: `Cambia la paleta (${THEMES.join(", ")})`,
    run: (args) => {
      const a = args[0];
      if (!a || a === "list" || a === "-l") {
        term.write(`${A.gray}Paletas disponibles:${A.reset}`);
        for (const t of THEMES) {
          term.writeLineHTML(
            `  ${act(`theme ${t}`, t === term.theme ? "f11 bo" : "f10", t.padEnd(12))}` +
              sp("f8", t === term.theme ? "← activa" : "")
          );
        }
        return;
      }
      if (!THEMES.includes(a)) return term.error(`theme: «${a}» no existe. Prueba: theme list`);
      term.applyTheme(a);
      term.write(`${A.gray}Paleta ${A.reset}${A.byellow}${a}${A.reset}${A.gray} aplicada.${A.reset}`);
    },
  });

  term.register({
    name: "crt",
    group: "sistema",
    usage: "crt [on|off]",
    desc: "Activa/desactiva el efecto de monitor CRT",
    run: (args) => {
      const on = args[0] ? /^(on|1|si|sí|yes)$/i.test(args[0]) : !document.body.classList.contains("crt");
      term.setCRT(on);
      term.write(`${A.gray}Efecto CRT ${on ? "activado" : "desactivado"}.${A.reset}`);
    },
  });

  term.register({
    name: "share",
    group: "sistema",
    desc: "Enlaces para compartir el evento",
    run: () => {
      const url = location.origin + location.pathname;
      const text = `${site.title} — ${site.datesHuman} — ${site.venue}`;
      term.writeLineHTML(
        `${sp("f8", "url .....: ")}<a href="${esc(url)}">${esc(url)}</a>`
      );
      term.writeLineHTML(
        `${sp("f8", "twitter .: ")}<a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text + " " + url)}" target="_blank" rel="noopener">tuitear ↗</a>`
      );
      term.writeLineHTML(
        `${sp("f8", "cuenta ..: ")}<a href="https://twitter.com/${esc(site.twitter)}" target="_blank" rel="noopener">@${esc(site.twitter)} ↗</a>`
      );
      if (site.youtube) {
        term.writeLineHTML(
          `${sp("f8", "vídeos ..: ")}<a href="${esc(site.youtube)}" target="_blank" rel="noopener">playlist de YouTube ↗</a>`
        );
      }
    },
  });

  /* --- diversión ------------------------------------------------------- */

  term.register({
    name: "sudo",
    group: "diversión",
    usage: "sudo <cualquier cosa>",
    desc: "No, no tienes permisos",
    run: (args) => {
      if (args.join(" ").includes("rm -rf")) {
        term.write(`${A.bred}${A.bold}[sudo] contraseña para ${site.user}: ${A.reset}`);
        term.write(`${A.gray}...${A.reset}`);
        term.error(`${site.user} no está en el fichero sudoers. Este incidente se reportará.`);
        term.write(`${A.gray}(y también a tus compañeros, en la charla del sábado a las 22:00)${A.reset}`);
        return;
      }
      term.error(`${site.user} no está en el fichero sudoers. Este incidente se reportará.`);
    },
  });

  term.register({
    name: "rm",
    group: "diversión",
    hidden: true,
    run: (args) => {
      if (args.includes("-rf") || args.includes("-fr")) {
        term.error("rm: se niega a eliminar '/' recursivamente");
        term.write(`${A.gray}Buen intento. El contenido es estático y está en git.${A.reset}`);
      } else {
        term.error("rm: sistema de ficheros de sólo lectura");
      }
    },
  });

  term.register({
    name: "vim",
    group: "diversión",
    aliases: ["vi", "nano", "emacs", "ed"],
    hidden: true,
    run: (args, t) => {
      t.write(`${A.gray}Abriendo ${args[0] || "un fichero"} en vim...${A.reset}`);
      t.write(`${A.byellow}Para salir: :q! ... si consigues acordarte.${A.reset}`);
      t.write(`${A.gray}(spoiler: esta web ya usa una barra de estado tipo vim-airline)${A.reset}`);
    },
  });

  term.register({
    name: "cowsay",
    group: "diversión",
    usage: "cowsay <texto>",
    desc: "Una vaca dice lo que le mandes",
    run: (args) => {
      const msg = args.join(" ") || `Nos vemos en ${site.title}`;
      const line = "-".repeat(msg.length + 2);
      term.write(` _${line}_`);
      term.write(`< ${msg} >`);
      term.write(` -${line}-`);
      term.write("        \\   ^__^");
      term.write("         \\  (oo)\\_______");
      term.write("            (__)\\       )\\/\\");
      term.write("                ||----w |");
      term.write("                ||     ||");
    },
  });

  const FORTUNES = [
    "En el MindCamp, «funciona en mi máquina» es una charla, no una excusa.",
    "La barbacoa del sábado es el único despliegue que nunca falla.",
    "Toda arquitectura sencilla acaba siendo un arco de iglesia gótico.",
    "El proyector detecta el miedo. Y el HDMI, también.",
    "Si a las 03:00 alguien dice «esto lo arreglo en cinco minutos», huye.",
    "El cubo de agua es el único despertador con SLA del 100%.",
    "No hay nada más permanente que un script temporal escrito en un BarCamp.",
    "Las mejores charlas son las que no estaban en la agenda.",
  ];

  term.register({
    name: "fortune",
    group: "diversión",
    desc: "Sabiduría de desconferencia",
    run: () => {
      const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      term.write(`${A.byellow}${f}${A.reset}`, { wrap: true });
    },
  });

  term.register({
    name: "ps",
    group: "diversión",
    hidden: true,
    run: () => {
      term.write(`${A.bold}  PID TTY          TIME CMD${A.reset}`);
      const procs = [
        [1, "systemd --user"],
        [42, "desconferencia.service"],
        [101, "cafeina --infinita"],
        [666, "docker pull todo:latest"],
        [1337, "proyector --arreglar-con xrandr"],
        [2049, "barbacoa --supervisada-por-comite"],
        [4096, "mcsh"],
      ];
      for (const [pid, cmd] of procs) {
        term.write(`${String(pid).padStart(5)} pts/0    00:00:0${pid % 9} ${cmd}`);
      }
    },
  });

  term.register({
    name: "free",
    group: "diversión",
    hidden: true,
    run: () => {
      term.write(`${A.bold}               total        used        free      shared${A.reset}`);
      term.write("Neuronas:        100          97           3          42");
      term.write("Cafeína:         512         511           1         512");
      term.write("Sueño:            24          23           1           0");
    },
  });

  term.register({
    name: "ping",
    group: "diversión",
    hidden: true,
    usage: "ping <host>",
    run: async (args) => {
      const host = args[0] || "themindcamp.net";
      term.write(`PING ${host} (127.0.0.1) 56(84) bytes of data.`);
      for (let i = 1; i <= 4; i++) {
        await term.sleep(220);
        term.write(`64 bytes from ${host}: icmp_seq=${i} ttl=64 time=${(Math.random() * 3 + 0.2).toFixed(3)} ms`);
      }
      term.write("");
      term.write(`--- ${host} ping statistics ---`);
      term.write("4 packets transmitted, 4 received, 0% packet loss");
    },
  });

  term.register({
    name: "exit",
    group: "sistema",
    aliases: ["logout", "quit"],
    desc: "Cerrar la sesión (o eso intenta)",
    run: () => {
      term.write(`${A.gray}logout${A.reset}`);
      term.write("");
      term.write(`${A.bold}${A.byellow}No se sale del MindCamp. El MindCamp sale de ti.${A.reset}`);
      term.write(`${A.gray}Sigue con ${A.reset}${A.bgreen}ls${A.reset}${A.gray}, o empieza de cero con ${A.reset}${A.bgreen}reboot${A.reset}${A.gray}.${A.reset}`);
    },
  });

  /* --- páginas de manual ---------------------------------------------- */

  function manPage(t, name) {
    const cmd = t.resolveCommand(name);
    if (!cmd) {
      t.error(`man: no hay entrada de manual para ${name}`);
      return;
    }
    const aliases = [...t.aliases.entries()].filter(([, v]) => v === cmd.name).map(([k]) => k);
    sectionHeader(t, `man ${cmd.name}`, "MINDCAMP(1)");
    t.write(`${A.bold}NOMBRE${A.reset}`);
    t.write(`    ${cmd.name} — ${cmd.desc || "sin descripción"}`);
    t.write("");
    t.write(`${A.bold}SINOPSIS${A.reset}`);
    t.write(`    ${A.bgreen}${cmd.usage || cmd.name}${A.reset}`);
    if (aliases.length) {
      t.write("");
      t.write(`${A.bold}ALIAS${A.reset}`);
      t.write(`    ${aliases.join(", ")}`);
    }
    const sec = payload.sections.find((s) => s.slug === cmd.name);
    if (sec) {
      t.write("");
      t.write(`${A.bold}DESCRIPCIÓN${A.reset}`);
      t.write(`    Imprime la sección «${sec.title}» del evento.`);
      t.write(`    Fuente: ${A.bcyan}content/sections/${sec.slug}.md${A.reset}`);
    }
    t.write("");
    t.write(`${A.gray}Ver también: ${A.reset}${A.bgreen}help${A.reset}`);
  }

  /* --- utilidades internas -------------------------------------------- */

  function longLine(node, s) {
    const size = humanSize(node.size).padStart(6);
    const owner = node.type === "exe" ? "root" : s.user;
    const group = node.type === "exe" ? "root" : "mindcamp";
    return (
      sp("f8", node.mode + "  1 ") +
      sp("f14", owner.padEnd(10)) +
      sp("f8", group.padEnd(10)) +
      sp("f11", size) +
      sp("f8", ` ${node.mtime}  `) +
      nodeHTML(node)
    );
  }

  return { manPage };
}
