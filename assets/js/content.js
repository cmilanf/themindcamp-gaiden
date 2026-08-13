/* Renderizado del contenido (secciones, agenda y ponentes).
   Todo sale del payload que genera Hugo a partir de los ficheros markdown. */

import { A } from "./ansi.js";
import { act, esc, sp } from "./ui.js";

/* Códigos de cada slot de la agenda. La clave es el valor de `tipo` en el
   front matter; `tag` es la letra que se pinta entre corchetes. */
export const KINDS = {
  keynote: { tag: "K", cls: "f13", label: "keynote" },
  charla: { tag: "C", cls: "f11", label: "charla" },
  descanso: { tag: "D", cls: "f9", label: "descanso / comida" },
  ocio: { tag: "F", cls: "f14", label: "free-for-all / networking" },
  registro: { tag: "R", cls: "f12", label: "registro" },
  visita: { tag: "V", cls: "f10", label: "visita" },
  cierre: { tag: "X", cls: "f1", label: "cierre" },
};

/* Sinónimos aceptados en el front matter. */
const KIND_ALIASES = {
  comida: "descanso",
  cafe: "descanso",
  café: "descanso",
  desayuno: "descanso",
  cena: "descanso",
  networking: "ocio",
  free: "ocio",
  talk: "charla",
};

function kindOf(k) {
  const key = KIND_ALIASES[k] || k;
  return KINDS[key] || { tag: "?", cls: "f7", label: k || "" };
}

export function speakerBySlug(payload, slug) {
  return payload.speakers.find((s) => s.slug === slug) || null;
}

function thumbHTML(url, alt = "") {
  return `<img class="thumb" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}

/** Ponentes de una sesión con su foto en miniatura, clicables. */
function speakerChips(payload, slugs) {
  return (slugs || [])
    .map((sl) => {
      const s = speakerBySlug(payload, sl);
      if (!s) return sp("f14", sl);
      const img = s.photo ? thumbHTML(s.photo, `Foto de ${s.title}`) : "";
      return (
        `<span class="chip act f14" data-cmd="ponentes ${esc(s.slug)}" role="link" tabindex="0"` +
        ` title="Ver ficha de ${esc(s.title)}">${img}${esc(s.title)}</span>`
      );
    })
    .join(sp("f8", "   "));
}

/* ---- Cabecera de sección --------------------------------------------- */

export function sectionHeader(term, title, meta = "") {
  const w = Math.min(term.cols, 100);
  const left = `── ${title} `;
  const right = meta ? ` ${meta} ──` : "──";
  const fill = Math.max(2, w - left.length - right.length);
  term.write(
    `${A.gray}── ${A.reset}${A.bold}${A.byellow}${title}${A.reset} ` +
      `${A.gray}${"─".repeat(fill)}${meta ? ` ${A.bcyan}${meta}${A.gray} ──` : "──"}${A.reset}`
  );
  term.write("");
}

/* ---- Secciones -------------------------------------------------------- */

export async function runSection(term, sec, args) {
  const payload = term.payload;

  if (term.setCurrentSection) term.setCurrentSection(sec.slug);
  if (location.hash.replace(/^#/, "") !== sec.slug) {
    history.replaceState(null, "", `#${sec.slug}`);
  }

  if (sec.generator === "speakers" && args.length && !args[0].startsWith("-")) {
    return renderSpeakerDetail(term, args[0]);
  }
  if (sec.generator === "agenda" && args.length && !args[0].startsWith("-")) {
    const found = payload.agenda.find((s) => s.slug === args[0]);
    if (found) return renderSessionDetail(term, found);
  }

  sectionHeader(term, sec.title, `${sec.slug}.md`);
  term.writeHTML(sec.html, "md");

  if (sec.generator === "agenda") renderAgenda(term, args);
  else if (sec.generator === "speakers") renderSpeakerList(term, args);

  footerHint(term, sec);
}

function footerHint(term, sec) {
  const hints = {
    agenda: "agenda 1|2|3 · agenda <id> · agenda --full",
    speakers: "ponentes <id> · ponentes --all",
  };
  const h = hints[sec.generator];
  term.write("");
  term.write(
    `${A.gray}fuente: ${A.reset}${A.bcyan}sections/${sec.slug}.md${A.reset}` +
      (h ? `${A.gray}  ·  ${A.reset}${A.gray}${h}${A.reset}` : "")
  );
}

/* ---- Agenda ----------------------------------------------------------- */

const DAY_ALIASES = {
  1: 1, viernes: 1, vie: 1, v: 1, fri: 1,
  2: 2, sabado: 2, sábado: 2, sab: 2, sáb: 2, s: 2, sat: 2,
  3: 3, domingo: 3, dom: 3, d: 3, sun: 3,
};

export function renderAgenda(term, args = []) {
  const payload = term.payload;
  const full = args.includes("--full") || args.includes("-f");
  const positional = args.filter((a) => !a.startsWith("-"));
  let days = payload.site.days;

  if (positional.length) {
    const key = String(positional[0]).toLowerCase();
    const n = DAY_ALIASES[key];
    if (!n) {
      term.error(`agenda: no reconozco el día «${positional[0]}»`);
      term.write(`${A.gray}Usa 1, 2, 3 o viernes/sabado/domingo.${A.reset}`);
      return;
    }
    days = days.filter((d) => d.n === n);
  }

  for (const day of days) {
    const sessions = payload.agenda.filter((s) => s.day === day.n);
    if (!sessions.length) continue;
    term.write("");
    term.write(
      `${A.bold}${A.bwhite}${day.label}${A.reset}  ` +
        `${A.gray}(${sessions.length} entradas)${A.reset}`
    );
    term.write(`${A.gray}${"╌".repeat(Math.min(term.cols, 72))}${A.reset}`);

    for (const s of sessions) {
      const k = kindOf(s.kind);
      const title = act(`agenda ${s.slug}`, "f15", s.title, "Ver detalle");
      let extra = "";
      if (s.speakers && s.speakers.length) {
        extra = `\n           ${sp("f8", "└─")} ${speakerChips(payload, s.speakers)}`;
      } else if (s.image) {
        extra =
          `\n           ${sp("f8", "└─")} <span class="chip f8">` +
          `${thumbHTML(s.image, s.imageCaption || s.title)}${esc(s.imageCaption || "")}</span>`;
      }
      term.writeLineHTML(
        `  ${sp("f10", s.time)}  ${sp(k.cls, `[${k.tag}]`)}  ${title}${extra}`,
        "tline wrap"
      );
      if (full) term.writeHTML(s.html, "md");
    }
  }

  term.write("");
  const legend = Object.values(KINDS)
    .map((k) => `${sp(k.cls, `[${k.tag}]`)} ${sp("f8", k.label)}`)
    .join("  ");
  term.writeLineHTML(legend);
}

export function renderSessionDetail(term, s) {
  const k = kindOf(s.kind);
  const day = term.payload.site.days.find((d) => d.n === s.day);
  sectionHeader(term, s.title, `agenda.d/${s.slug}.md`);
  term.writeLineHTML(
    `${sp("f8", "cuándo ..: ")}${sp("f10", `${day ? day.label : ""} · ${s.time}`)}  ` +
      `${sp(k.cls, `[${k.tag}]`)} ${sp("f8", k.label)}`
  );
  if (s.speakers && s.speakers.length) {
    term.writeLineHTML(`${sp("f8", "quién ...: ")}${speakerChips(term.payload, s.speakers)}`);
  }
  term.write("");
  term.writeHTML(s.html, "md");
}

/* ---- Ponentes --------------------------------------------------------- */

export function renderSpeakerList(term, args = []) {
  const payload = term.payload;
  if (args.includes("--all") || args.includes("-a")) {
    for (const s of payload.speakers) renderSpeakerCard(term, s);
    return;
  }
  term.write("");
  const idW = Math.max(...payload.speakers.map((s) => s.slug.length)) + 2;
  for (const s of payload.speakers) {
    const where = [s.role, s.company].filter(Boolean).join(" @ ");
    term.writeLineHTML(
      `  ${act(`ponentes ${s.slug}`, "f10", s.slug.padEnd(idW), "Ver ficha")}` +
        `${sp("f15", s.title)}${sp("f8", where ? `  ·  ${where}` : "")}`
    );
  }
  term.write("");
  term.write(`${A.gray}Total: ${A.reset}${A.bold}${payload.speakers.length}${A.reset}${A.gray} ponentes. Detalle: ${A.reset}${A.bgreen}ponentes <id>${A.reset}`);
}

export function renderSpeakerDetail(term, slug) {
  const s = speakerBySlug(term.payload, slug);
  if (!s) {
    term.error(`ponentes: «${slug}» no está en la lista`);
    term.write(`${A.gray}Prueba con ${A.bgreen}ponentes${A.gray} para ver los identificadores.${A.reset}`);
    return;
  }
  sectionHeader(term, s.title, `ponentes.d/${s.slug}.md`);
  renderSpeakerCard(term, s, true);
}

function renderSpeakerCard(term, s, detailed = false) {
  const links = [];
  if (s.twitter) links.push(`<a href="https://twitter.com/${esc(s.twitter)}" target="_blank" rel="noopener">@${esc(s.twitter)}</a>`);
  if (s.web) links.push(`<a href="${esc(s.web)}" target="_blank" rel="noopener">${esc(s.web.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`);
  const where = [s.role, s.company].filter(Boolean).join(" @ ");

  const head = detailed
    ? ""
    : `<div class="tline">${sp("f11", "▸ ")}${sp("f15", s.title)}${sp("f8", where ? `  ·  ${where}` : "")}</div>`;

  term.writeHTML(
    `<div class="speaker">` +
      (s.photo ? `<img class="avatar" src="${esc(s.photo)}" alt="Foto de ${esc(s.title)}" loading="lazy" decoding="async">` : "") +
      head +
      (detailed
        ? `<div class="tline wrap">${sp("f8", "cargo ...: ")}${sp("f14", where || "—")}</div>` +
          (links.length ? `<div class="tline wrap">${sp("f8", "enlaces .: ")}${links.join(sp("f8", "  ·  "))}</div>` : "") +
          `<div class="md">${s.html}</div>`
        : `<div class="md">${s.html}</div>` +
          (links.length ? `<div class="tline wrap">${sp("f8", "  ")}${links.join(sp("f8", "  ·  "))}</div>` : "")) +
      `</div>`,
    "blk"
  );
}
