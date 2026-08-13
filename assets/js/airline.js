/* Barra superior estilo vim-airline: modo, "rama", menú de secciones y
   posición. Los elementos del menú simplemente ejecutan comandos. */

export function initAirline(term) {
  const menu = document.getElementById("al-menu");
  const drop = document.getElementById("al-drop");
  const toggle = document.getElementById("al-toggle");
  const fileEl = document.getElementById("al-file");
  const homeBtn = document.getElementById("al-home");

  // El bloque de la esquina superior izquierda reinicia la sesión.
  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      drop.classList.remove("open");
      term.submit("reboot");
    });
  }

  const items = [
    ...term.payload.sections.map((s) => ({ cmd: `./${s.slug}`, label: s.slug, title: s.summary || s.title })),
    { cmd: "help", label: "help", title: "Todos los comandos" },
  ];

  const build = (host, isDrop) => {
    host.replaceChildren();
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "al-item";
      b.dataset.target = it.label;
      b.title = it.title || "";
      b.textContent = isDrop ? it.cmd : it.label;
      b.addEventListener("click", () => {
        if (isDrop) drop.classList.remove("open");
        term.submit(it.cmd);
        term.focus();
      });
      host.appendChild(b);
    }
  };

  build(menu, false);
  build(drop, true);

  toggle.addEventListener("click", () => {
    const open = drop.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (!drop.contains(e.target) && e.target !== toggle) drop.classList.remove("open");
  });

  term.setCurrentSection = (slug) => {
    for (const host of [menu, drop]) {
      for (const b of host.querySelectorAll(".al-item")) {
        b.setAttribute("aria-current", String(b.dataset.target === slug));
      }
    }
    if (fileEl) fileEl.textContent = slug ? `${slug}.md` : "~";
  };

  term.setCurrentSection(null);
}
