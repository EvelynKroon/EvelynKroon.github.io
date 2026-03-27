const USE_LOCAL_PROXY = window.location.hostname === "localhost" && window.location.port === "3000";
const API_ORIGIN = USE_LOCAL_PROXY ? "" : null;
const EXTERNAL_API_BASE = "https://starwars-databank-server.onrender.com/api/v1";
const appContainer = document.getElementById("app");
const cardTemplate = document.getElementById("card-template");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const luckyButton = document.getElementById("lucky-btn");
const modal = document.getElementById("modal");
const modalImage = document.getElementById("modal-image");
const modalTitle = document.getElementById("modal-title");
const modalDetails = document.getElementById("modal-details");
const modalClose = document.querySelector(".modal-close");
const themeButtons = document.querySelectorAll(".theme-btn");
const filterButtons = document.querySelectorAll(".filter-btn");
const FAVORITES_KEY = "sw-favorites-v1";
const THEME_KEY = "sw-theme-v1";
const HISTORY_KEY = "sw-history-v1";
const HISTORY_LIMIT = 10;
const SHIP_CARD_IMAGES = ["assets/111.jpg", "assets/333.png", "assets/555.png"];
const SHIP_MODAL_IMAGES = ["assets/222.png", "assets/444.png", "assets/666.png"];
let currentCategory = "characters";
let allItems = [];
let currentSort = "default";

const prettyTitle = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

async function fetchCategoryItems(category) {
  // Try local proxy only when app itself runs on port 3000.
  if (API_ORIGIN !== null) {
    try {
      const localResponse = await fetch(`${API_ORIGIN}/api/${category}`);
      if (localResponse.ok) {
        const payload = await localResponse.json();
        return normalizeItems(payload);
      }
    } catch {
      // Fall through to external API.
    }
  }

  // Fallback: call external API directly.
  const externalResponse = await fetch(`${EXTERNAL_API_BASE}/${category}?page=1&limit=8`);
  if (!externalResponse.ok) {
    throw new Error(`Could not load ${category}`);
  }

  const payload = await externalResponse.json();
  return normalizeItems(payload).slice(0, 8);
}

function imageOf(item) {
  return (
    item.__customCardImage ||
    item.image ||
    item.image_url ||
    item.poster ||
    item.photo ||
    "https://placehold.co/640x480/111d35/62d0ff?text=Star+Wars"
  );
}

function titleOf(item) {
  return item.name || item.title || item.model || "Unknown";
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch {
    return [];
  }
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(historyItems) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
  updateHistoryTabCount();
}

function historyIdOf(item, category) {
  return `${category}:${item._id || titleOf(item)}`;
}

function rememberViewedItem(item, category) {
  const viewed = getHistory();
  const id = historyIdOf(item, category);

  const filtered = viewed.filter((entry) => entry.__historyId !== id);
  filtered.unshift({
    ...item,
    __category: category,
    __historyId: id,
    __viewedAt: Date.now(),
  });

  saveHistory(filtered.slice(0, HISTORY_LIMIT));
}

function saveFavorites(favorites) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  updateFavoritesTabCount();
}

function favoriteIdOf(item, category) {
  return `${category}:${item._id || titleOf(item)}`;
}

function isFavorite(item, category) {
  const favorites = getFavorites();
  const id = favoriteIdOf(item, category);
  return favorites.some((fav) => fav.__favoriteId === id);
}

function toggleFavorite(item, category) {
  const favorites = getFavorites();
  const id = favoriteIdOf(item, category);
  const existingIndex = favorites.findIndex((fav) => fav.__favoriteId === id);

  if (existingIndex >= 0) {
    favorites.splice(existingIndex, 1);
  } else {
    favorites.push({
      ...item,
      __category: category,
      __favoriteId: id,
    });
  }

  saveFavorites(favorites);
}

function updateFavoritesTabCount() {
  const favorites = getFavorites();
  const favoritesTab = document.querySelector('[data-category="favorites"]');
  if (favoritesTab) {
    favoritesTab.textContent = `⭐ Favorites (${favorites.length})`;
  }
}

function updateHistoryTabCount() {
  const historyItems = getHistory();
  const historyTab = document.querySelector('[data-category="history"]');
  if (historyTab) {
    historyTab.textContent = `🕘 History (${historyItems.length})`;
  }
}

function activateCategoryButton(category) {
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.category === category);
  });
}

function applyTheme(themeName) {
  document.body.classList.remove("theme-dark", "theme-light");
  document.body.classList.add(themeName === "light" ? "theme-light" : "theme-dark");
  localStorage.setItem(THEME_KEY, themeName);

  themeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === themeName);
  });
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const themeName = saved === "light" ? "light" : "dark";
  applyTheme(themeName);
}

// Mock data generators
const mockCharacterData = {
  Luke: { height: "172 cm", mass: "77 kg", gender: "Male" },
  Leia: { height: "150 cm", mass: "49 kg", gender: "Female" },
  Han: { height: "180 cm", mass: "80 kg", gender: "Male" },
  Vader: { height: "202 cm", mass: "136 kg", gender: "Male" },
  Yoda: { height: "66 cm", mass: "17 kg", gender: "Male" },
};

const mockPlanetData = {
  Tatooine: { climate: "Arid/desert", population: "~200,000" },
  Coruscant: { climate: "Temperate", population: "~1 trillion" },
  Hoth: { climate: "Frozen tundra", population: "Rebel base" },
  Dagobah: { climate: "Murky/swamp", population: "Yoda's sanctuary" },
  Alderaan: { climate: "Temperate", population: "Unknown (destroyed)" },
};

const mockShipData = {
  "Millennium Falcon": { model: "YT-1300 transport", speed: "1200 km/h" },
  "X-wing": { model: "T-65B starfighter", speed: "2000+ km/h" },
  "Imperial": { model: "Star Destroyer", speed: "975 km/h" },
  "TIE": { model: "TIE Fighter", speed: "1200 km/h" },
  "Slave": { model: "Firespray-31", speed: "1000 km/h" },
};

function getCharacterInfo(item) {
  const name = titleOf(item);
  const mockData = Object.entries(mockCharacterData).find(([key]) => name.toLowerCase().includes(key.toLowerCase()));
  const data = mockData ? mockData[1] : { height: "Unknown", mass: "Unknown", gender: "Unknown" };
  return {
    name,
    height: data.height,
    mass: data.mass,
    gender: data.gender,
    description: item.description || "No description available.",
  };
}

function getPlanetInfo(item) {
  const name = titleOf(item);
  const mockData = Object.entries(mockPlanetData).find(([key]) => name.toLowerCase().includes(key.toLowerCase()));
  const data = mockData
    ? mockData[1]
    : { climate: "Unknown", population: "Unknown" };
  return {
    name,
    climate: data.climate,
    population: data.population,
    description: item.description || "No description available.",
  };
}

function getShipInfo(item) {
  const name = titleOf(item);
  const mockData = Object.entries(mockShipData).find(([key]) => name.toLowerCase().includes(key.toLowerCase()));
  const data = mockData
    ? mockData[1]
    : { model: "Unknown model", speed: "Unknown speed" };
  return {
    name,
    model: data.model,
    speed: data.speed,
    description: item.description || "No description available.",
  };
}

function parsePopulation(value) {
  if (!value || typeof value !== "string") return 0;

  const lower = value.toLowerCase().replace(/,/g, "");
  const numberMatch = lower.match(/\d+(\.\d+)?/);
  if (!numberMatch) return 0;

  let amount = parseFloat(numberMatch[0]);
  if (Number.isNaN(amount)) return 0;

  if (lower.includes("trillion")) amount *= 1_000_000_000_000;
  else if (lower.includes("billion")) amount *= 1_000_000_000;
  else if (lower.includes("million")) amount *= 1_000_000;
  else if (lower.includes("thousand")) amount *= 1_000;

  return amount;
}

function parseMetricValue(item, category) {
  const effectiveCategory = ["favorites", "history"].includes(category)
    ? (item.__category || "characters")
    : category;

  if (effectiveCategory === "characters") {
    const info = getCharacterInfo(item);
    return parseFloat(info.height) || 0;
  }

  if (effectiveCategory === "locations") {
    const info = getPlanetInfo(item);
    return parsePopulation(info.population);
  }

  if (effectiveCategory === "vehicles") {
    const info = getShipInfo(item);
    return parseFloat(info.speed) || 0;
  }

  return 0;
}

function sortItems(items, category, sortType) {
  const sorted = [...items];

  if (sortType === "name") {
    sorted.sort((a, b) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: "base" }));
  } else if (sortType === "alphabet") {
    sorted.sort((a, b) => titleOf(b).localeCompare(titleOf(a), undefined, { sensitivity: "base" }));
  } else if (sortType === "metric") {
    sorted.sort((a, b) => parseMetricValue(b, category) - parseMetricValue(a, category));
  }

  return sorted;
}

function renderCharacterCard(item) {
  const info = getCharacterInfo(item);
  return `
    <div class="card-stats">
      <div class="stat">
        <span class="stat-label">Height</span>
        <span class="stat-value">${info.height}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Mass</span>
        <span class="stat-value">${info.mass}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Gender</span>
        <span class="stat-value">${info.gender}</span>
      </div>
    </div>
  `;
}

function renderPlanetCard(item) {
  const info = getPlanetInfo(item);
  return `
    <div class="card-stats">
      <div class="stat">
        <span class="stat-label">Climate</span>
        <span class="stat-value">${info.climate}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Population</span>
        <span class="stat-value">${info.population}</span>
      </div>
    </div>
  `;
}

function renderShipCard(item) {
  const info = getShipInfo(item);
  return `
    <div class="card-stats">
      <div class="stat">
        <span class="stat-label">Model</span>
        <span class="stat-value">${info.model}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Speed</span>
        <span class="stat-value">${info.speed}</span>
      </div>
    </div>
  `;
}

function backSummaryOf(item, category) {
  if (category === "characters") {
    const info = getCharacterInfo(item);
    return info.description;
  }

  if (category === "locations") {
    const info = getPlanetInfo(item);
    return `${info.description} Climate: ${info.climate}. Population: ${info.population}.`;
  }

  if (category === "vehicles") {
    const info = getShipInfo(item);
    return `${info.description} Model: ${info.model}. Speed: ${info.speed}.`;
  }

  return item.description || "Star Wars databank entry.";
}

function closeModal() {
  modal.classList.remove("active");
}

function openModal(item) {
  const detailsCategory = item.__category || currentCategory;
  rememberViewedItem(item, detailsCategory);
  modalImage.src = item.__customModalImage || imageOf(item);
  modalImage.alt = titleOf(item);
  modalTitle.textContent = titleOf(item);

  let detailsHTML = "";

  if (detailsCategory === "characters") {
    const info = getCharacterInfo(item);
    detailsHTML = `
      <div class="modal-section">
        <h3>Characteristics</h3>
        <p><strong>Height:</strong> ${info.height}</p>
        <p><strong>Mass:</strong> ${info.mass}</p>
        <p><strong>Gender:</strong> ${info.gender}</p>
      </div>
      <div class="modal-section">
        <h3>Biography</h3>
        <p>${info.description}</p>
      </div>
      <div class="modal-section">
        <h3>Homeworld</h3>
        <p>Tatooine</p>
      </div>
    `;
  } else if (detailsCategory === "locations") {
    const info = getPlanetInfo(item);
    detailsHTML = `
      <div class="modal-section">
        <h3>Planet Information</h3>
        <p><strong>Climate:</strong> ${info.climate}</p>
        <p><strong>Population:</strong> ${info.population}</p>
      </div>
      <div class="modal-section">
        <h3>Description</h3>
        <p>${info.description}</p>
      </div>
      <div class="modal-section">
        <h3>Terrain</h3>
        <p>Varied terrain with deserts and cities</p>
      </div>
    `;
  } else if (detailsCategory === "vehicles") {
    const info = getShipInfo(item);
    detailsHTML = `
      <div class="modal-section">
        <h3>Specifications</h3>
        <p><strong>Model:</strong> ${info.model}</p>
        <p><strong>Speed:</strong> ${info.speed}</p>
        <p><strong>Class:</strong> Starfighter</p>
      </div>
      <div class="modal-section">
        <h3>Description</h3>
        <p>${info.description}</p>
      </div>
      <div class="modal-section">
        <h3>Armament</h3>
        <p>Laser cannons and missiles</p>
      </div>
    `;
  }

  modalDetails.innerHTML = detailsHTML;
  modal.classList.add("active");
}

function renderCards(category, items) {
  const block = document.createElement("section");
  block.className = "category-block";

  const heading = document.createElement("h2");
  const headingLabel = category === "favorites"
    ? "Favorites"
    : category === "history"
      ? "Recently Viewed"
      : prettyTitle(category);
  heading.textContent = `${headingLabel} (${items.length})`;

  const grid = document.createElement("div");
  grid.className = "card-grid";

  for (const item of items) {
    const fragment = cardTemplate.content.cloneNode(true);
    const image = fragment.querySelector(".card-image");
    const title = fragment.querySelector(".card-title");
    const backTitle = fragment.querySelector(".card-back-title");
    const backDescription = fragment.querySelector(".card-back-description");
    const backActions = fragment.querySelector(".card-back-actions");
    const statsContainer = fragment.querySelector(".card-stats-container");
    const card = fragment.querySelector(".card");
    const itemCategory = ["favorites", "history"].includes(category)
      ? (item.__category || "characters")
      : category;

    if (category === "vehicles" && itemCategory === "vehicles") {
      const cardImage = SHIP_CARD_IMAGES[grid.children.length];
      const modalImagePath = SHIP_MODAL_IMAGES[grid.children.length];
      if (cardImage) {
        item.__customCardImage = cardImage;
      }
      if (modalImagePath) {
        item.__customModalImage = modalImagePath;
      }
    }

    image.src = imageOf(item);
    image.alt = `${titleOf(item)} image`;
    title.textContent = titleOf(item);
    if (backTitle) {
      backTitle.textContent = titleOf(item);
    }
    if (backDescription) {
      backDescription.textContent = backSummaryOf(item, itemCategory);
    }

    let statsHTML = "";
    if (itemCategory === "characters") {
      statsHTML = renderCharacterCard(item);
    } else if (itemCategory === "locations") {
      statsHTML = renderPlanetCard(item);
    } else if (itemCategory === "vehicles") {
      statsHTML = renderShipCard(item);
    }

    if (statsContainer) {
      statsContainer.innerHTML = statsHTML;
    }

    if (backActions) {
      const favoriteButton = document.createElement("button");
      favoriteButton.className = `favorite-btn ${isFavorite(item, itemCategory) ? "active" : ""}`;
      favoriteButton.type = "button";
      favoriteButton.textContent = isFavorite(item, itemCategory) ? "★ Favorite" : "☆ Add to Favorites";
      favoriteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFavorite(item, itemCategory);

        if (currentCategory === "favorites") {
          renderFavorites();
          return;
        }

        const nowFavorite = isFavorite(item, itemCategory);
        favoriteButton.classList.toggle("active", nowFavorite);
        favoriteButton.textContent = nowFavorite ? "★ Favorite" : "☆ Add to Favorites";
      });

      backActions.appendChild(favoriteButton);
    }

    // Add click listener to open modal
    card.addEventListener("click", () => {
      openModal(item);
    });

    grid.appendChild(fragment);
  }

  block.appendChild(heading);
  block.appendChild(grid);
  appContainer.appendChild(block);
}

function filterAndRender(query) {
  if (!allItems.length) return;

  const filtered = allItems.filter((item) => {
    const name = titleOf(item).toLowerCase();
    return name.includes(query.toLowerCase());
  });

  const sorted = sortItems(filtered, currentCategory, currentSort);

  appContainer.innerHTML = "";

  if (sorted.length === 0) {
    renderStatus(`No results found for "${query}"`);
    return;
  }

  renderCards(currentCategory, sorted);
}

function applySearchAndSort() {
  const query = searchInput.value.trim();

  if (!allItems.length) {
    if (currentCategory === "favorites") {
      renderStatus("No favorites yet. Add cards with the favorite button.");
    } else if (currentCategory === "history") {
      renderStatus("No view history yet. Open character cards to build your timeline.");
    }
    return;
  }

  if (query.length === 0) {
    appContainer.innerHTML = "";
    const sorted = sortItems(allItems, currentCategory, currentSort);
    renderCards(currentCategory, sorted);
    return;
  }

  filterAndRender(query);
}

function renderFavorites() {
  currentCategory = "favorites";
  appContainer.innerHTML = "";

  const favorites = getFavorites();
  allItems = favorites;
  applySearchAndSort();
}

function renderHistory() {
  currentCategory = "history";
  appContainer.innerHTML = "";

  const historyItems = getHistory();
  allItems = historyItems;
  applySearchAndSort();
}

function renderStatus(message) {
  const status = document.createElement("p");
  status.className = "status";
  status.textContent = message;
  appContainer.appendChild(status);
}

async function load(category) {
  currentCategory = category;
  appContainer.innerHTML = "";

  if (category === "favorites") {
    renderFavorites();
    return;
  }

  if (category === "history") {
    renderHistory();
    return;
  }

  renderStatus(`Loading ${prettyTitle(category)}...`);

  try {
    allItems = await fetchCategoryItems(category);
    appContainer.innerHTML = "";
    applySearchAndSort();
  } catch (error) {
    appContainer.innerHTML = "";
    renderStatus(`Failed to load ${category}. Please try again.`);
    console.error(error);
  }
}

async function showRandomCharacter() {
  activateCategoryButton("characters");
  currentCategory = "characters";
  searchInput.value = "";
  sortSelect.value = "default";
  currentSort = "default";

  appContainer.innerHTML = "";
  renderStatus("Scanning the holonet for a random hero...");

  try {
    const characterPool = await fetchCategoryItems("characters");
    allItems = characterPool;

    if (characterPool.length === 0) {
      appContainer.innerHTML = "";
      renderStatus("No character data available right now.");
      return;
    }

    const randomIndex = Math.floor(Math.random() * characterPool.length);
    const randomCharacter = characterPool[randomIndex];

    appContainer.innerHTML = "";
    renderCards("characters", [randomCharacter]);
  } catch (error) {
    appContainer.innerHTML = "";
    renderStatus("Failed to fetch a random character. Please try again.");
    console.error(error);
  }
}

// Initialize with characters
initTheme();
updateFavoritesTabCount();
updateHistoryTabCount();
load("characters");

// Attach event listeners to filter buttons
filterButtons.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    activateCategoryButton(e.target.dataset.category);
    searchInput.value = "";
    sortSelect.value = "default";
    currentSort = "default";
    const selectedCategory = e.target.dataset.category;
    if (selectedCategory === "favorites") {
      renderFavorites();
      return;
    }
    if (selectedCategory === "history") {
      renderHistory();
      return;
    }
    load(selectedCategory);
  });
});

luckyButton.addEventListener("click", showRandomCharacter);

// Attach event listener to search input
searchInput.addEventListener("input", (e) => {
  filterAndRender(e.target.value);
});

sortSelect.addEventListener("change", (e) => {
  currentSort = e.target.value;
  applySearchAndSort();
});

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.theme);
  });
});

// Attach event listeners to modal
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    closeModal();
  }
});
