// ===============================
// GLOBAL STATE
// ===============================

let deck = [];
let displayDrawPile = []; // will show curse and bless cards, no removal
let actualDrawPile = []; // curse and bless cards will be removed from here

// Bless / Curse cards (example paths)
const BLESS_CARD = { card: "images/other/ExtraModifiers/bless.png", reshuffle: false };
const CURSE_CARD = { card: "images/other/ExtraModifiers/curse.png", reshuffle: false };

// ===============================
// DOM REFERENCES
// ===============================

const pileContainer   = document.getElementById("pile-container");
const flipButton      = document.getElementById("flip-button");
const reshuffleButton = document.getElementById("reshuffle-button");
const blessButton     = document.getElementById("bless-button");
const curseButton     = document.getElementById("curse-button");
const drawnStack      = document.getElementById("drawn-container");

// ===============================
// AUTH
// ===============================

const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "/login.html";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

function postActivity(event_type, payload) {
  fetch("/activity", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ event_type, payload })
  }).catch(() => {});
}

// ===============================
// LOBBY CONNECTION
// ===============================

const lobbyRoomId = new URLSearchParams(window.location.search).get("room");
let lobbyWs = null;

if (lobbyRoomId) {
  initFlipLobbyConnection(lobbyRoomId);
}

function initFlipLobbyConnection(roomId) {
  const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${wsProtocol}://${location.hostname}:5003/lobby/${roomId}/ws`;

  lobbyWs = new WebSocket(wsUrl);

  lobbyWs.addEventListener("open", () => {
    lobbyWs.send(JSON.stringify({ token }));
    startKeepalive();
  });

  lobbyWs.addEventListener("close", () => {
    stopKeepalive();
  });
}

// Send a single flip card to the lobby
function sendFlipToLobby(flip) {
  if (!lobbyWs || lobbyWs.readyState !== WebSocket.OPEN) return;

  lobbyWs.send(JSON.stringify({
    action: "flips_played",
    card_id: null,
    payload: {
      flips: [{ card: flip.card, reshuffle: flip.reshuffle }],
    },
  }));
}

// Send a reshuffle event so the lobby clears this player's flip stack
function sendReshuffleToLobby() {
  if (!lobbyWs || lobbyWs.readyState !== WebSocket.OPEN) return;

  lobbyWs.send(JSON.stringify({
    action: "flips_reshuffled",
    card_id: null,
    payload: {},
  }));
}

// ===============================
// KEEPALIVE
// Ping every 30s so the WS doesn't time out during AFK gaps
// ===============================

let keepaliveInterval = null;

function startKeepalive() {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    if (lobbyWs && lobbyWs.readyState === WebSocket.OPEN) {
      lobbyWs.send(JSON.stringify({ action: "ping" }));
    }
  }, 30000);
}

function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

// ===============================
// LOAD DECK DATA
// ===============================

async function loadDeck() {
  const params = new URLSearchParams(window.location.search);
  const character = params.get("character") || "plagueherald";

  const response = await fetch(`/flips?character=${character}`, { headers: authHeaders() });
  const data = await response.json();

  deck = data.map((card, index) => ({
    id: index + 1,
    card: card.card,
    reshuffle: card.reshuffle === true
  }));

  reshuffleDeck();
}

// ===============================
// DECK OPERATIONS
// ===============================

function reshuffleDeck() {
  deck = shuffleArray([...deck, ...actualDrawPile]);
  reshuffleButton.classList.remove("reshuffle-needed");
  actualDrawPile = [];
  displayDrawPile = [];

  postActivity("deck_reshuffled", { deck_size: deck.length });
  sendReshuffleToLobby();

  renderDeck();
  renderDrawnPile();
}

function drawCard() {
  if (deck.length === 0) reshuffleDeck();

  deck = shuffleArray(deck);
  const drawn = deck.pop();

  if (drawn.card === CURSE_CARD.card || drawn.card === BLESS_CARD.card) {
    displayDrawPile.push(drawn);
  } else {
    displayDrawPile.push(drawn);
    actualDrawPile.push(drawn);
  }

  postActivity("deck_flipped", {
    card: drawn.card,
    reshuffle_triggered: drawn.reshuffle,
    deck_size: deck.length
  });

  // Auto-send this flip to the lobby immediately
  sendFlipToLobby(drawn);

  renderDeck();
  renderDrawnPile();

  if (drawn.reshuffle) {
    reshuffleButton.classList.add("reshuffle-needed");
  }
}

function addCardToDeck(cardObj) {
  deck.push({ ...cardObj, id: Date.now() + Math.random() });
  renderDeck();
}

// ===============================
// BUTTON HANDLERS
// ===============================

flipButton.addEventListener("click", drawCard);
reshuffleButton.addEventListener("click", reshuffleDeck);
blessButton.addEventListener("click", () => addCardToDeck(BLESS_CARD));
curseButton.addEventListener("click", () => addCardToDeck(CURSE_CARD));

// ===============================
// RENDERING
// ===============================

function renderDeck() {
  pileContainer.innerHTML = "";
  deck.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "image-card";
    cardEl.innerHTML = `<img src="${card.card}" alt="Flip card">`;
    pileContainer.appendChild(cardEl);
  });
}

function renderDrawnPile() {
  drawnStack.innerHTML = "";
  displayDrawPile.toReversed().forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "image-card";
    cardEl.innerHTML = `<img src="${card.card}" alt="Drawn flip">`;
    drawnStack.appendChild(cardEl);
  });
}

// ===============================
// UTILITIES
// ===============================

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ===============================
// INIT
// ===============================

loadDeck();