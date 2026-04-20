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

const pileContainer = document.getElementById("pile-container");
const flipButton = document.getElementById("flip-button");
const reshuffleButton = document.getElementById("reshuffle-button");
const blessButton = document.getElementById("bless-button");
const curseButton = document.getElementById("curse-button");
const drawnStack = document.getElementById("drawn-container");

// ===============================
// LOAD DECK DATA
// ===============================

async function loadDeck() {
  const params = new URLSearchParams(window.location.search);
  const character = params.get("character") || "plagueherald";

  const response = await fetch(`/flips?character=${character}`);
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
  deck = shuffleArray([
    ...deck,
    ...actualDrawPile
  ]);

  reshuffleButton.classList.remove("reshuffle-needed");

  actualDrawPile = [];
  displayDrawPile = [];
  renderDeck();
  renderDrawnPile();
}

function drawCard() {
  // shuffle if no cards
  if (deck.length === 0) {
    reshuffleDeck();
  }
  
  deck = shuffleArray(deck); // shuffle for random card
  const drawn = deck.pop();
  // check for curse / bless
  if (drawn.card === CURSE_CARD.card || drawn.card === BLESS_CARD.card) {
    displayDrawPile.push(drawn);
    // don't push to actual draw pile, effectively removing it from the deck
  } else {
    displayDrawPile.push(drawn);
    actualDrawPile.push(drawn);
  }

  // render with updated deck status
  renderDeck();
  renderDrawnPile();

  // update reshuffle button UI if a reshuffle card is drawn
  if (drawn.reshuffle) {
    reshuffleButton.classList.add("reshuffle-needed");
  }
}

function addCardToDeck(cardObj) {
  deck.push({
    ...cardObj,
    id: Date.now() + Math.random() // since we don't have index anymore
  });
  renderDeck();
}

// ===============================
// BUTTON HANDLERS
// ===============================

flipButton.addEventListener("click", drawCard);

reshuffleButton.addEventListener("click", reshuffleDeck);

blessButton.addEventListener("click", () => {
  addCardToDeck(BLESS_CARD);
});

curseButton.addEventListener("click", () => {
  addCardToDeck(CURSE_CARD);
});

// ===============================
// RENDERING
// ===============================

function renderDeck() {
  pileContainer.innerHTML = "";

  deck.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "image-card";

    cardEl.innerHTML = `
      <img src="${card.card}" alt="Flip card">
    `;

    pileContainer.appendChild(cardEl);
  });
}

function renderDrawnPile() {
  drawnStack.innerHTML = "";

  reversed = displayDrawPile.toReversed()

  reversed.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "image-card";

    cardEl.innerHTML = `
      <img src="${card.card}" alt="Drawn flip">
    `;

    drawnStack.appendChild(cardEl);
  })
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
