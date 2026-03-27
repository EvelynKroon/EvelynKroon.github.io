let allCats = [];
const FAVORITES_KEY = 'cat-favorites';
const LIKES_KEY = 'cat-likes';
const COMMENTS_KEY = 'cat-comments';
const DONATIONS_KEY = 'cat-donations';
const VIEW_COUNTS_KEY = 'cat-view-counts';
let favoriteCatIds = new Set();
let showFavoritesOnly = false;
let likeCountsByCat = {};
let commentsByCat = {};
let donationTotalsByCat = {};
let viewCountsByCat = {};
const lastViewEventAtByCat = new Map();
const RANDOM_NICKNAMES = [
  'MurkaFan',
  'CatLover99',
  'PurrMaster',
  'WhiskerQueen',
  'SoftPaws',
  'MiaoKing',
  'LunaMoon',
  'ShadowPaws',
  'KittySpark',
  'FluffySoul'
];
const RANDOM_COMMENTS = [
  'Such a sweet face!',
  'I would totally adopt this one.',
  'Those eyes are incredible.',
  'Looks super playful and cute.',
  'Best cat card ever!',
  'So elegant and adorable.',
  'This kitty made my day.',
  'Perfect little hunter vibes.',
  'I love this fluffy baby.',
  'Absolutely precious cat!'
];
const FACTS_BY_BREED = {
  persian: [
    'Persian cats are known for calm temperament and love predictable routines.',
    'Persians often prefer quiet spaces and gentle interaction.',
    'Regular grooming is important for Persian cats due to long fur.'
  ],
  tabby: [
    'Tabby is a coat pattern, not a breed.',
    'Many tabbies are highly social and curious explorers.',
    'Classic tabbies often have a distinct M-shaped mark on the forehead.'
  ],
  siamese: [
    'Siamese cats are often very vocal and communicative.',
    'Siamese cats are usually strongly bonded with their humans.',
    'Siamese cats are known for intelligence and quick learning.'
  ],
  mix: [
    'Mixed-breed cats often combine diverse personality traits.',
    'Many mixed cats are highly adaptable to new homes.',
    'Play sessions help mixed-breed cats stay mentally active.'
  ],
  domestic: [
    'Domestic cats can understand routines and daily feeding times well.',
    'Short interactive play can reduce stress-related behavior in cats.',
    'Cats often feel safer when they have elevated resting spots.'
  ]
};
const GENERAL_CAT_FACTS = [
  'Cats can rotate their ears to track sounds from different directions.',
  'Slow blinking is a common cat signal of trust and comfort.',
  'Short daily play sessions can significantly improve cat wellbeing.',
  'Scratching helps cats stretch muscles and mark territory.',
  'Many cats prefer running water and may drink more from fountains.'
];
const HAPPY_ENDINGS = [
  {
    name: 'Sandy',
    beforeImage: 'https://cataas.com/cat?width=420&height=280&t=sandy-before',
    afterImage: 'https://cataas.com/cat?width=420&height=280&t=sandy-after',
    beforeText: 'Lived in a noisy street yard and was always nervous around people.',
    afterText: 'Now sleeps near the window in her new family apartment and loves cuddles.'
  },
  {
    name: 'Pearl',
    beforeImage: 'https://cataas.com/cat?width=420&height=280&t=pearl-before',
    afterImage: 'https://cataas.com/cat?width=420&height=280&t=pearl-after',
    beforeText: 'Needed medical support and regular meals in the shelter.',
    afterText: 'Recovered fully and now plays every evening with two kids at home.'
  },
  {
    name: 'Biscuit',
    beforeImage: 'https://cataas.com/cat?width=420&height=280&t=biscuit-before',
    afterImage: 'https://cataas.com/cat?width=420&height=280&t=biscuit-after',
    beforeText: 'Arrived shy, underweight, and scared of loud sounds.',
    afterText: 'Gained confidence, healthy weight, and follows her adopter everywhere.'
  }
];

// Fetch and display cat data
async function loadCats() {
  const container = document.getElementById('catsContainer');
  const isNodeServer = window.location.port === '3001';

  try {
    // Show loading message
    container.innerHTML = '<div class="loading">Loading cats...</div>';
    let cats = [];

    if (isNodeServer) {
      const response = await fetch('/api/cats');
      if (!response.ok) {
        throw new Error('Failed to fetch cat data');
      }
      cats = await response.json();
    } else {
      // Live Server mode: use local data so the app works without backend.
      cats = getFallbackCats();
    }

    allCats = cats.map((cat, index) => ({
      ...cat,
      color: cat.color || inferColorFromText(`${cat.breed} ${cat.description}`),
      sourceIndex: index
    }));

    loadFavorites();
    loadLikes();
    loadComments();
    loadDonations();
    loadViews();
    setupFilters(allCats);
    applyFilters();
    renderHappyEndings();
  } catch (error) {
    console.error('Error loading cats:', error);
    container.innerHTML = '<p style="color: white; text-align: center;">Error loading cats. Please refresh the page.</p>';
  }
}

function renderHappyEndings() {
  const container = document.getElementById('happyEndingsContainer');
  if (!container) return;

  container.innerHTML = '';

  HAPPY_ENDINGS.forEach(story => {
    const card = document.createElement('article');
    card.className = 'happy-card';
    card.innerHTML = `
      <h3 class="happy-name">${escapeHtml(story.name)}</h3>
      <div class="happy-compare">
        <div class="happy-side">
          <span class="happy-label">Before</span>
          <img src="${story.beforeImage}" alt="${escapeHtml(story.name)} before adoption" class="happy-image">
          <p>${escapeHtml(story.beforeText)}</p>
        </div>
        <div class="happy-side">
          <span class="happy-label after">After</span>
          <img src="${story.afterImage}" alt="${escapeHtml(story.name)} after adoption" class="happy-image">
          <p>${escapeHtml(story.afterText)}</p>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

let audioContext = null;
const lastMeowTimeByCat = new Map();
const meowProfiles = [
  { startHz: 780, endHz: 420, duration: 0.42, type: 'triangle' },
  { startHz: 620, endHz: 300, duration: 0.48, type: 'sawtooth' },
  { startHz: 920, endHz: 520, duration: 0.35, type: 'square' },
  { startHz: 700, endHz: 360, duration: 0.5, type: 'triangle' },
  { startHz: 840, endHz: 460, duration: 0.4, type: 'sine' }
];

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  if (!audioContext) {
    audioContext = new AudioCtx();
  }

  return audioContext;
}

async function playMeowForCat(catIndex) {
  const now = Date.now();
  const lastPlayed = lastMeowTimeByCat.get(catIndex) || 0;
  const cooldownMs = 600;

  if (now - lastPlayed < cooldownMs) {
    return;
  }
  lastMeowTimeByCat.set(catIndex, now);

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const profile = meowProfiles[catIndex % meowProfiles.length];
  const start = ctx.currentTime + 0.01;
  const end = start + profile.duration;

  const oscillator = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  oscillator.type = profile.type;
  oscillator.frequency.setValueAtTime(profile.startHz, start);
  oscillator.frequency.exponentialRampToValueAtTime(profile.endHz, start + profile.duration * 0.75);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(120, profile.endHz * 0.8), end);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1300, start);
  filter.frequency.exponentialRampToValueAtTime(700, end);
  filter.Q.value = 2.2;

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.11, start + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function getFallbackCats() {
  return [
    {
      id: 1,
      name: 'Fluffy',
      breed: 'Persian',
      age: 3,
      description: 'A calm and gentle Persian cat who loves to nap in sunny spots.',
      image: 'kotik111.jpeg',
      color: 'White'
    },
    {
      id: 2,
      name: 'Whiskers',
      breed: 'Tabby',
      age: 2,
      description: 'Energetic and playful tabby with a curious personality.',
      image: 'kotik323.jpg',
      color: 'Brown'
    },
    {
      id: 3,
      name: 'Luna',
      breed: 'Siamese',
      age: 4,
      description: 'Elegant Siamese cat with bright blue eyes and a musical voice.',
      image: 'kotik453.jpg',
      color: 'Cream'
    },
    {
      id: 4,
      name: 'Shadow',
      breed: 'Tabby Mix',
      age: 1,
      description: 'Young and adorable kitten with white paws, full of energy and love.',
      image: 'milikotik.jpg',
      color: 'Gray'
    },
    {
      id: 5,
      name: 'Mittens',
      breed: 'Black Domestic',
      age: 5,
      description: 'Mysterious and loyal black cat who enjoys peaceful environments.',
      image: 'ezemilikotik.jpg',
      color: 'Black'
    }
  ];
}

function inferColorFromText(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('black')) return 'Black';
  if (t.includes('white')) return 'White';
  if (t.includes('gray') || t.includes('grey')) return 'Gray';
  if (t.includes('brown')) return 'Brown';
  if (t.includes('orange') || t.includes('ginger')) return 'Orange';
  if (t.includes('cream')) return 'Cream';
  return 'Mixed';
}

function setupFilters(cats) {
  const searchInput = document.getElementById('searchInput');
  const breedFilter = document.getElementById('breedFilter');
  const ageFilter = document.getElementById('ageFilter');
  const colorFilter = document.getElementById('colorFilter');
  const favoritesOnlyToggle = document.getElementById('favoritesOnlyToggle');
  const resetBtn = document.getElementById('resetFilters');

  const breeds = [...new Set(cats.map(cat => cat.breed))].sort();
  const colors = [...new Set(cats.map(cat => cat.color || 'Mixed'))].sort();

  breedFilter.innerHTML = '<option value="all">All breeds</option>';
  breeds.forEach(breed => {
    const option = document.createElement('option');
    option.value = breed;
    option.textContent = breed;
    breedFilter.appendChild(option);
  });

  colorFilter.innerHTML = '<option value="all">All colors</option>';
  colors.forEach(color => {
    const option = document.createElement('option');
    option.value = color;
    option.textContent = color;
    colorFilter.appendChild(option);
  });

  searchInput.addEventListener('input', applyFilters);
  breedFilter.addEventListener('change', applyFilters);
  ageFilter.addEventListener('change', applyFilters);
  colorFilter.addEventListener('change', applyFilters);
  favoritesOnlyToggle.addEventListener('click', () => {
    showFavoritesOnly = !showFavoritesOnly;
    updateFavoritesToggleUI();
    applyFilters();
  });

  resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    breedFilter.value = 'all';
    ageFilter.value = 'all';
    colorFilter.value = 'all';
    showFavoritesOnly = false;
    updateFavoritesToggleUI();
    applyFilters();
  });

  updateFavoritesToggleUI();
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      favoriteCatIds = new Set(parsed.map(Number).filter(Number.isFinite));
    }
  } catch (_error) {
    favoriteCatIds = new Set();
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteCatIds]));
}

function loadLikes() {
  try {
    const raw = localStorage.getItem(LIKES_KEY);
    if (!raw) {
      seedRandomLikes();
      saveLikes();
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      likeCountsByCat = parsed;
      return;
    }

    seedRandomLikes();
    saveLikes();
  } catch (_error) {
    seedRandomLikes();
    saveLikes();
  }
}

function seedRandomLikes() {
  likeCountsByCat = {};
  allCats.forEach(cat => {
    // Different starter likes for each cat to make the UI feel alive.
    likeCountsByCat[String(cat.id)] = randomInt(2, 58);
  });
}

function saveLikes() {
  localStorage.setItem(LIKES_KEY, JSON.stringify(likeCountsByCat));
}

function getLikeCount(catId) {
  return Number(likeCountsByCat[String(catId)] || 0);
}

function addLike(catId) {
  const key = String(catId);
  likeCountsByCat[key] = getLikeCount(catId) + 1;
  saveLikes();
  applyFilters();
}

function loadComments() {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    if (!raw) {
      seedRandomComments();
      saveComments();
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      commentsByCat = parsed;
      return;
    }

    seedRandomComments();
    saveComments();
  } catch (_error) {
    seedRandomComments();
    saveComments();
  }
}

function loadDonations() {
  try {
    const raw = localStorage.getItem(DONATIONS_KEY);
    if (!raw) {
      donationTotalsByCat = {};
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      donationTotalsByCat = parsed;
      return;
    }

    donationTotalsByCat = {};
  } catch (_error) {
    donationTotalsByCat = {};
  }
}

function loadViews() {
  try {
    const raw = localStorage.getItem(VIEW_COUNTS_KEY);
    if (!raw) {
      viewCountsByCat = {};
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      viewCountsByCat = parsed;
      return;
    }

    viewCountsByCat = {};
  } catch (_error) {
    viewCountsByCat = {};
  }
}

function saveViews() {
  localStorage.setItem(VIEW_COUNTS_KEY, JSON.stringify(viewCountsByCat));
}

function getViewCount(catId) {
  return Number(viewCountsByCat[String(catId)] || 0);
}

function recordView(catId, minIntervalMs) {
  const now = Date.now();
  const key = Number(catId);
  const last = Number(lastViewEventAtByCat.get(key) || 0);
  if (now - last < minIntervalMs) return;

  lastViewEventAtByCat.set(key, now);
  const storageKey = String(catId);
  viewCountsByCat[storageKey] = getViewCount(catId) + 1;
  saveViews();
  renderRecommendations();
}

function saveDonations() {
  localStorage.setItem(DONATIONS_KEY, JSON.stringify(donationTotalsByCat));
}

function getDonationTotal(catId) {
  return Number(donationTotalsByCat[String(catId)] || 0);
}

function addDonation(catId, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return false;

  const rounded = Math.round(value * 100) / 100;
  const key = String(catId);
  donationTotalsByCat[key] = Math.round((getDonationTotal(catId) + rounded) * 100) / 100;
  saveDonations();
  applyFilters();
  return true;
}

function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
}

function getDonationGoal(cat) {
  const goalsById = {
    1: { amount: 120, purpose: 'special nutrition' },
    2: { amount: 150, purpose: 'vaccination and checkup' },
    3: { amount: 180, purpose: 'dental treatment' },
    4: { amount: 95, purpose: 'kitten essentials' },
    5: { amount: 220, purpose: 'full medical support' }
  };

  const fallback = { amount: 140, purpose: 'shelter care' };
  return goalsById[Number(cat.id)] || fallback;
}

function getHoverImageForSource(src) {
  const fileName = String(src || '').split('/').pop().split('?')[0].toLowerCase();
  const hoverMap = {
    'ezemilikotik.jpg': 'kotik999.png',
    'kotik111.jpeg': 'kotik222.png',
    'kotik323.jpg': 'kotik434.png',
    'kotik453.jpg': 'kotik566.png',
    'milikotik.jpg': 'milikotik234.png'
  };

  return hoverMap[fileName] || null;
}

function getFactsForCat(cat) {
  const breedKey = String(cat.breed || '').toLowerCase();

  if (breedKey.includes('persian')) return FACTS_BY_BREED.persian;
  if (breedKey.includes('tabby')) return FACTS_BY_BREED.tabby;
  if (breedKey.includes('siamese')) return FACTS_BY_BREED.siamese;
  if (breedKey.includes('mix')) return FACTS_BY_BREED.mix;
  if (breedKey.includes('domestic')) return FACTS_BY_BREED.domestic;

  return GENERAL_CAT_FACTS;
}

function getRandomFactForCat(cat, lastFact) {
  const facts = [...getFactsForCat(cat), ...GENERAL_CAT_FACTS];
  if (!facts.length) return 'Cats are wonderful companions with unique personalities.';

  if (facts.length === 1) return facts[0];

  let fact = pickRandom(facts);
  let attempts = 0;
  while (fact === lastFact && attempts < 6) {
    fact = pickRandom(facts);
    attempts += 1;
  }

  return fact;
}

function showRandomFact(card, cat) {
  const factBox = card.querySelector('.cat-fact-box');
  if (!factBox) return;

  const lastFact = factBox.dataset.lastFact || '';
  const fact = getRandomFactForCat(cat, lastFact);
  factBox.dataset.lastFact = fact;
  factBox.textContent = `Fact: ${fact}`;
  factBox.hidden = false;
  factBox.classList.add('visible');
}

function getSharePayload(cat) {
  const shareUrl = new URL(window.location.href);
  shareUrl.hash = `cat-${cat.id}`;

  return {
    title: `Help ${cat.name}`,
    text: `Meet ${cat.name} (${cat.breed}). Support this cat or help find a home!`,
    url: shareUrl.toString()
  };
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement('textarea');
  helper.value = text;
  helper.style.position = 'fixed';
  helper.style.left = '-9999px';
  document.body.appendChild(helper);
  helper.select();
  document.execCommand('copy');
  helper.remove();
}

function seedRandomComments() {
  commentsByCat = {};
  allCats.forEach(cat => {
    const count = randomInt(1, 4);
    commentsByCat[String(cat.id)] = Array.from({ length: count }, () => ({
      nick: pickRandom(RANDOM_NICKNAMES),
      text: pickRandom(RANDOM_COMMENTS)
    }));
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(items) {
  return items[randomInt(0, items.length - 1)];
}

function saveComments() {
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(commentsByCat));
}

function getComments(catId) {
  const list = commentsByCat[String(catId)];
  return Array.isArray(list) ? list : [];
}

function addComment(catId, text) {
  const value = String(text || '').trim();
  if (!value) return;

  const key = String(catId);
  const list = getComments(catId);
  list.push({
    nick: 'You',
    text: value.slice(0, 180)
  });
  commentsByCat[key] = list;

  saveComments();
  applyFilters();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildCommentsMarkup(catId) {
  const comments = getComments(catId);
  if (!comments.length) {
    return '<li class="comment-item comment-empty">No comments yet. Be the first!</li>';
  }

  return comments
    .slice(-4)
    .map(comment => {
      if (typeof comment === 'string') {
        return `<li class="comment-item"><span class="comment-nick">CatFan:</span> ${escapeHtml(comment)}</li>`;
      }

      const nick = escapeHtml(comment.nick || 'CatFan');
      const text = escapeHtml(comment.text || '');
      return `<li class="comment-item"><span class="comment-nick">${nick}:</span> ${text}</li>`;
    })
    .join('');
}

function toggleFavorite(catId) {
  if (favoriteCatIds.has(catId)) {
    favoriteCatIds.delete(catId);
  } else {
    favoriteCatIds.add(catId);
  }
  saveFavorites();
  applyFilters();
}

function updateFavoritesToggleUI() {
  const favoritesOnlyToggle = document.getElementById('favoritesOnlyToggle');
  if (!favoritesOnlyToggle) return;

  favoritesOnlyToggle.classList.toggle('active', showFavoritesOnly);
  favoritesOnlyToggle.setAttribute('aria-pressed', showFavoritesOnly ? 'true' : 'false');
  favoritesOnlyToggle.textContent = showFavoritesOnly ? 'Showing favorites' : 'Show favorites only';
}

function ageMatchesFilter(age, ageFilterValue) {
  if (ageFilterValue === 'all') return true;
  if (ageFilterValue === 'kitten') return age <= 1;
  if (ageFilterValue === 'young') return age >= 2 && age <= 3;
  if (ageFilterValue === 'adult') return age >= 4 && age <= 6;
  if (ageFilterValue === 'senior') return age >= 7;
  return true;
}

function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  const breed = document.getElementById('breedFilter').value;
  const age = document.getElementById('ageFilter').value;
  const color = document.getElementById('colorFilter').value;

  const filteredCats = allCats.filter(cat => {
    const searchTarget = `${cat.name} ${cat.breed} ${cat.description} ${cat.color || ''}`.toLowerCase();
    const matchesSearch = !searchTerm || searchTarget.includes(searchTerm);
    const matchesBreed = breed === 'all' || cat.breed === breed;
    const matchesAge = ageMatchesFilter(Number(cat.age), age);
    const matchesColor = color === 'all' || (cat.color || 'Mixed') === color;
    const matchesFavorites = !showFavoritesOnly || favoriteCatIds.has(Number(cat.id));

    return matchesSearch && matchesBreed && matchesAge && matchesColor && matchesFavorites;
  });

  renderCats(filteredCats);
  updateResultsCount(filteredCats.length, allCats.length);
}

function renderCats(cats) {
  const container = document.getElementById('catsContainer');
  container.innerHTML = '';

  if (!cats.length) {
    container.innerHTML = '<p class="no-results">No cats found for selected filters.</p>';
    return;
  }

  cats.forEach(cat => {
    const card = createCatCard(cat, cat.sourceIndex || 0);
    container.appendChild(card);
  });
}

function updateResultsCount(currentCount, totalCount) {
  const resultsCount = document.getElementById('resultsCount');
  resultsCount.textContent = `Showing ${currentCount} of ${totalCount} cats • Favorites: ${favoriteCatIds.size}`;
}

function renderRecommendations() {
  const container = document.getElementById('recommendationsContainer');
  if (!container) return;

  const recommendations = getRecommendations();
  container.innerHTML = '';

  if (!recommendations.length) {
    container.innerHTML = '<p class="recommendations-empty">Like or view a few cats and we will suggest the best matches for you.</p>';
    return;
  }

  recommendations.forEach(item => {
    const cat = item.cat;
    const card = document.createElement('article');
    card.className = 'recommendation-card';
    card.innerHTML = `
      <img src="${cat.image}" alt="${escapeHtml(cat.name)}" class="recommendation-image">
      <div class="recommendation-info">
        <h3>${escapeHtml(cat.name)}</h3>
        <p class="recommendation-meta">${escapeHtml(cat.breed)} • ${escapeHtml(cat.color || 'Mixed')}</p>
        <p class="recommendation-reason">${escapeHtml(item.reason)}</p>
      </div>
    `;
    container.appendChild(card);
  });
}

function getRecommendations() {
  const interactedCatIds = new Set();
  const breedWeight = {};
  const colorWeight = {};

  allCats.forEach(cat => {
    const id = Number(cat.id);
    const likes = getLikeCount(id);
    const views = getViewCount(id);
    const favoriteBonus = favoriteCatIds.has(id) ? 3 : 0;
    const interactionWeight = likes * 4 + Math.min(views, 15) + favoriteBonus;

    if (interactionWeight > 0) {
      interactedCatIds.add(id);
      breedWeight[cat.breed] = (breedWeight[cat.breed] || 0) + interactionWeight;
      colorWeight[cat.color || 'Mixed'] = (colorWeight[cat.color || 'Mixed'] || 0) + interactionWeight;
    }
  });

  if (!interactedCatIds.size) {
    return [];
  }

  const scored = allCats.map(cat => {
    const id = Number(cat.id);
    const selfBoost = getLikeCount(id) * 2 + Math.min(getViewCount(id), 10);
    const breedScore = breedWeight[cat.breed] || 0;
    const colorScore = colorWeight[cat.color || 'Mixed'] || 0;
    const score = selfBoost + breedScore + colorScore;

    return {
      cat,
      score,
      reason: buildRecommendationReason(cat, breedScore, colorScore)
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildRecommendationReason(cat, breedScore, colorScore) {
  if (getLikeCount(cat.id) > 0) {
    return 'You already liked this cat, so it stays in your top picks.';
  }
  if (breedScore >= colorScore && breedScore > 0) {
    return `You often interact with ${cat.breed} cats.`;
  }
  if (colorScore > 0) {
    return `You seem to prefer ${cat.color || 'Mixed'} colored cats.`;
  }
  return 'Suggested from your recent activity.';
}

// Create a cat card element
function createCatCard(cat, catIndex) {
  const card = document.createElement('div');
  card.className = 'cat-card';
  const isFavorite = favoriteCatIds.has(Number(cat.id));
  const likeCount = getLikeCount(cat.id);
  const comments = getComments(cat.id);
  const donationTotal = getDonationTotal(cat.id);
  const donationGoal = getDonationGoal(cat);
  const progressPercent = Math.min(100, Math.round((donationTotal / donationGoal.amount) * 100));
  const sharePayload = getSharePayload(cat);
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(sharePayload.url)}&text=${encodeURIComponent(sharePayload.text)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${sharePayload.text} ${sharePayload.url}`)}`;
  
  card.innerHTML = `
    <div class="cat-media">
      <img src="${cat.image}" alt="${cat.name}" class="cat-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22280%22 height=%22250%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22280%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Arial%22%3ECat Image%3C/text%3E%3C/svg%3E'">
      <button type="button" class="favorite-btn${isFavorite ? ' active' : ''}" aria-label="Add ${cat.name} to favorites" aria-pressed="${isFavorite ? 'true' : 'false'}">${isFavorite ? '❤' : '♡'}</button>
    </div>
    <div class="cat-info">
      <div class="cat-breed">${cat.breed}</div>
      <h2 class="cat-name">${cat.name}</h2>
      <p class="cat-age">Age: ${cat.age} years old</p>
      <p class="cat-color">Color: ${cat.color || 'Mixed'}</p>
      <p class="cat-description">${cat.description}</p>
      <p class="cat-fact-box" hidden></p>

      <div class="engagement-row">
        <button type="button" class="like-btn" aria-label="Like ${cat.name}">👍 Like <span class="like-count">${likeCount}</span></button>
        <span class="comment-count">💬 ${comments.length}</span>
        <button type="button" class="share-btn" aria-label="Share ${cat.name}">📤 Share</button>
      </div>

      <div class="share-panel" hidden>
        <button type="button" class="share-action" data-share="copy">Copy link</button>
        <a class="share-action" data-share="telegram" href="${telegramUrl}" target="_blank" rel="noopener noreferrer">Telegram</a>
        <a class="share-action" data-share="whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <span class="share-status" aria-live="polite"></span>
      </div>

      <form class="comment-form" aria-label="Add comment for ${cat.name}">
        <input type="text" class="comment-input" maxlength="180" placeholder="Leave a comment...">
        <button type="submit" class="comment-submit">Post</button>
      </form>

      <ul class="comment-list">${buildCommentsMarkup(cat.id)}</ul>

      <div class="donation-box">
        <div class="donation-title">Help with food</div>
        <div class="donation-total">Raised: <span>${formatMoney(donationTotal)}</span> of <span>${formatMoney(donationGoal.amount)}</span></div>
        <div class="donation-purpose">Goal: ${donationGoal.purpose}</div>
        <div class="donation-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${donationGoal.amount}" aria-valuenow="${Math.min(donationTotal, donationGoal.amount)}" aria-label="Donation progress for ${cat.name}">
          <div class="donation-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
        <div class="donation-progress-text">${progressPercent}% funded</div>
        <form class="donation-form" aria-label="Donate to ${cat.name}">
          <input type="number" class="donation-input" min="1" step="1" value="5" aria-label="Donation amount in euros">
          <button type="submit" class="donation-submit">Donate</button>
        </form>
        <p class="donation-note">Your support helps this cat and shelter care.</p>
      </div>
    </div>
  `;

  const favoriteBtn = card.querySelector('.favorite-btn');
  const catImage = card.querySelector('.cat-image');
  favoriteBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(Number(cat.id));
  });

  catImage.addEventListener('mouseenter', () => {
    const originalSrc = catImage.getAttribute('src');
    const hoverSrc = getHoverImageForSource(originalSrc);
    if (!hoverSrc) return;

    catImage.dataset.originalSrc = originalSrc;
    catImage.setAttribute('src', hoverSrc);
  });

  catImage.addEventListener('mouseleave', () => {
    if (catImage.dataset.originalSrc) {
      catImage.setAttribute('src', catImage.dataset.originalSrc);
      delete catImage.dataset.originalSrc;
    }
  });

  const likeBtn = card.querySelector('.like-btn');
  const shareBtn = card.querySelector('.share-btn');
  const sharePanel = card.querySelector('.share-panel');
  const shareCopyBtn = card.querySelector('[data-share="copy"]');
  const shareStatus = card.querySelector('.share-status');

  likeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    addLike(Number(cat.id));
  });

  shareBtn.addEventListener('click', async (event) => {
    event.stopPropagation();

    if (navigator.share) {
      try {
        await navigator.share(sharePayload);
        return;
      } catch (_error) {
        // If user cancels native share, fallback panel remains available.
      }
    }

    sharePanel.hidden = !sharePanel.hidden;
  });

  shareCopyBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await copyTextToClipboard(sharePayload.url);
      shareStatus.textContent = 'Link copied!';
    } catch (_error) {
      shareStatus.textContent = 'Could not copy link.';
    }
  });

  const shareLinks = card.querySelectorAll('.share-action[data-share="telegram"], .share-action[data-share="whatsapp"]');
  shareLinks.forEach(link => {
    link.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });

  const commentForm = card.querySelector('.comment-form');
  const commentInput = card.querySelector('.comment-input');

  commentInput.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  commentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
    addComment(Number(cat.id), commentInput.value);
  });

  const donationForm = card.querySelector('.donation-form');
  const donationInput = card.querySelector('.donation-input');

  donationInput.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  donationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const ok = addDonation(Number(cat.id), donationInput.value);
    if (ok) {
      donationInput.value = '5';
    }
  });

  card.addEventListener('mouseenter', () => {
    recordView(Number(cat.id), 4500);
    playMeowForCat(catIndex).catch(() => {
      // Ignore audio playback errors to keep UI responsive.
    });
  });

  card.addEventListener('click', () => {
    recordView(Number(cat.id), 1200);
    showRandomFact(card, cat);
    playMeowForCat(catIndex).catch(() => {
      // Fallback for touch devices.
    });
  });
  
  return card;
}

// Load cats when the page is ready
document.addEventListener('DOMContentLoaded', loadCats);
