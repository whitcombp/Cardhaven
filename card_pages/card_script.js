// TO RUN: python -m http.server
// ===============================
// GLOBAL STATE
// ===============================

let cards = [];

let currentCharacter = "plagueherald";

const piles = {
  library: [],
  hand: [],
  discard: [],
  exhaust: []
};

let currentPile = "library";
let selectedCardIds = new Set();
let draggedCardId = null;

// ===============================
// DOM REFERENCES
// ===============================

const pileContainer = document.getElementById("pile-container");
const pileButtons = document.querySelectorAll(".pile-btn");

// ===============================
// CHARACTER SELECTOR
// ===============================

const characterSelect = document.getElementById("character-select");
const loadCharacterBtn = document.getElementById("load-character");

async function loadCharacters() {
  const response = await fetch("/characters");
  const characters = await response.json();

  characters.forEach(char => {
    const opt = document.createElement("option");
    opt.value = char;
    opt.textContent = char.charAt(0).toUpperCase() + char.slice(1);
    characterSelect.appendChild(opt);
  });

  // Set selector to match default character
  characterSelect.value = currentCharacter;
}

loadCharacterBtn.addEventListener("click", () => {
  currentCharacter = characterSelect.value;

  // Reset all piles and state
  piles.library = [];
  piles.hand = [];
  piles.discard = [];
  piles.exhaust = [];
  selectedCardIds.clear();
  currentPile = "library";

  loadCards();
});

// ===============================
// SEARCH AND HEALTH / XP TRACKERS
// ===============================

const healthInput = document.getElementById("health");
const xpInput = document.getElementById("xp");

healthInput.addEventListener("input", () => {
  if (healthInput.value < 0) healthInput.value = 0;
});

xpInput.addEventListener("input", () => {
  if (xpInput.value < 0) xpInput.value = 0;
});

const searchInput = document.getElementById("card-search");
let currentSearch = "";

searchInput.addEventListener("input", (e) => {
  currentSearch = e.target.value.toLowerCase();
  renderCurrentPile();
});

// ===============================
// CLEARING AND SAVING FAVORITES
// ===============================

const saveFavoritesBtn = document.getElementById("save-favorites");
const clearFavoritesBtn = document.getElementById("clear-favorites");

saveFavoritesBtn.addEventListener("click", () => {
  const favoriteCards = cards.filter(card => card.favorite);
  if (favoriteCards.length === 0) return;

  const favoriteNames = favoriteCards
  .map(card => card.name.replace(/\s*\d+(\.\d+)?$/, ''))
  .join("\n");

  const blob = new Blob([favoriteNames], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  window.open(url, "_blank");
});

clearFavoritesBtn.addEventListener("click", () => {
  cards.forEach(card => card.favorite = false);
  renderCurrentPile();
});

// ===============================
// FLIP DECK BUTTON
// ===============================

document.getElementById("open-flip-deck").addEventListener("click", () => {
  window.open(`/flip_deck?character=${currentCharacter}`, "_blank");
});


// ===============================
// LOAD CARD DATA
// ===============================

async function loadCards() {
  const response = await fetch(`/cards?character=${currentCharacter}`);
  const data = await response.json();

  cards = data.map((cardObj, index) => ({
    id: index + 1,
    name: cardObj.name,
    level: Number(cardObj.level),
    image: cardObj.filename,
    favorite: cardObj.favorite === true
  }));

  piles.library = [...cards];
  renderCurrentPile();
}

// ===============================
// RENDERING
// ===============================

function renderCurrentPile() {
  pileContainer.innerHTML = "";

  piles[currentPile]
    .filter(card => card.name.toLowerCase().includes(currentSearch))
    .sort((a, b) => a.level - b.level || a.name.toLowerCase().localeCompare(b.name.toLowerCase())) // sorts alphabetically if level is the same
    .forEach(card => {
      const cardEl = document.createElement("div");
      cardEl.className = "image-card";
      cardEl.draggable = true;
      cardEl.dataset.cardId = card.id;

      if (selectedCardIds.has(card.id)) {
        cardEl.classList.add("selected");
      }

      cardEl.innerHTML = `
        <div class="favorite-icon ${card.favorite ? "active" : ""}"></div>
        <img src="${card.image}" alt="${card.name}">
      `;

      cardEl.addEventListener("click", (e) => {
        onCardClick(e, card.id);
      });

      const favIcon = cardEl.querySelector(".favorite-icon");
      favIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        card.favorite = !card.favorite;
        favIcon.classList.toggle("active");
      });

      cardEl.addEventListener("dragstart", (e) => {
        draggedCardId = card.id;

        if (!selectedCardIds.has(card.id)) {
          selectedCardIds.add(card.id);
        }

        e.dataTransfer.effectAllowed = "move";
      });

      cardEl.addEventListener("dragend", () => {
        draggedCardId = null;
      });

      pileContainer.appendChild(cardEl);
    });

  updatePileButtons();
}

// ===============================
// SELECTION & CLICK LOGIC
// ===============================

function onCardClick(event, cardId) {
  if (event.shiftKey) {
    moveSingleCard(cardId, "hand");
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    moveSingleCard(cardId, "discard");
    return;
  }

  toggleCardSelection(cardId);
}

function toggleCardSelection(cardId) {
  if (selectedCardIds.has(cardId)) {
    selectedCardIds.delete(cardId);
  } else {
    selectedCardIds.add(cardId);
  }

  renderCurrentPile();
}

function clearSelection() {
  selectedCardIds.clear();
}

// ===============================
// CARD MOVEMENT
// ===============================

function moveSingleCard(cardId, toPile) {
  if (toPile === currentPile) return;

  const fromPileCards = piles[currentPile];
  const index = fromPileCards.findIndex(card => card.id === cardId);
  if (index === -1) return;

  const [card] = fromPileCards.splice(index, 1);
  piles[toPile].push(card);

  clearSelection();
  renderCurrentPile();
}

function moveSelectedCards(toPile) {
  if (toPile === currentPile) return;
  if (selectedCardIds.size === 0) return;

  const fromPileCards = piles[currentPile];

  const movingCards = fromPileCards.filter(card =>
    selectedCardIds.has(card.id)
  );

  piles[currentPile] = fromPileCards.filter(
    card => !selectedCardIds.has(card.id)
  );

  piles[toPile].push(...movingCards);

  clearSelection();
  renderCurrentPile();
}

// ===============================
// PILE BUTTON HANDLING
// ===============================

pileButtons.forEach(btn => {

  btn.addEventListener("click", () => {
    const targetPile = btn.dataset.pile;

    if (selectedCardIds.size > 0) {
      moveSelectedCards(targetPile);
    } else if (currentPile !== targetPile) {
      currentPile = targetPile;
      clearSelection();
      renderCurrentPile();
    }
  });

  btn.addEventListener("dragover", (e) => {
    e.preventDefault();
    btn.classList.add("drag-over");
  });

  btn.addEventListener("dragleave", () => {
    btn.classList.remove("drag-over");
  });

  btn.addEventListener("drop", (e) => {
    e.preventDefault();
    btn.classList.remove("drag-over");

    const targetPile = btn.dataset.pile;

    if (selectedCardIds.size > 0) {
      moveSelectedCards(targetPile);
    } else if (draggedCardId !== null) {
      moveSingleCard(draggedCardId, targetPile);
    }
  });
});

function updatePileButtons() {
  pileButtons.forEach(btn => {
    const pileName = btn.dataset.pile;
    btn.classList.toggle("active", pileName === currentPile);

    const countSpan = btn.querySelector(".pile-count");
    countSpan.textContent = `(${piles[pileName].length})`;
  });
}

// ===============================
// INIT
// ===============================

loadCharacters().then(() => loadCards());
