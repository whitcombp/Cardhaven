// TO RUN: python -m http.server
// ===============================
// GLOBAL STATE
// ===============================

let cards = [];

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
// SEARCH AND HEALTH / XP TRACKERS
// ===============================

const healthInput = document.getElementById("health");
const xpInput = document.getElementById("xp");

// Optional: event listeners for up/down arrows or value changes
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
// LOAD CARD DATA
// ===============================

async function loadCards() {
    const response = await fetch("cards.json");
    const data = await response.json();
  
    cards = data.map((cardObj, index) => ({
      id: index + 1,
      name: cardObj.name,
      level: cardObj.level,
      image: cardObj.filename
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
    .sort((a, b) => a.level - b.level)
    .forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = "image-card";
    cardEl.draggable = true;
    cardEl.dataset.cardId = card.id;

    if (selectedCardIds.has(card.id)) {
      cardEl.classList.add("selected");
    }

    cardEl.innerHTML = `
      <img src="${card.image}" alt="${card.name}">
      <div class="image-label">${card.name}</div>
    `;

    cardEl.addEventListener("click", (e) => {
      onCardClick(e, card.id);
    });

    cardEl.addEventListener("dragstart", (e) => {
        draggedCardId = card.id;
      
        // If the dragged card isn't selected, drag only that card
        if (!selectedCardIds.has(card.id)) {
        //   clearSelection();
          selectedCardIds.add(card.id);
        //   renderCurrentPile();
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
  // Modifier shortcuts
  if (event.shiftKey) {
    moveSingleCard(cardId, "hand");
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    moveSingleCard(cardId, "discard");
    return;
  }

  // Normal selection toggle
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

    // -------------------------------
    // CLICK: navigate OR move selected
    // -------------------------------
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
  
    // -------------------------------
    // DRAG OVER: allow drop
    // -------------------------------
    btn.addEventListener("dragover", (e) => {
      e.preventDefault(); // REQUIRED for drop to work
      btn.classList.add("drag-over");
    });
  
    // -------------------------------
    // DRAG LEAVE: visual cleanup
    // -------------------------------
    btn.addEventListener("dragleave", () => {
      btn.classList.remove("drag-over");
    });
  
    // -------------------------------
    // DROP: move dragged / selected
    // -------------------------------
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

loadCards();
