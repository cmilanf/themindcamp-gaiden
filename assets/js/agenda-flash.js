/* Consulta rápida de la agenda. Consume el mismo payload que la terminal y
   reutiliza el catálogo de tipos de sesión (KINDS/kindOf) de content.js para
   que las etiquetas y colores no se dupliquen ni se desincronicen. */

import { kindOf } from "./content.js";

/** Día que debe abrirse por defecto: viernes antes del evento y el día real
 * durante el fin de semana. Comparamos fechas de calendario para que la hora
 * y el cambio de horario del navegador no desplacen la pestaña. */
export function initialAgendaDay(days, startDate, now = new Date()) {
  const friday = days[0]?.n;
  const match = String(startDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match || friday == null) return friday;

  const eventDate = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = Math.round((today - eventDate) / 86400000);
  return days[offset]?.n ?? friday;
}

export function initAgendaFlash(term) {
  const toggle = document.getElementById("agenda-flash-toggle");
  const backdrop = document.getElementById("agenda-flash-backdrop");
  const panel = document.getElementById("agenda-flash");
  const closeButton = document.getElementById("agenda-flash-close");
  const tabs = document.getElementById("agenda-flash-tabs");
  const list = document.getElementById("agenda-flash-list");
  const fullLink = document.getElementById("agenda-flash-full");
  if (!toggle || !backdrop || !panel || !closeButton || !tabs || !list) return;

  const days = term.payload.site.days || [];
  let activeDay = initialAgendaDay(days, term.payload.site.startDate);
  let lastFocus = null;

  const renderList = () => {
    list.replaceChildren();
    const sessions = term.payload.agenda.filter((event) => event.day === activeDay);
    if (!sessions.length) {
      const empty = document.createElement("p");
      empty.className = "agenda-flash-empty";
      empty.textContent = "No hay eventos publicados para este día.";
      list.appendChild(empty);
      return;
    }

    for (const event of sessions) {
      const row = document.createElement("article");
      row.className = "agenda-flash-event";

      const time = document.createElement("time");
      time.className = "agenda-flash-time";
      time.textContent = event.time;

      const detail = document.createElement("div");
      detail.className = "agenda-flash-detail";
      const title = document.createElement("h3");
      title.textContent = event.title;
      const kind = document.createElement("span");
      const k = kindOf(event.kind);
      kind.className = `agenda-flash-kind ${k.cls}`;
      kind.textContent = k.label;
      detail.append(title, kind);
      row.append(time, detail);
      list.appendChild(row);
    }
    list.scrollTop = 0;
  };

  const selectDay = (dayNumber, focus = false) => {
    activeDay = dayNumber;
    for (const tab of tabs.querySelectorAll('[role="tab"]')) {
      const selected = Number(tab.dataset.day) === activeDay;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
    list.setAttribute("aria-labelledby", `agenda-flash-tab-${activeDay}`);
    renderList();
  };

  days.forEach((day) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `agenda-flash-tab-${day.n}`;
    tab.dataset.day = day.n;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", "agenda-flash-list");
    tab.setAttribute("aria-label", day.label);
    tab.textContent = day.short || day.label;
    tab.addEventListener("click", () => selectDay(day.n));
    tabs.appendChild(tab);
  });

  const open = () => {
    lastFocus = document.activeElement;
    backdrop.hidden = false;
    document.body.classList.add("agenda-flash-open");
    toggle.setAttribute("aria-expanded", "true");
    document.getElementById("al-drop")?.classList.remove("open");
    document.getElementById("al-toggle")?.setAttribute("aria-expanded", "false");
    selectDay(activeDay);
    panel.focus();
  };

  const close = () => {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    document.body.classList.remove("agenda-flash-open");
    toggle.setAttribute("aria-expanded", "false");
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
  };

  toggle.addEventListener("click", () => (backdrop.hidden ? open() : close()));
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop && window.matchMedia("(min-width: 721px)").matches) close();
  });
  document.addEventListener("keydown", (event) => {
    if (backdrop.hidden) return;
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [...panel.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  tabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const dayNumbers = days.map((day) => day.n);
    let index = dayNumbers.indexOf(activeDay);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = dayNumbers.length - 1;
    else index = (index + (event.key === "ArrowRight" ? 1 : -1) + dayNumbers.length) % dayNumbers.length;
    selectDay(dayNumbers[index], true);
  });
  fullLink?.addEventListener("click", (event) => {
    event.preventDefault();
    close();
    term.submit("./agenda");
    term.focus();
  });

  if (days.length) selectDay(activeDay);
}
