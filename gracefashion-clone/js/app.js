const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const lerp = (a, b, t) => a + (b - a) * t;

function progressBetween(el, start = 0, end = 1) {
  const rect = el.getBoundingClientRect();
  const h = el.offsetHeight - window.innerHeight;
  if (h <= 0) return 1;
  const p = -rect.top / h;
  return clamp((p - start) / (end - start), 0, 1);
}

function setupHero() {
  const stage = document.querySelector(".hero-stage");
  const video = stage?.querySelector("video");
  const pixels = stage?.querySelector(".hero-pixel");
  const logo = stage?.querySelector(".hero-logo-inner");
  const bg = stage?.querySelectorAll(".hero-bg");
  if (!stage || !pixels) return;

  pixels.innerHTML = "";
  for (let i = 0; i < 100; i += 1) {
    const s = document.createElement("span");
    s.style.opacity = "1";
    pixels.appendChild(s);
  }
  const cells = [...pixels.children];
  cells.forEach((cell, i) => {
    const delay = (i % 10) * 18 + Math.floor(i / 10) * 12;
    setTimeout(() => {
      cell.style.transition = "opacity 520ms ease";
      cell.style.opacity = "0";
    }, 280 + delay);
  });
  if (logo) {
    logo.style.opacity = "0";
    logo.style.transform = "scale(0.96)";
    requestAnimationFrame(() => {
      logo.style.transition = "opacity 900ms ease, transform 900ms ease";
      logo.style.opacity = "1";
      logo.style.transform = "none";
    });
  }
  video?.play?.().catch(() => {});

  const tick = () => {
    const p = clamp(-stage.getBoundingClientRect().top / window.innerHeight, 0, 1);
    bg.forEach((node) => {
      node.style.filter = `blur(${p * 8}px)`;
      node.style.transform = `scale(${1 + p * 0.08})`;
    });
    stage.querySelector(".hero-container").style.transform = `translateY(${p * -8}%)`;
  };
  tick();
  window.addEventListener("scroll", tick, { passive: true });
}

function setupDeck() {
  const wrap = document.querySelector("[data-deck]");
  if (!wrap) return;
  const headline = wrap.querySelector(".deck-headline");
  const cards = [...wrap.querySelectorAll(".deck-card")];
  const labels = [...wrap.querySelectorAll("[data-deck-label]")];
  const copy = [
    ["Stunning", "campaigns."],
    ["Beautiful", "lookbooks."],
    ["Perfect", "product shots."],
  ];

  const tick = () => {
    const p = progressBetween(wrap);
    const headEnd = 0.18;
    if (headline) headline.style.opacity = String(clamp(1 - p / headEnd, 0, 1));
    cards.forEach((card, i) => {
      const start = 0.16 + i * 0.24;
      const local = clamp((p - start) / 0.22, 0, 1);
      const y = lerp(110, 0, local);
      card.style.transform = `translateY(${y}vh)`;
    });
    const active = p < 0.4 ? 0 : p < 0.64 ? 1 : 2;
    labels.forEach((el) => {
      const side = el.dataset.deckLabel;
      el.textContent = copy[active][side === "left" ? 0 : 1];
      el.style.opacity = p > 0.16 ? "1" : "0";
    });
  };
  tick();
  window.addEventListener("scroll", tick, { passive: true });
}

function setupDoor() {
  const wrap = document.querySelector("[data-door]");
  if (!wrap) return;
  const canvas = wrap.querySelector(".ai-door-canvas");
  const scene = wrap.querySelector(".ai-door-scene");
  const zoom = wrap.querySelector(".ai-door-zoom");
  const figures = [...wrap.querySelectorAll("[data-shot]")];
  const pack = wrap.querySelector("[data-pack]");
  const line = wrap.querySelector("[data-door-line]");
  const cursor = wrap.querySelector("[data-cursor]");
  const positions = [
    { x: -28, y: -8, r: -8 },
    { x: 26, y: -14, r: 7 },
    { x: -32, y: 18, r: -4 },
    { x: 30, y: 16, r: 6 },
    { x: -8, y: -26, r: -2 },
    { x: 10, y: 26, r: 3 },
  ];

  const tick = () => {
    const p = progressBetween(wrap);
    const intro = clamp(p / 0.22, 0, 1);
    const scatter = clamp((p - 0.18) / 0.35, 0, 1);
    const cover = clamp((p - 0.62) / 0.28, 0, 1);
    if (line) {
      line.style.opacity = String(1 - scatter);
    }
    if (pack) {
      const s = lerp(6, 1, intro);
      pack.style.opacity = "1";
      pack.style.transform = `scale(${s})`;
    }
    figures.forEach((fig, i) => {
      const t = clamp((scatter - i * 0.04) / 0.55, 0, 1);
      const pos = positions[i];
      fig.style.opacity = String(t * (1 - cover));
      fig.style.transform = `translate(-50%, -50%) translate(${pos.x * t}vw, ${pos.y * t}vh) rotate(${pos.r * t}deg) scale(${lerp(0.34, 1, t)})`;
    });
    if (cursor) {
      cursor.style.opacity = String(scatter * (1 - cover));
      cursor.style.transform = `translate(${13 * scatter}vw, ${15 * scatter}vh)`;
    }
    if (canvas) canvas.style.transform = `scale(${lerp(1.18, 1, scatter)})`;
    if (scene) scene.style.transform = `scale(${lerp(1.1, 1, scatter)})`;
    if (zoom) {
      zoom.style.transform = `translateY(${lerp(100, 0, cover)}%)`;
      zoom.style.opacity = String(cover > 0.02 ? 1 : 0);
    }
  };
  tick();
  window.addEventListener("scroll", tick, { passive: true });
}

function setupReveals() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add("is-in");
      });
    },
    { threshold: 0.2 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

function setupQuotes() {
  const quotes = [...document.querySelectorAll("[data-quote]")];
  const tabs = [...document.querySelectorAll("[data-quote-tab]")];
  const byline = document.querySelector("[data-byline]");
  const fills = [...document.querySelectorAll("[data-tab-fill]")];
  if (!quotes.length) return;
  const meta = [
    "Felix Wolf, Officer Onlineshop & Operations, Carl Gross & Club of Gents, Création Gross GmbH & Co. KG",
    "Ronald Kloiber, Director Global Marketing, Mustang GmbH",
    "Felix Pilgram, Head of Studio, NOVA Studios GmbH (formerly RCom Studios)",
    "Laura Figge & Nadine Rother",
    "Michael Ochmann",
  ];
  let i = 0;
  let started = 0;
  const DURATION = 5600;

  const show = (next) => {
    i = next;
    started = performance.now();
    quotes.forEach((q, idx) => {
      const on = idx === i;
      q.style.opacity = on ? "1" : "0";
      q.style.transform = on ? "none" : "translateY(8px)";
      q.style.pointerEvents = on ? "auto" : "none";
      q.setAttribute("aria-hidden", on ? "false" : "true");
    });
    tabs.forEach((t, idx) => t.setAttribute("aria-selected", idx === i ? "true" : "false"));
    if (byline) {
      const name = meta[i].split(",")[0];
      byline.innerHTML = `<span class="transition-colors duration-700 text-black">${name}</span>, ${meta[i].slice(name.length + 2)}`;
    }
  };

  const loop = (now) => {
    const t = (now - started) / DURATION;
    fills.forEach((el, idx) => {
      el.style.width = idx === i ? `${clamp(t, 0, 1) * 100}%` : "0%";
    });
    if (t >= 1) show((i + 1) % quotes.length);
    requestAnimationFrame(loop);
  };
  tabs.forEach((tab, idx) => tab.addEventListener("click", () => show(idx)));
  show(0);
  requestAnimationFrame(loop);
}

function setupNav() {
  const nav = document.querySelector("nav");
  let last = 0;
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      if (!nav) return;
      nav.style.transform = y > last && y > 80 ? "translateY(-120%)" : "translateY(0)";
      last = y;
    },
    { passive: true }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  setupHero();
  setupDeck();
  setupDoor();
  setupReveals();
  setupQuotes();
  setupNav();
});
