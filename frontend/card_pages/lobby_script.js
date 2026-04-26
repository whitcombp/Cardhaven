// ===============================
// LOBBY_SCRIPT.JS
// ===============================

const token    = localStorage.getItem("token");
const userId   = localStorage.getItem("user_id");
const username = localStorage.getItem("username");

if (!token) window.location.href = "/login.html";

// ===============================
// PLAYER COLOR POOL
// Distinct enough to tell apart on dark bg
// ===============================

const COLOR_POOL = [
  "#ff6f61", // coral (accent color — first player gets this)
  "#4fc3f7", // sky blue
  "#81c784", // sage green
  "#ffb74d", // amber
  "#ce93d8", // lavender
  "#f06292", // pink
  "#4db6ac", // teal
  "#fff176", // yellow
];

// username -> hex color
const playerColors = {};
let colorIndex = 0;

function getPlayerColor(name) {
  if (!playerColors[name]) {
    playerColors[name] = COLOR_POOL[colorIndex % COLOR_POOL.length];
    colorIndex++;
  }
  return playerColors[name];
}

// ===============================
// STATE
// ===============================

let ws     = null;
let roomId = null;

// ===============================
// DOM
// ===============================

const roomSetupEl     = document.getElementById("room-setup");
const roomLobbyEl     = document.getElementById("room-lobby");
const roomCodeEl      = document.getElementById("room-code");
const playersListEl   = document.getElementById("players-list");
const playerColumnsEl = document.getElementById("player-columns");
const setupErrorEl    = document.getElementById("setup-error");
const joinInput       = document.getElementById("join-room-input");

document.getElementById("logout").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "/login.html";
});

document.getElementById("create-room-btn").addEventListener("click", createRoom);
document.getElementById("join-room-btn").addEventListener("click", () => {
  const code = joinInput.value.trim().toUpperCase();
  if (!code) { showSetupError("Enter a room code."); return; }
  connectToRoom(code);
});

joinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("join-room-btn").click();
});

document.getElementById("copy-room-btn").addEventListener("click", () => {
  navigator.clipboard.writeText(roomId).catch(() => {});
  const btn = document.getElementById("copy-room-btn");
  btn.textContent = "✓";
  setTimeout(() => { btn.textContent = "⎘"; }, 1500);
});

document.getElementById("open-card-page-btn").addEventListener("click", () => {
  window.open(`/index.html?room=${roomId}`, "_blank");
});

// ===============================
// ROOM CREATION
// ===============================

async function createRoom() {
  showSetupError("");
  try {
    const res = await fetch(`${location.protocol}//${location.hostname}:5003/lobby/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error("Failed to create room");
    const data = await res.json();
    connectToRoom(data.room_id);
  } catch (err) {
    showSetupError("Could not create room. Is the lobby service running?");
  }
}

// ===============================
// WEBSOCKET CONNECTION
// ===============================

function connectToRoom(id) {
  showSetupError("");
  roomId = id.toUpperCase();

  // Swap ws:// / wss:// based on page protocol
  const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${wsProtocol}://${location.hostname}:5003/lobby/${roomId}/ws`;

  ws = new WebSocket(wsUrl);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ token }));
    ws._keepalive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "ping" }));
      }
    }, 30000);
  });

  ws.addEventListener("message", (e) => {
    let event;
    try { event = JSON.parse(e.data); } catch { return; }
    handleLobbyEvent(event);
  });

  ws.addEventListener("close", () => {
    clearInterval(ws._keepalive);
    appendSystemMessage("Disconnected from lobby.");
  });

  ws.addEventListener("error", () => {
    showSetupError("WebSocket error — could not connect.");
  });
}

// ===============================
// EVENT HANDLER
// ===============================

function handleLobbyEvent(event) {
  switch (event.type) {
    case "joined":
      showLobby();
      (event.players || []).forEach(p => {
        if (p.color) playerColors[p.username] = p.color;
        upsertPlayerSidebar(p.username);
        ensurePlayerColumn(p.username);
      });
      break;

    case "player_joined":
      if (event.color) playerColors[event.username] = event.color;
      upsertPlayerSidebar(event.username);
      ensurePlayerColumn(event.username);
      appendSystemMessage(`${event.username} joined.`);
      break;

    case "player_left":
      removePlayerSidebar(event.username);
      appendSystemMessage(`${event.username} left.`);
      break;

    case "cards_played":
      ensurePlayerColumn(event.username);
      updateColumnCards(event.username, event.payload?.cards || [], event.payload?.from_pile || "");
      break;

    case "flips_played":
      ensurePlayerColumn(event.username);
      prependColumnFlip(event.username, event.payload?.flips || []);
      break;

    case "flips_reshuffled":
      clearColumnFlips(event.username);
      break;

    default:
      if (event.action === "cards_played") {
        ensurePlayerColumn(event.username);
        updateColumnCards(event.username, event.payload?.cards || [], event.payload?.from_pile || "");
      } else if (event.action === "flips_played") {
        ensurePlayerColumn(event.username);
        prependColumnFlip(event.username, event.payload?.flips || []);
      } else if (event.action === "flips_reshuffled") {
        clearColumnFlips(event.username);
      }
      break;
  }
}

// ===============================
// LOBBY UI
// ===============================

function showLobby() {
  roomSetupEl.classList.add("hidden");
  roomLobbyEl.classList.remove("hidden");
  roomCodeEl.textContent = roomId;
}

function showSetupError(msg) {
  setupErrorEl.textContent = msg;
}

function appendSystemMessage(msg) {
  const bar = document.getElementById("system-messages");
  if (!bar) return;
  bar.textContent = msg;
  setTimeout(() => { bar.textContent = ""; }, 4000);
}

// ===============================
// SIDEBAR PLAYERS LIST
// ===============================

function upsertPlayerSidebar(name) {
  if (document.getElementById(`player-${name}`)) return;

  const color = getPlayerColor(name);
  const isYou = name === username;

  const li = document.createElement("li");
  li.className = "player-item";
  li.id = `player-${name}`;
  li.innerHTML = `
    <span class="player-dot" style="background:${color}"></span>
    <span class="player-name">${escapeHtml(name)}</span>
    ${isYou ? `<span class="player-you">you</span>` : ""}
  `;
  playersListEl.appendChild(li);
}

function removePlayerSidebar(name) {
  document.getElementById(`player-${name}`)?.remove();
}

// ===============================
// PLAYER COLUMNS
// ===============================

function ensurePlayerColumn(name) {
  if (document.getElementById(`col-${name}`)) return;

  const color = getPlayerColor(name);
  const isYou = name === username;

  const col = document.createElement("div");
  col.className = "player-col";
  col.id = `col-${name}`;
  col.innerHTML = `
    <div class="col-header" style="border-bottom:2px solid ${color}">
      <span class="col-dot" style="background:${color}"></span>
      <span class="col-username" style="color:${color}">
        ${escapeHtml(name)}${isYou ? ' <span class="col-you">(you)</span>' : ''}
      </span>
    </div>

    <div class="col-section">
      <p class="col-section-label">Cards Played</p>
      <div class="col-cards" id="col-cards-${name}">
        <p class="col-empty">Waiting...</p>
      </div>
    </div>

    <div class="col-divider"></div>

    <div class="col-section">
      <p class="col-section-label">Flips</p>
      <div class="col-flips" id="col-flips-${name}">
        <p class="col-empty">Waiting...</p>
      </div>
    </div>
  `;

  playerColumnsEl.appendChild(col);
}

// Replace card section — latest play only
function updateColumnCards(name, cards, fromPile) {
  const el = document.getElementById(`col-cards-${name}`);
  if (!el) return;

  const color = getPlayerColor(name);
  const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  el.innerHTML = `
    <div class="col-play-meta">
      ${fromPile ? `<span class="col-pile-label">from ${fromPile}</span>` : ""}
      <span class="col-timestamp">${ts}</span>
    </div>
    <div class="col-card-grid">
      ${cards.map(card => `
        <div class="col-card" style="border-color:${color}" title="${escapeHtml(card.name)}">
          <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}" loading="lazy">
        </div>
      `).join("")}
    </div>
  `;
}

// Prepend flip — newest at top, accumulates downward
function prependColumnFlip(name, flips) {
  const el = document.getElementById(`col-flips-${name}`);
  if (!el) return;

  el.querySelector(".col-empty")?.remove();

  const color = getPlayerColor(name);
  const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const group = document.createElement("div");
  group.className = "col-flip-group";
  group.innerHTML = `
    <span class="col-timestamp">${ts}</span>
    <div class="col-flip-grid">
      ${flips.map(flip => `
        <div class="col-flip-card ${flip.reshuffle ? "reshuffle" : ""}" style="border-color:${color}">
          <img src="${escapeHtml(flip.card)}" alt="flip" loading="lazy">
          ${flip.reshuffle ? `<span class="col-reshuffle-badge">↺</span>` : ""}
        </div>
      `).join("")}
    </div>
  `;

  // Insert at top so newest is first
  el.insertBefore(group, el.firstChild);
}

// Clear flip stack on reshuffle
function clearColumnFlips(name) {
  const el = document.getElementById(`col-flips-${name}`);
  if (!el) return;
  el.innerHTML = `<p class="col-empty">Waiting...</p>`;
}

// ===============================
// UTIL
// ===============================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}