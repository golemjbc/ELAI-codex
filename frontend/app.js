const APP_VERSION = "v1.83";

const API_BASE = "https://elai-fce-d3esdvbtaygrdzap.westeurope-01.azurewebsites.net/api";

// Klic funkce z Azure Portalu (Function App -> Functions -> App keys).
// Bez nej Azure po zapnuti auth_level=FUNCTION vraci 401.
// Skutecna hodnota se sem vklada az pri nasazeni pres GitHub Actions
// (repo secret FUNCTION_KEY), nikdy neni soucasti gitu.
const FUNCTION_KEY = "__FUNCTION_KEY__";

const AUTH_HEADERS = { "x-functions-key": FUNCTION_KEY };


/* Zpravy pro prubezne nacitani. */



const loadingMessages = [
"Chvíli to ladím.",
"Doladím detaily.",
"Hladím to do finále.",
"Ještě malý moment.",
"Zpracovávám to jemně.",
"Téměř hotovo.",
"Jen to uhladím.",
"Brzy to bude připravené.",
"Hážu ingredience do hrnce...",
"Míchám AI recept...",
"Dochucuji to špetkou magie...",
"Kontroluji, jestli se to nepřipaluje...",
"Ještě kapku inspirace...",
"Tohle bude dobrota...",
"Už to bublá správně...",
"Ladím chuť k dokonalosti...",
"Připravuji něco speciálního...",
"Za chvíli servíruju!",
"Rozehřívám pánev...",
"Míchám to k dokonalosti...",
"Dochucuji poslední detaily...",
"Nechávám to chvíli probublat...",
"Servíruji něco dobrého...",
"Ještě špetku kreativity...",
"Pomalu to zraje...",
"Už to voní skvěle...",
"Chystám něco lahodného...",
"Už to skoro můžeme servírovat..."
];

let loadingBubble = null;
let loadingInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
  await loadHistory();
  await loadSession();
});

/* Historie jidelnicku. */
async function loadHistory() {
  try {
    const res = await fetch(`${API_BASE}/history`, { headers: AUTH_HEADERS });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const history = data.history || [];
    renderHistory(filterLast14Days(history));
  } catch (err) {
    console.error("loadHistory failed:", err);
  }
}

function filterLast14Days(history) {
  const now = new Date();
  return history.filter(item => {
    const d = new Date(item.date);
    return (now - d) / (1000 * 60 * 60 * 24) <= 14;
  });
}

const MEAL_TYPE_LABELS = { snidane: "Snídaně", obed: "Oběd", vecere: "Večeře" };
const MEAL_TYPE_ORDER = { snidane: 0, obed: 1, vecere: 2 };
const WEEKDAY_LABELS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);

  if (diffDays === 0) return "Dnes";
  if (diffDays === -1) return "Včera";
  if (diffDays === 1) return "Zítra";
  return `${WEEKDAY_LABELS[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

function groupHistoryByDate(items) {
  const byDate = new Map();
  items.forEach(item => {
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  });

  return Array.from(byDate.entries())
    .map(([date, meals]) => ({
      date,
      meals: meals.sort((a, b) =>
        (MEAL_TYPE_ORDER[a.type] ?? 9) - (MEAL_TYPE_ORDER[b.type] ?? 9)
      )
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderHistory(items) {
  const container = document.getElementById("historySection");
  container.innerHTML = "";

  const today = new Date().toISOString().slice(0, 10);
  const days = groupHistoryByDate(items);

  if (!days.some(day => day.date === today)) {
    days.push({ date: today, meals: [] });
    days.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  days.forEach(day => {
    const card = document.createElement("div");
    card.className = "day-card";
    if (day.date === today) card.classList.add("today");

    const dateDiv = document.createElement("div");
    dateDiv.className = "day-card-date";
    dateDiv.innerText = formatDayLabel(day.date);
    card.appendChild(dateDiv);

    if (!day.meals.length) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "day-card-empty";
      emptyDiv.innerText = "Zatím nic";
      card.appendChild(emptyDiv);
    }

    day.meals.forEach(meal => {
      const mealRow = document.createElement("div");
      mealRow.className = "day-card-meal";

      const typeSpan = document.createElement("span");
      typeSpan.className = "day-card-meal-type";
      typeSpan.innerText = MEAL_TYPE_LABELS[meal.type] || meal.type || "";

      const nameSpan = document.createElement("span");
      nameSpan.className = "day-card-meal-name";
      nameSpan.innerText = meal.meal_name || meal.meal_id;

      mealRow.appendChild(typeSpan);
      mealRow.appendChild(nameSpan);
      card.appendChild(mealRow);
    });

    container.appendChild(card);

    if (day.date === today) {
      setTimeout(() => {
        card.scrollIntoView({ inline: "center", behavior: "auto" });
      }, 0);
    }
  });

  updateTimelineScale(container);
}


/* Hloubkovy efekt casove osy. */
function updateTimelineScale(container) {
  const cards = container.querySelectorAll(".day-card");
  const center = container.scrollLeft + container.offsetWidth / 2;

  cards.forEach(card => {
    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
    const distance = Math.abs(center - cardCenter);
    const maxDistance = container.offsetWidth / 2;
    const ratio = Math.max(0, 1 - distance / maxDistance);

    const scale = 0.85 + ratio * 0.15;
    const opacity = 0.35 + ratio * 0.65;

    card.style.transform = `scale(${scale})`;
    card.style.opacity = opacity;
  });
}

let ambientMotionFrame = null;

function updateAmbientMotion() {
  if (ambientMotionFrame) return;

  ambientMotionFrame = requestAnimationFrame(() => {
    ambientMotionFrame = null;

    const wallpaper = document.querySelector(".wallpaper-layer");
    const aurora = document.querySelector(".aurora-layer");
    const chat = document.getElementById("chatSection");
    const timeline = document.getElementById("historySection");

    const verticalScroll = Math.max(
      window.scrollY || 0,
      chat ? chat.scrollTop : 0
    );
    const horizontalScroll = timeline ? timeline.scrollLeft : 0;

    if (wallpaper) {
      wallpaper.style.transform =
        `translate3d(${horizontalScroll * -0.02}px, ${verticalScroll * -0.04}px, 0) scale(1.08)`;
    }

    if (aurora) {
      aurora.style.transform =
        `translate3d(${horizontalScroll * 0.015}px, ${verticalScroll * -0.06}px, 0) scale(1.03)`;
    }
  });
}

/* Dnesni konverzace a vykresleni chatu. */
async function loadSession() {
  try {
    const res = await fetch(`${API_BASE}/session`, { headers: AUTH_HEADERS });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const today = new Date().toISOString().slice(0,10);
    const session = (data.sessions || []).find(s => s.date === today);
    if (session) renderChat(session.messages);
  } catch (err) {
    console.error("loadSession failed:", err);
  }
}

function renderChat(messages) {
  const chat = document.getElementById("chatSection");
  chat.innerHTML = "";
  messages.forEach(msg => appendMessage(msg.role, msg.content));
  setTimeout(scrollChatToBottom, 50);
}

function appendMessage(role, content) {
  const chat = document.getElementById("chatSection");
  const wrapper = document.createElement("div");
  wrapper.className = role === "user" ? "msg-row msg-row-user" : "msg-row msg-row-assistant";

  const bubble = document.createElement("div");
  bubble.className = role === "assistant"
    ? "bubble bubble-assistant glass tilt fade-in"
    : "bubble bubble-user fade-in";
  bubble.textContent = content;
  wrapper.appendChild(bubble);

  chat.appendChild(wrapper);
}

function scrollChatToBottom() {
  const chat = document.getElementById("chatSection");
  chat.scrollTop = chat.scrollHeight;
}

function setComposerDisabled(disabled) {
  const input = document.getElementById("messageInput");
  const button = document.getElementById("sendButton");

  input.disabled = disabled;
  if (button) {
    button.disabled = disabled;
  }
}

/* Indikace cekani na odpoved. */
function showLoading() {
  const chat = document.getElementById("chatSection");

  loadingBubble = document.createElement("div");
  loadingBubble.className = "msg-row msg-row-assistant";

  const bubbleInner = document.createElement("div");
  bubbleInner.className = "bubble bubble-loading glass";

  bubbleInner.innerText =
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

  loadingBubble.appendChild(bubbleInner);
  chat.appendChild(loadingBubble);
  scrollChatToBottom();

  loadingInterval = setInterval(() => {
    bubbleInner.innerText =
      loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
  }, 2000);
}

function hideLoading() {
  if (loadingInterval) clearInterval(loadingInterval);
  if (loadingBubble) loadingBubble.remove();
  loadingBubble = null;
}

/* Odeslani zpravy na backend. */
async function sendMessage(customMessage) {
  const input = document.getElementById("messageInput");
  const message = customMessage !== undefined
    ? String(customMessage).trim()
    : input.value.trim();
  if (!message) return;

  appendMessage("user", message);
  if (customMessage === undefined) {
    input.value = "";
  }
  scrollChatToBottom();

  showLoading();
  setComposerDisabled(true);

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body: JSON.stringify({ message })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const data = await res.json();
    appendMessage("assistant", data.reply || "Backend vrátil prázdnou odpověď.");
    await loadHistory();
    setTimeout(scrollChatToBottom, 50);

  } catch (err) {
    console.error("sendMessage failed:", err);
    appendMessage("assistant", "Backend teď neodpovídá. Zkus to prosím znovu za chvíli.");
  } finally {
    hideLoading();
    setComposerDisabled(false);
  }
}

function tryLuck() {
  sendMessage("Co mám dnes uvařit?");
}

document.getElementById("messageInput")
  .addEventListener("keypress", function(e) {
    if (e.key === "Enter") sendMessage();
  });

/* Reakce na vysunutou klavesnici na mobilu (posun vstupni listy + doscrollovani chatu). */
function setupKeyboardHandling() {
  const inputWrapper = document.querySelector(".input-wrapper");
  const input = document.getElementById("messageInput");
  const vv = window.visualViewport;
  if (!inputWrapper || !vv) return;

  function update() {
    const keyboardInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    inputWrapper.style.setProperty("--kb-inset", `${keyboardInset}px`);
  }

  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();

  if (input) {
    input.addEventListener("focus", () => {
      setTimeout(() => {
        update();
        scrollChatToBottom();
      }, 300);
    });
    input.addEventListener("blur", () => {
      setTimeout(update, 300);
    });
  }
}

/* Tilt efekt pro sklenene bubliny. */

function enableTiltEffects() {
  const elements = document.querySelectorAll(".tilt:not([data-tilt])");

  elements.forEach(el => {

    el.dataset.tilt = "true";


    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const rotateX = ((y / rect.height) - 0.5) * -2.5;
      const rotateY = ((x / rect.width) - 0.5) * 2.5;

      el.style.transform =
        `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

      const lightX = (x / rect.width) * 100;
      const lightY = (y / rect.height) * 100;

      el.style.setProperty(
        "--light",
        `${lightX}% ${lightY}%`
      );
    });

    el.addEventListener("mouseleave", () => {
      el.style.transform =
        "perspective(800px) rotateX(0deg) rotateY(0deg)";
    });
  });
}

/* Po pridani zpravy znovu zapne tilt efekt. */
const originalAppendMessage = appendMessage;
appendMessage = function(role, content) {
  originalAppendMessage(role, content);
  enableTiltEffects();
};

/* Inicializace efektu po nacteni stranky. */
document.addEventListener("DOMContentLoaded", () => {
  enableTiltEffects();
  updateAmbientMotion();
  setupKeyboardHandling();

  window.addEventListener("scroll", updateAmbientMotion, { passive: true });

  const chatSection = document.getElementById("chatSection");
  if (chatSection) {
    chatSection.addEventListener("scroll", updateAmbientMotion, { passive: true });
  }

  const historySection = document.getElementById("historySection");
  if (historySection) {
    historySection.addEventListener("scroll", () => {
      updateTimelineScale(historySection);
      updateAmbientMotion();
    }, { passive: true });
  }
});

document.getElementById("appVersion").textContent = APP_VERSION;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

/* Skryty trik: 2 tuknuti na logo do 600ms vynuti aktualizaci appky. */
async function forceUpdate() {
  const tagline = document.querySelector(".brand-tagline");
  if (tagline) tagline.textContent = "aktualizuji...";

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } finally {
    // Cisty reload() muze na mobilu porad sahnout do HTTP cache
    // prohlizece - novy query string to spolehlive obejde.
    location.href = location.pathname + "?fresh=" + Date.now();
  }
}

(function setupForceUpdateHold() {
  const logo = document.querySelector(".brand-logo");
  if (!logo) return;

  let holdTimer = null;

  const startHold = () => {
    holdTimer = setTimeout(() => {
      holdTimer = null;
      forceUpdate();
    }, 800);
  };

  const cancelHold = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  logo.addEventListener("pointerdown", startHold);
  logo.addEventListener("pointerup", cancelHold);
  logo.addEventListener("pointerleave", cancelHold);
  logo.addEventListener("pointercancel", cancelHold);
  logo.addEventListener("contextmenu", e => e.preventDefault());
})();
