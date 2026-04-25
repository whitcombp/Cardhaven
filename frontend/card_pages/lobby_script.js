// ===============================
// LOBBY.JS
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

let ws       = null;
let roomId   = null;
let lobbyBase = window.location.origin; // e.g. http://localhost

// ===============================
// DOM
// ===============================

const roomSetupEl       = document.getElementById("room-setup");
const roomLobbyEl       = document.getElementById("room-lobby");
const roomCodeEl        = document.getElementById("room-code");
const playersListEl     = document.getElementById("players-list");
const playFeedEl        = document.getElementById("play-feed");
const setupErrorEl      = document.getElementById("setup-error");
const joinInput         = document.getElementById("join-room-input");

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

document.getElementById("clear-feed-btn").addEventListener("click", () => {
  playFeedEl.innerHTML = "";
  showFeedEmpty();
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
    // Auth handshake — send token as first message
    ws.send(JSON.stringify({ token }));
  });

  ws.addEventListener("message", (e) => {
    let event;
    try { event = JSON.parse(e.data); } catch { return; }
    handleLobbyEvent(event);
  });

  ws.addEventListener("close", () => {
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
      // Our own join confirmation — switch to lobby view
      showLobby();
      upsertPlayer(event.username);
      break;

    case "player_joined":
      upsertPlayer(event.username);
      appendSystemMessage(`${event.username} joined.`);
      break;

    case "player_left":
      removePlayer(event.username);
      appendSystemMessage(`${event.username} left.`);
      break;

    case "player_list":
      // Full player list sent on join
      (event.players || []).forEach(upsertPlayer);
      break;

    case "cards_played":
      appendCardPlay(event);
      break;

    default:
      // Generic action events published from card page
      if (event.action === "cards_played") {
        appendCardPlay(event);
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
  showFeedEmpty();
}

function showSetupError(msg) {
  setupErrorEl.textContent = msg;
}

function showFeedEmpty() {
  if (playFeedEl.children.length === 0) {
    playFeedEl.innerHTML = `<p class="feed-empty">No cards played yet. Get to it!</p>`;
  }
}

// ===============================
// PLAYERS LIST
// ===============================

function upsertPlayer(name) {
  const existingEl = document.getElementById(`player-${CSS.escape(name)}`);
  if (existingEl) return; // already listed

  const color = getPlayerColor(name);
  const li = document.createElement("li");
  li.className = "player-item";
  li.id = `player-${name}`;

  const isYou = name === username;

  li.innerHTML = `
    <span class="player-dot" style="background:${color}"></span>
    <span class="player-name">${escapeHtml(name)}</span>
    ${isYou ? `<span class="player-you">you</span>` : ""}
  `;

  playersListEl.appendChild(li);
}

function removePlayer(name) {
  const el = document.getElementById(`player-${name}`);
  if (el) el.remove();
}

// ===============================
// FEED — card play entries
// ===============================

function appendCardPlay(event) {
  // Clear empty-state placeholder
  const emptyEl = playFeedEl.querySelector(".feed-empty");
  if (emptyEl) emptyEl.remove();

  const color = getPlayerColor(event.username);
  const cards = event.payload?.cards || [];
  const fromPile = event.payload?.from_pile || "";

  const entry = document.createElement("div");
  entry.className = "feed-entry";

  const ts = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  entry.innerHTML = `
    <div class="feed-entry-header">
      <span class="feed-player-dot" style="background:${color}"></span>
      <span class="feed-username" style="color:${color}">${escapeHtml(event.username)}</span>
      ${fromPile ? `<span class="feed-pile-label">from ${fromPile}</span>` : ""}
      <span class="feed-timestamp">${ts}</span>
    </div>
    <div class="feed-cards">
      ${cards.map(card => `
        <div class="feed-card" style="border-color:${color}" title="${escapeHtml(card.name)}">
          <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}" loading="lazy">
        </div>
      `).join("")}
    </div>
  `;

  playFeedEl.appendChild(entry);

  // Auto-scroll to latest
  playFeedEl.scrollTop = playFeedEl.scrollHeight;
}

function appendSystemMessage(msg) {
  const p = document.createElement("p");
  p.style.cssText = "color:#444;font-size:0.78rem;text-align:center;padding:2px 0;";
  p.textContent = msg;
  playFeedEl.appendChild(p);
  playFeedEl.scrollTop = playFeedEl.scrollHeight;
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