const APP_VERSION = "v1.61";

const API_BASE = "https://elai-fce-d3esdvbtaygrdzap.westeurope-01.azurewebsites.net/api";


/* Zpravy pro prubezne nacitani. */



const loadingMessages = [
"Chv\u00EDli to lad\u00EDm.",
"Dolad\u00EDm detaily.",
"Hlad\u00EDm to do fin\u00E1le.",
"Je\u0161t\u011B mal\u00FD moment.",
"Zpracov\u00E1v\u00E1m to jemn\u011B.",
"T\u00E9m\u011B\u0159 hotovo.",
"Jen to uhlad\u00EDm.",
"Brzy to bude p\u0159ipraven\u00E9."
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
    const res = await fetch(`${API_BASE}/history`);
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

function renderHistory(items) {
  const container = document.getElementById("historySection");
  container.innerHTML = "";

  if (!items.length) return;

  const today = new Date().toISOString().slice(0,10);
  items.sort((a,b)=> new Date(a.date) - new Date(b.date));

  items.forEach(item => {

    const bubble = document.createElement("div");
    bubble.className = "timeline-bubble";

    if (item.date === today) {
      bubble.classList.add("today");
    }

    const dateDiv = document.createElement("div");
    dateDiv.className = "timeline-bubble-date";
    dateDiv.innerText = item.date;

    const mealDiv = document.createElement("div");
    mealDiv.className = "timeline-bubble-meal";
    mealDiv.innerText = item.meal_name || item.meal_id;

    bubble.appendChild(dateDiv);
    bubble.appendChild(mealDiv);
    container.appendChild(bubble);

    if (item.date === today) {
      setTimeout(() => {
        bubble.scrollIntoView({
          inline: "center",
          behavior: "auto"
        });
      }, 0);
    }
  });

  // Prida jemnou bublinu pro zitrejsi den.

  const spacer = document.createElement("div");
  spacer.className = "timeline-bubble";
  spacer.style.opacity = "0.15";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const spacerDate = document.createElement("div");
  spacerDate.className = "timeline-bubble-date";
  spacerDate.innerText = tomorrow.toISOString().slice(0,10);

  const spacerMeal = document.createElement("div");
  spacerMeal.className = "timeline-bubble-meal";
  spacerMeal.innerText = "T\u011B\u0161 se!";

  spacer.appendChild(spacerDate);
  spacer.appendChild(spacerMeal);
  container.appendChild(spacer);

  updateTimelineScale(container);
}


/* Hloubkovy efekt casove osy. */
function updateTimelineScale(container) {
  const bubbles = container.querySelectorAll(".timeline-bubble");
  const center = container.scrollLeft + container.offsetWidth / 2;

  bubbles.forEach(bubble => {
    const bubbleCenter =
      bubble.offsetLeft + bubble.offsetWidth / 2;

    const distance = Math.abs(center - bubbleCenter);
    const maxDistance = container.offsetWidth / 2;

    const ratio = Math.max(0, 1 - distance / maxDistance);

    const scale = 0.7 + ratio * 0.5;
    const opacity = 0.2 + ratio * 0.8;

    bubble.style.transform = `scale(${scale})`;
    bubble.style.opacity = opacity;
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
    const res = await fetch(`${API_BASE}/session`);
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
  wrapper.className = role === "user"
    ? "flex justify-end"
    : "flex justify-start";

  const bubble = document.createElement("div");
  bubble.className = `${
    role === "assistant" ? "assistant-bubble glass text-fuchsia-50 tilt" : "user-bubble text-white"
  }
    max-w-[70%] px-5 py-3
    animate-[fadeIn_0.3s_ease]
    transition-all duration-300 ease-out whitespace-pre-wrap break-words`;
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
  input.classList.toggle("opacity-60", disabled);
  input.classList.toggle("cursor-not-allowed", disabled);

  if (button) {
    button.disabled = disabled;
    button.classList.toggle("opacity-70", disabled);
    button.classList.toggle("cursor-not-allowed", disabled);
  }
}

/* Indikace cekani na odpoved. */
function showLoading() {
  const chat = document.getElementById("chatSection");

  loadingBubble = document.createElement("div");
  loadingBubble.className = "flex justify-start";

  const bubbleInner = document.createElement("div");
  bubbleInner.className = "glass px-5 py-3 rounded-3xl italic text-fuchsia-100";

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const data = await res.json();
    appendMessage("assistant", data.reply || "Backend vr\u00E1til pr\u00E1zdnou odpov\u011B\u010F.");
    await loadHistory();
    setTimeout(scrollChatToBottom, 50);

  } catch (err) {
    console.error("sendMessage failed:", err);
    appendMessage("assistant", "Backend te\u010F neodpov\u00EDd\u00E1. Zkus to pros\u00EDm znovu za chv\u00EDli.");
  } finally {
    hideLoading();
    setComposerDisabled(false);
  }
}

function tryLuck() {
  sendMessage("Co mĂˇm dneska uvaĹ™it?");
}

document.getElementById("messageInput")
  .addEventListener("keypress", function(e) {
    if (e.key === "Enter") sendMessage();
  });

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
