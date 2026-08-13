/* Secuencia de arranque + MOTD de bienvenida. */

import { A } from "./ansi.js";
import { connectionHint, renderLogo } from "./logo.js";
import { act, sp } from "./ui.js";

function ts(t) {
  return `${A.gray}[${String(t.toFixed(6)).padStart(12)}]${A.reset}`;
}

export async function boot(term) {
  const s = term.site;
  const p = term.payload;
  let t = 0;
  const step = (dt, text) => {
    t += dt;
    return `${ts(t)} ${text}`;
  };

  const ok = `${A.bgreen}  OK  ${A.reset}`;
  const lines = [
    step(0, `${A.bold}MindCampOS${A.reset} ${s.kernel} (${s.arch}) arrancando...`),
    step(0.004312, `tty: /dev/pts/0 lista · TERM=xterm-256color · ${term.cols} columnas`),
    step(0.007190, `net: enlace establecido · ${connectionHint()}`),
    step(0.011907, `fs: montando ${A.bcyan}/home/${s.user}${A.reset} desde markdown (ro)`),
    step(0.006004, `hugo: ${p.sections.length} secciones, ${p.speakers.length} ponentes, ${p.agenda.length} sesiones indexadas`),
    step(0.008881, `[${ok}] desconferencia.service`),
    step(0.003002, `[${ok}] cafeina.service (modo infinito)`),
    step(0.002771, `[${ok}] barbacoa.timer → sábado 20:00`),
    step(0.004119, `[${ok}] cubo-de-agua.timer → armado, 10:00 en punto`),
    step(0.005230, `mcsh: leyendo ${A.bcyan}~/.mcshrc${A.reset}`),
    step(0.001880, `${A.bgreen}listo.${A.reset}`),
  ];

  await term.typeLines(lines, 55);
  // Línea en blanco que además sirve de ancla: al acabar el arranque la vista
  // se desplaza hasta aquí para dejar el "neofetch" arriba.
  const anchor = term.writeLineHTML("&nbsp;", "tline");
  renderLogo(term);
  term.write("");
  motd(term);
  return anchor;
}

export function motd(term) {
  const s = term.site;
  const w = Math.min(term.cols, 84);

  term.write(`${A.gray}${"═".repeat(w)}${A.reset}`);
  term.writeWrapped(
    `${A.bold}${A.bwhite}${s.title}${A.reset}${A.gray} — ${s.tagline}${A.reset}`
  );
  term.write("");
  term.writeWrapped(
    `Una desconferencia de ${A.bold}2 días${A.reset} -desde viernes por la noche ` +
    `hastá domingo a medio día- en la que 30 personas se encierran en una casa ` +
      `rural para dar charlas, montar cacharros, jugar y dormir poco.`
  );
  term.write("");
  const dated = Boolean(s.startDate) && !isNaN(new Date(s.startDate));
  term.writeWrapped(
    dated
      ? `  ${A.bcyan}cuándo ..:${A.reset} ${A.bold}${A.bwhite}${s.datesHuman}${A.reset}`
      : `  ${A.bcyan}cuándo ..:${A.reset} ${A.bold}${A.byellow}${s.datesHuman}${A.reset}` +
          ` ${A.gray}(un fin de semana, viernes a domingo)${A.reset}`
  );
  term.writeWrapped(
    `  ${A.bcyan}dónde ...:${A.reset} ${s.venue} ${A.gray}· ${s.address}${A.reset}`
  );
  term.writeWrapped(
    `  ${A.bcyan}precio ..:${A.reset} ${s.price} ${A.gray}(alojamiento + comida + bebida, autogestionado)${A.reset}`
  );
  term.write(`${A.gray}${"═".repeat(w)}${A.reset}`);
  term.write("");

  const chips = [
    ["ls", "ver las secciones"],
    ["./acerca-de", "de qué va esto"],
    ["./agenda", "el planning"],
    ["./ponentes", "quién habla"],
    ["./lugar", "cómo llegar"],
    ["help", "todos los comandos"],
  ];
  term.writeLineHTML(sp("f8", "  Empieza por aquí: "));
  for (const [cmd, desc] of chips) {
    term.writeLineHTML(
      `    ${act(cmd, "f10 bo", cmd.padEnd(14))}${sp("f8", desc)}`
    );
  }
  term.write("");
  term.writeWrapped(
    `${A.gray}Consejo: ${A.reset}${A.byellow}Tab${A.reset}${A.gray} completa, ${A.reset}${A.byellow}↑${A.reset}${A.gray} recupera comandos, ` +
      `y todo lo que veas en ${A.reset}${A.bgreen}verde${A.reset}${A.gray} se puede pulsar con el ratón. ` +
      `Si prefieres los menús, usa la barra de arriba.${A.reset}`
  );
  term.write("");
}
