const STORAGE_KEY = 'dailyJournal.v1';
const PHOTO_DB_NAME = 'dailyJournal';
const PHOTO_STORE = 'photos';
const DEFAULT_PHOTO = 'Image/Cover.png';
const DEFAULT_PHOTO_ALT = 'Watercolor illustration of a girl in a pink kimono playing a koto';
const MAX_PHOTO_SIZE = 1000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const TURN_THRESHOLD = 0.3;
const MAX_CHART_POINTS = 14;
const ARM_REST_ANGLE = -6;
const ARM_PLAY_ANGLE = 24;
const CANVAS_PHOTO_SIZE = 800;
const MAX_ITEMS_PER_PAGE = 60;

const LAYOUTS = ['classic', 'text', 'weekly', 'photo', 'todo'];
const WEEKDAYS = [
  { id: 'mon', name: 'Monday' },
  { id: 'tue', name: 'Tuesday' },
  { id: 'wed', name: 'Wednesday' },
  { id: 'thu', name: 'Thursday' },
  { id: 'fri', name: 'Friday' },
];
const WATER_ID = 'drink-water';
const WATER_TEXT = 'Drink water!';

const MOODS = [
  { id: 'excited', label: 'Excited', score: 5, image: 'Image/Mood1.png' },
  { id: 'happy', label: 'Happy', score: 4, image: 'Image/Mood2.png' },
  { id: 'calm', label: 'Calm', score: 3, image: 'Image/Mood3.png' },
  { id: 'tired', label: 'Tired', score: 2, image: 'Image/Mood4.png' },
  { id: 'sad', label: 'Sad', score: 1, image: 'Image/Mood5.jpg' },
];
const MOOD_BY_ID = Object.fromEntries(MOODS.map((mood) => [mood.id, mood]));

const SONGS = [
  { id: 'rainy-window', title: 'Rainy Window', note: 'Cozy and slow', file: 'audio/rainy-window.wav' },
  { id: 'golden-hour-walk', title: 'Golden Hour Walk', note: 'Warm and upbeat', file: 'audio/golden-hour-walk.wav' },
  { id: 'slow-sunday', title: 'Slow Sunday', note: 'Calm and quiet', file: 'audio/slow-sunday.wav' },
];

let pages = [];
let currentIndex = 0;
let currentUser = null;

let isCoverBusy = false;
let isTurning = false;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const cover = document.querySelector('#cover');
const coverSheet = document.querySelector('.cover__sheet');
const editor = document.querySelector('#editor');
const coverDate = document.querySelector('#cover-date');

const notebook = document.querySelector('#notebook');
const leftPage = document.querySelector('#left-page');
const rightPage = document.querySelector('#right-page');
const flipStage = document.querySelector('#flip');
const leftSlot = document.querySelector('#left-layout');
const rightSlot = document.querySelector('#right-layout');
const leftItems = document.querySelector('#left-items');
const rightItems = document.querySelector('#right-items');
const turnHint = document.querySelector('#turn-hint');
const dropzone = document.querySelector('#dropzone');
const photoElement = document.querySelector('#photo');
const fileInput = document.querySelector('#file-input');
const resetPhotoButton = document.querySelector('#reset-photo-btn');
const dropStatus = document.querySelector('#drop-status');
const journalText = document.querySelector('#journal-text');
const entryDate = document.querySelector('#entry-date');
const entryPlace = document.querySelector('#entry-place');
const entryWeather = document.querySelector('#entry-weather');
const moodInputs = document.querySelectorAll('input[name="mood"]');

const vinyl = document.querySelector('#vinyl');
const armButton = document.querySelector('#arm-btn');
const songTitle = document.querySelector('#song-title');
const songList = document.querySelector('#song-list');
const audioStatus = document.querySelector('#audio-status');

const previousButton = document.querySelector('#prev-btn');
const nextButton = document.querySelector('#next-btn');
const newPageButton = document.querySelector('#new-page-btn');
const closeButton = document.querySelector('#close-btn');
const pageNumber = document.querySelector('#page-number');
const pageTotal = document.querySelector('#page-total');
const appStatus = document.querySelector('#app-status');

const stickerGrid = document.querySelector('#sticker-grid');
const stickersPrevious = document.querySelector('#stickers-prev');
const stickersNext = document.querySelector('#stickers-next');

const progressButton = document.querySelector('#progress-btn');
const progressDialog = document.querySelector('#progress-dialog');
const progressClose = document.querySelector('#progress-close');
const progressSummary = document.querySelector('#progress-summary');
const progressChart = document.querySelector('#progress-chart');
const progressLegend = document.querySelector('#progress-legend');
const progressEmpty = document.querySelector('#progress-empty');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function currentPage() {
  return pages[currentIndex];
}

function todayISO() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

function parseISODate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatShortDate(isoDate) {
  return parseISODate(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('is-error', isError);
}

function waitFor(animation) {
  return animation.finished.catch(() => {});
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function emptyWeek() {
  return Object.fromEntries(WEEKDAYS.map((day) => [day.id, '']));
}

function createPage() {
  return {
    id: newId(),
    date: todayISO(),
    time: nowTime(),
    layout: null,
    text: '',
    text2: '',
    photo: null,
    mood: null,
    songId: null,
    place: weatherState ? weatherState.place : '',
    weather: weatherState ? weatherState.text : '',
    weatherIcon: weatherState ? weatherState.kind : '',
    week: emptyWeek(),
    todos: [{ id: WATER_ID, text: WATER_TEXT, done: false }],
    items: [],
    quote: null,
    cat: null,
  };
}

function normalizeTodos(raw) {
  const list = Array.isArray(raw)
    ? raw
        .filter((task) => task && typeof task.text === 'string' && task.text.trim())
        .map((task) => ({
          id: typeof task.id === 'string' && task.id ? task.id.slice(0, 40) : newId(),
          text: task.text.slice(0, 80),
          done: Boolean(task.done),
        }))
    : [];
  const water = list.find((task) => task.id === WATER_ID);
  const others = list.filter((task) => task.id !== WATER_ID).slice(0, 30);
  return [{ id: WATER_ID, text: WATER_TEXT, done: water ? water.done : false }, ...others];
}

function normalizeQuote(raw) {
  if (!raw || typeof raw.text !== 'string' || !raw.text.trim()) return null;
  return { text: raw.text.slice(0, 240), author: typeof raw.author === 'string' ? raw.author.slice(0, 60) : '' };
}

function normalizePage(raw) {
  const page = createPage();
  if (!raw || typeof raw !== 'object') return page;

  const week = emptyWeek();
  WEEKDAYS.forEach((day) => {
    const value = raw.week && raw.week[day.id];
    week[day.id] = typeof value === 'string' ? value.slice(0, 600) : '';
  });

  return {
    id: typeof raw.id === 'string' ? raw.id : page.id,
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : page.date,
    time: /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : page.time,
    layout: raw.layout === undefined ? 'classic' : LAYOUTS.includes(raw.layout) ? raw.layout : null,
    text: typeof raw.text === 'string' ? raw.text : '',
    text2: typeof raw.text2 === 'string' ? raw.text2 : '',
    photo: typeof raw.photo === 'string' && raw.photo.startsWith('data:image/') ? raw.photo : null,
    mood: MOOD_BY_ID[raw.mood] ? raw.mood : null,
    songId: SONGS.some((song) => song.id === raw.songId) ? raw.songId : null,
    place: typeof raw.place === 'string' ? raw.place : '',
    weather: typeof raw.weather === 'string' ? raw.weather : '',
    weatherIcon: WEATHER_ICONS[raw.weatherIcon] ? raw.weatherIcon : '',
    week,
    todos: normalizeTodos(raw.todos),
    items: Array.isArray(raw.items) ? raw.items.map(normalizeItem).filter(Boolean).slice(0, MAX_ITEMS_PER_PAGE) : [],
    quote: normalizeQuote(raw.quote),
    cat: typeof raw.cat === 'string' && raw.cat.startsWith('https://') ? raw.cat : null,
  };
}

function storageKey() {
  return currentUser ? `${STORAGE_KEY}.${currentUser.id}` : null;
}

function loadJournal() {
  try {
    const saved = currentUser ? JSON.parse(localStorage.getItem(storageKey())) : null;
    if (saved && Array.isArray(saved.pages) && saved.pages.length > 0) {
      pages = saved.pages.map(normalizePage);
      currentIndex = clamp(Number(saved.currentIndex) || 0, 0, pages.length - 1);
      return true;
    }
  } catch (error) {
    // Saved journal is missing or unreadable. Start a new one below.
  }

  pages = [createPage()];
  currentIndex = 0;
  return false;
}

const savedPhotos = new Map();
let photoQueue = Promise.resolve();
let photoDB = null;
let photosLoaded = Promise.resolve();

function openPhotoDB() {
  if (!photoDB) {
    photoDB = new Promise((resolve, reject) => {
      const request = indexedDB.open(PHOTO_DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return photoDB;
}

function collectPhotos() {
  const found = new Map();
  pages.forEach((page) => {
    if (page.photo) found.set(page.id, page.photo);
    page.items.forEach((item) => {
      if (item.type === 'image' && item.src && item.src.startsWith('data:image/')) {
        found.set(`${page.id}:${item.id}`, item.src);
      }
    });
  });
  return found;
}

async function loadPhotos() {
  const db = await openPhotoDB();
  const wanted = [];
  pages.forEach((page) => {
    wanted.push(page.id);
    page.items.forEach((item) => {
      if (item.type === 'image') wanted.push(`${page.id}:${item.id}`);
    });
  });

  const entries = await new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, 'readonly');
    const store = transaction.objectStore(PHOTO_STORE);
    const requests = wanted.map((key) => [key, store.get(key)]);
    transaction.oncomplete = () => resolve(
      requests.filter(([, request]) => request.result).map(([key, request]) => [key, request.result])
    );
    transaction.onerror = () => reject(transaction.error);
  });

  entries.forEach(([key, photo]) => savedPhotos.set(key, photo));
  pages.forEach((page) => {
    if (!page.photo && savedPhotos.has(page.id)) page.photo = savedPhotos.get(page.id);
    page.items.forEach((item) => {
      const key = `${page.id}:${item.id}`;
      if (item.type === 'image' && !item.src && savedPhotos.has(key)) item.src = savedPhotos.get(key);
    });
  });
  if (!isTurning) {
    renderPhoto(currentPage());
    renderItems(currentPage());
  }
}

async function syncPhotos() {
  const found = collectPhotos();
  const changes = [];

  found.forEach((photo, key) => {
    if (savedPhotos.get(key) !== photo) changes.push([key, photo]);
  });
  savedPhotos.forEach((photo, key) => {
    if (!found.has(key)) changes.push([key, null]);
  });
  if (changes.length === 0) return false;

  const db = await openPhotoDB();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, 'readwrite');
    const store = transaction.objectStore(PHOTO_STORE);
    changes.forEach(([key, photo]) => (photo ? store.put(photo, key) : store.delete(key)));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  changes.forEach(([key, photo]) => (photo ? savedPhotos.set(key, photo) : savedPhotos.delete(key)));
  return true;
}

function hasUnsavedPhotos() {
  let hasUnsaved = false;
  collectPhotos().forEach((photo, key) => {
    if (savedPhotos.get(key) !== photo) hasUnsaved = true;
  });
  return hasUnsaved;
}

function writeLocal() {
  if (!currentUser) return;

  const storedPages = pages.map((page) => {
    const stored = { ...page };
    if (page.photo && savedPhotos.get(page.id) === page.photo) stored.photo = null;
    stored.items = page.items.map((item) => (
      item.type === 'image' && item.src && savedPhotos.get(`${page.id}:${item.id}`) === item.src
        ? { ...item, src: null }
        : item
    ));
    return stored;
  });
  localStorage.setItem(storageKey(), JSON.stringify({ pages: storedPages, currentIndex }));
}

function showSaveError() {
  setMessage(
    appStatus,
    "Your journal couldn't be saved. Browser storage may be full or turned off.",
    true
  );
}

function saveJournal() {
  if (!currentUser) return;

  try {
    writeLocal();
    setMessage(appStatus, '');
  } catch (error) {
    if (!hasUnsavedPhotos()) showSaveError();
  }

  photoQueue = photoQueue
    .then(() => photosLoaded)
    .then(syncPhotos)
    .catch(() => true)
    .then((changed) => {
      if (!changed) return;
      try {
        writeLocal();
        if (appStatus.classList.contains('is-error')) setMessage(appStatus, '');
      } catch (error) {
        showSaveError();
      }
    });
}

let saveTimer = null;

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveJournal, 300);
}

const SHEET_OPEN = 'rotateY(-180deg)';
const SHEET_CLOSED = 'rotateY(0deg)';
const SWING = { duration: 1100, easing: 'cubic-bezier(0.55, 0.05, 0.3, 1)' };
const FADE = { duration: 400, easing: 'ease' };

function setEditorAvailable(isAvailable) {
  editor.inert = !isAvailable;
}

function clearCoverAnimations() {
  cover.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  cover.classList.remove('is-animating');
}

async function openJournal() {
  if (isCoverBusy) return;
  isCoverBusy = true;

  if (!prefersReducedMotion.matches) {
    cover.classList.add('is-animating');

    await waitFor(coverSheet.animate([{ transform: SHEET_OPEN }], { ...SWING, fill: 'forwards' }));
    await waitFor(cover.animate([{ opacity: 1 }, { opacity: 0 }], { ...FADE, fill: 'forwards' }));
  }

  cover.hidden = true;
  clearCoverAnimations();
  setEditorAvailable(true);
  isCoverBusy = false;
  promptLayoutIfNeeded();
}

async function closeJournal() {
  if (isCoverBusy || isTurning) return;
  isCoverBusy = true;

  liftNeedle();
  setEditorAvailable(false);
  cover.hidden = false;

  if (!prefersReducedMotion.matches) {
    cover.classList.add('is-animating');

    const fadeIn = cover.animate([{ opacity: 0 }, { opacity: 1 }], FADE);
    const swingShut = coverSheet.animate(
      [{ transform: SHEET_OPEN }, { transform: SHEET_CLOSED }],
      { ...SWING, delay: FADE.duration, fill: 'backwards' }
    );
    await Promise.all([waitFor(fadeIn), waitFor(swingShut)]);
    clearCoverAnimations();
  }

  coverSheet.focus({ preventScroll: true });
  isCoverBusy = false;
}

document.querySelectorAll('[data-open-journal]').forEach((element) => {
  element.addEventListener('click', openJournal);
});

closeButton.addEventListener('click', closeJournal);

function renderPhoto(page) {
  photoElement.src = page.photo || DEFAULT_PHOTO;
  photoElement.alt = page.photo ? 'Your photo for this entry' : DEFAULT_PHOTO_ALT;
  resetPhotoButton.hidden = !page.photo;
}

function renderPageContent(page) {
  renderPhoto(page);
  setMessage(dropStatus, '');
  journalText.value = page.text;
  entryDate.value = page.date;
  renderStamp(page);

  const song = songById(page.songId);
  songTitle.textContent = song ? song.title : 'Pick a song';

  const layout = page.layout || 'none';
  leftPage.dataset.layout = layout;
  rightPage.dataset.layout = layout;
  renderLayoutSlots(page);
  renderItems(page);
}

function renderStamp(page) {
  entryPlace.textContent = page.place || 'Not set';
  entryWeather.replaceChildren();
  if (page.weather) {
    if (page.weatherIcon) entryWeather.append(weatherIcon(page.weatherIcon));
    entryWeather.append(page.weather);
  } else {
    entryWeather.textContent = 'Not set';
  }
}

function renderSidebar() {
  const page = currentPage();

  moodInputs.forEach((input) => {
    input.checked = input.value === page.mood;
  });

  songList.querySelectorAll('.song-btn').forEach((button) => {
    if (button.dataset.songId === page.songId) {
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

function renderPager() {
  pageNumber.textContent = currentIndex + 1;
  pageTotal.textContent = pages.length;
  previousButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === pages.length - 1;

  showNewPageButton(currentIndex === pages.length - 1);
}

function showNewPageButton(isVisible) {
  newPageButton.classList.toggle('is-collapsed', !isVisible);
  newPageButton.inert = !isVisible;
}

function renderPage() {
  fillWeatherIfNeeded(currentPage());
  renderPageContent(currentPage());
  renderSidebar();
  renderPager();
  ensureLayoutContent(currentPage());
}

journalText.addEventListener('input', () => {
  currentPage().text = journalText.value;
  queueSave();
});

entryDate.addEventListener('change', () => {
  if (entryDate.value) {
    currentPage().date = entryDate.value;
    queueSave();
  } else {
    entryDate.value = currentPage().date;
  }
});

function readPhoto(file, maxSize = MAX_PHOTO_SIZE) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('The image could not be decoded'));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

async function addPhoto(file) {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    setMessage(dropStatus, "That file isn't an image. Try a JPG, PNG, or GIF.", true);
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    setMessage(dropStatus, 'That photo is too big. Try one under 15 MB.', true);
    return;
  }

  const page = currentPage();
  setMessage(dropStatus, 'Adding your photo…');

  try {
    page.photo = await readPhoto(file);
    if (page === currentPage()) {
      renderPhoto(page);
      setMessage(dropStatus, '');
    }
    saveJournal();
  } catch (error) {
    setMessage(dropStatus, "Couldn't read that image. Try a different file.", true);
  }
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function isClassicPage() {
  return currentPage().layout === 'classic';
}

let dragDepth = 0;

leftPage.addEventListener('dragenter', (event) => {
  if (!hasFiles(event) || !isClassicPage()) return;
  event.preventDefault();
  dragDepth += 1;
  dropzone.classList.add('is-dragover');
});

leftPage.addEventListener('dragover', (event) => {
  if (!hasFiles(event) || !isClassicPage()) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

leftPage.addEventListener('dragleave', (event) => {
  if (!hasFiles(event) || !isClassicPage()) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropzone.classList.remove('is-dragover');
});

leftPage.addEventListener('drop', (event) => {
  if (!hasFiles(event) || !isClassicPage()) return;
  event.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove('is-dragover');
  addPhoto(event.dataTransfer.files[0]);
});

window.addEventListener('dragover', (event) => {
  if (hasFiles(event)) event.preventDefault();
});

window.addEventListener('drop', (event) => {
  if (hasFiles(event)) event.preventDefault();
});

fileInput.addEventListener('change', () => {
  addPhoto(fileInput.files[0]);
  fileInput.value = '';
});

resetPhotoButton.addEventListener('click', () => {
  currentPage().photo = null;
  renderPhoto(currentPage());
  setMessage(dropStatus, '');
  saveJournal();
});

moodInputs.forEach((input) => {
  input.addEventListener('change', () => {
    currentPage().mood = input.value;
    saveJournal();
  });
});

const player = new Audio();
player.loop = true;

let isNeedleDown = false;
let loadedSongId = null;

function songById(id) {
  return SONGS.find((song) => song.id === id) || null;
}

function buildSongList() {
  SONGS.forEach((song) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const disc = document.createElement('span');
    const text = document.createElement('span');
    const note = document.createElement('small');

    button.type = 'button';
    button.className = 'song-btn';
    button.dataset.songId = song.id;
    disc.className = 'song-btn__disc';
    disc.setAttribute('aria-hidden', 'true');
    text.textContent = song.title;
    note.textContent = song.note;

    text.append(note);
    button.append(disc, text);
    item.append(button);
    songList.append(item);

    button.addEventListener('click', () => chooseSong(song.id));
  });
}

function chooseSong(songId) {
  currentPage().songId = songId;
  saveJournal();
  renderPageContent(currentPage());
  renderSidebar();

  if (isNeedleDown) {
    startPlayback();
  } else {
    setMessage(audioStatus, 'Rest the needle on the record to play.');
  }
}

function setNeedle(isDown) {
  isNeedleDown = isDown;
  armButton.setAttribute('aria-pressed', String(isDown));
  vinyl.classList.toggle('is-playing', isDown);
}

function nudgeNeedle() {
  armButton.classList.remove('is-nudging');
  void armButton.offsetWidth;
  armButton.classList.add('is-nudging');
}

armButton.addEventListener('animationend', () => {
  armButton.classList.remove('is-nudging');
});

async function startPlayback() {
  const song = songById(currentPage().songId);
  if (!song) {
    liftNeedle();
    return;
  }

  try {
    if (loadedSongId !== song.id) {
      player.src = song.file;
      loadedSongId = song.id;
    }
    await player.play();
    if (isNeedleDown) setMessage(audioStatus, '');
  } catch (error) {
    if (error.name === 'AbortError') return;

    loadedSongId = null;
    setNeedle(false);
    setMessage(audioStatus, "Couldn't play this song. Check that its file is in the audio folder.", true);
  }
}

function lowerNeedle() {
  if (!songById(currentPage().songId)) {
    nudgeNeedle();
    setMessage(audioStatus, 'Pick a song from the list first.');
    return;
  }

  setNeedle(true);
  startPlayback();
}

function liftNeedle() {
  if (!isNeedleDown) return;

  setNeedle(false);
  player.pause();
  setMessage(audioStatus, '');
}

function toggleNeedle() {
  if (isNeedleDown) {
    liftNeedle();
  } else {
    lowerNeedle();
  }
}

function syncMusicToPage() {
  if (!isNeedleDown) return;

  if (songById(currentPage().songId)) {
    startPlayback();
  } else {
    liftNeedle();
    setMessage(audioStatus, 'This page has no song yet. Pick one from the list.');
  }
}

let needleDrag = null;

armButton.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  const vinylBox = vinyl.getBoundingClientRect();
  needleDrag = {
    pointerId: event.pointerId,
    pivotX: vinylBox.left + armButton.offsetLeft + armButton.offsetWidth / 2,
    pivotY: vinylBox.top + armButton.offsetTop,
    startX: event.clientX,
    startY: event.clientY,
    angle: isNeedleDown ? ARM_PLAY_ANGLE : ARM_REST_ANGLE,
    moved: false,
  };
  armButton.setPointerCapture(event.pointerId);
});

armButton.addEventListener('pointermove', (event) => {
  if (!needleDrag || event.pointerId !== needleDrag.pointerId) return;

  const distance = Math.hypot(event.clientX - needleDrag.startX, event.clientY - needleDrag.startY);
  if (!needleDrag.moved && distance < 5) return;

  needleDrag.moved = true;
  armButton.classList.add('is-dragging');

  const radians = Math.atan2(-(event.clientX - needleDrag.pivotX), event.clientY - needleDrag.pivotY);
  needleDrag.angle = clamp((radians * 180) / Math.PI, ARM_REST_ANGLE, ARM_PLAY_ANGLE);
  armButton.style.setProperty('--arm-angle', `${needleDrag.angle}deg`);
});

function endNeedleDrag(event) {
  if (!needleDrag || event.pointerId !== needleDrag.pointerId) return;

  const { moved, angle } = needleDrag;
  needleDrag = null;
  armButton.classList.remove('is-dragging');
  armButton.style.removeProperty('--arm-angle');

  if (event.type === 'pointercancel') return;

  if (!moved) {
    toggleNeedle();
    return;
  }

  const isOverRecord = angle > (ARM_REST_ANGLE + ARM_PLAY_ANGLE) / 2;
  if (isOverRecord && !isNeedleDown) {
    lowerNeedle();
  } else if (!isOverRecord && isNeedleDown) {
    liftNeedle();
  }
}

armButton.addEventListener('pointerup', endNeedleDrag);
armButton.addEventListener('pointercancel', endNeedleDrag);

armButton.addEventListener('click', (event) => {
  if (event.detail === 0) toggleNeedle();
});

function updateStickerArrows() {
  const maxScroll = stickerGrid.scrollWidth - stickerGrid.clientWidth;
  stickersPrevious.disabled = stickerGrid.scrollLeft <= 2;
  stickersNext.disabled = stickerGrid.scrollLeft >= maxScroll - 2;
}

function scrollStickers(direction) {
  const gap = parseFloat(getComputedStyle(stickerGrid).columnGap) || 0;
  stickerGrid.scrollBy({
    left: direction * (stickerGrid.clientWidth + gap),
    behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
  });
}

stickersPrevious.addEventListener('click', () => scrollStickers(-1));
stickersNext.addEventListener('click', () => scrollStickers(1));
stickerGrid.addEventListener('scroll', updateStickerArrows, { passive: true });
window.addEventListener('resize', updateStickerArrows);

stickerGrid.addEventListener('wheel', (event) => {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  const maxScroll = stickerGrid.scrollWidth - stickerGrid.clientWidth;
  const canScroll = event.deltaY > 0 ? stickerGrid.scrollLeft < maxScroll - 2 : stickerGrid.scrollLeft > 2;
  if (!canScroll) return;

  event.preventDefault();
  stickerGrid.scrollBy({ left: event.deltaY });
}, { passive: false });

function waitForImages(root) {
  const loads = Array.from(root.querySelectorAll('img')).map((image) => image.decode().catch(() => {}));
  const timeout = new Promise((resolve) => setTimeout(resolve, 250));
  return Promise.race([Promise.all(loads), timeout]);
}

function showTurnHint(text) {
  turnHint.textContent = text;
  turnHint.classList.add('is-visible');
}

function hideTurnHint() {
  turnHint.classList.remove('is-visible');
}

function snapshotPage(page) {
  const copy = page.cloneNode(true);
  copy.removeAttribute('id');
  copy.removeAttribute('aria-label');
  copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  copy.querySelectorAll('[for]').forEach((element) => element.removeAttribute('for'));
  copy.querySelectorAll('[aria-live]').forEach((element) => element.removeAttribute('aria-live'));
  return copy;
}

function snapshotSpread(page) {
  renderPageContent(page);
  return { left: snapshotPage(leftPage), right: snapshotPage(rightPage) };
}

function createFace(className, content) {
  const face = document.createElement('div');
  face.className = `flip__face ${className}`;
  face.append(content);
  return face;
}

let flip = null;

async function beginFlip(direction, toIndex) {
  isTurning = true;

  const fromPage = currentPage();
  const isNewPage = toIndex >= pages.length;
  const toPage = isNewPage ? createPage() : pages[toIndex];
  const isForward = direction > 0;

  const from = snapshotSpread(fromPage);
  const to = snapshotSpread(toPage);
  renderPageContent(fromPage);

  const leaf = document.createElement('div');
  leaf.className = 'flip__leaf';
  leaf.append(
    createFace('flip__face--front', isForward ? from.right : from.left),
    createFace('flip__face--back', isForward ? to.left : to.right)
  );

  const spine = document.createElement('div');
  spine.className = 'spine';

  flipStage.className = `flip flip--${isForward ? 'forward' : 'back'}`;
  flipStage.replaceChildren(
    isForward ? from.left : to.left,
    spine,
    isForward ? to.right : from.right,
    leaf
  );

  flipStage.style.left = `${notebook.offsetLeft}px`;
  flipStage.style.top = `${notebook.offsetTop}px`;
  flipStage.style.width = `${notebook.offsetWidth}px`;
  flipStage.style.height = `${notebook.offsetHeight}px`;

  await waitForImages(flipStage);

  flip = { direction, toIndex, toPage, isNewPage, leaf, progress: 0, isShown: false };
  return flip;
}

function showFlip() {
  flipStage.hidden = false;
  notebook.classList.add('is-flipping');
  flip.isShown = true;
  setFlipProgress(flip.progress);
}

function setFlipProgress(progress) {
  flip.progress = progress;
  flip.leaf.style.transform = `rotateY(${-flip.direction * 180 * progress}deg)`;
  previewNewPageButton(progress >= TURN_THRESHOLD);
}

function previewNewPageButton(willTurn) {
  const landsOnLastPage = flip.toIndex >= pages.length - 1;
  showNewPageButton(willTurn ? landsOnLastPage : currentIndex === pages.length - 1);
}

async function finishFlip(shouldComplete) {
  const state = flip;
  const target = shouldComplete ? 1 : 0;
  previewNewPageButton(shouldComplete);

  if (state.isShown && !prefersReducedMotion.matches) {
    const angleFor = (progress) => `rotateY(${-state.direction * 180 * progress}deg)`;
    const animation = state.leaf.animate(
      [{ transform: angleFor(state.progress) }, { transform: angleFor(target) }],
      { duration: 150 + 550 * Math.abs(target - state.progress), easing: 'ease-in-out', fill: 'forwards' }
    );
    await waitFor(animation);
  }

  flip = null;

  if (shouldComplete) {
    if (state.isNewPage) pages.push(state.toPage);
    currentIndex = state.toIndex;
    renderPage();
    saveJournal();
    syncMusicToPage();
  }

  flipStage.hidden = true;
  flipStage.replaceChildren();
  notebook.classList.remove('is-flipping');
  isTurning = false;

  if (shouldComplete) promptLayoutIfNeeded();
}

async function turnTo(index, direction) {
  if (isTurning) return;

  if (prefersReducedMotion.matches) {
    if (index >= pages.length) pages.push(createPage());
    currentIndex = index;
    renderPage();
    saveJournal();
    syncMusicToPage();
    promptLayoutIfNeeded();
    return;
  }

  await beginFlip(direction, index);
  showFlip();
  await finishFlip(true);
}

function goNext() {
  if (currentIndex < pages.length - 1) turnTo(currentIndex + 1, 1);
}

function goPrevious() {
  if (currentIndex > 0) turnTo(currentIndex - 1, -1);
}

function addPage() {
  turnTo(pages.length, 1);
}

previousButton.addEventListener('click', goPrevious);
nextButton.addEventListener('click', goNext);
newPageButton.addEventListener('click', addPage);

const NO_DRAG_SELECTOR = 'button, input, textarea, label, a, select';
let pageDrag = null;

function dragProgress(drag) {
  const fullTurnDistance = notebook.offsetWidth * 0.4;
  return clamp((-drag.distance * drag.direction) / fullTurnDistance, 0, 1);
}

function describeDrag(direction, progress) {
  const hasFarEnough = progress >= TURN_THRESHOLD;

  if (direction > 0) {
    if (!hasFarEnough) return 'Keep dragging to turn the page';
    return currentIndex < pages.length - 1
      ? `Release to go to page ${currentIndex + 2}`
      : 'Release to start a new page';
  }

  return hasFarEnough ? `Release to go back to page ${currentIndex}` : 'Keep dragging to go back';
}

function settleNotebook() {
  const startTransform = notebook.style.transform;
  notebook.style.transform = '';
  if (!startTransform || prefersReducedMotion.matches) return;

  notebook.animate([{ transform: startTransform }, { transform: 'none' }], { duration: 200, easing: 'ease-out' });
}

notebook.addEventListener('pointerdown', (event) => {
  if (isTurning || event.button !== 0) return;
  if (event.target.closest(NO_DRAG_SELECTOR)) return;

  pageDrag = { pointerId: event.pointerId, startX: event.clientX, distance: 0, direction: 0, isActive: false };
});

notebook.addEventListener('pointermove', (event) => {
  if (!pageDrag || event.pointerId !== pageDrag.pointerId) return;

  pageDrag.distance = event.clientX - pageDrag.startX;

  if (!pageDrag.isActive) {
    if (Math.abs(pageDrag.distance) < 8) return;

    pageDrag.isActive = true;
    pageDrag.direction = pageDrag.distance < 0 ? 1 : -1;
    pageDrag.isBlocked = pageDrag.direction < 0 && currentIndex === 0;
    notebook.setPointerCapture(event.pointerId);
    notebook.classList.add('is-dragging');

    if (!pageDrag.isBlocked) {
      pageDrag.ready = beginFlip(pageDrag.direction, currentIndex + pageDrag.direction).then(showFlip);
    }
  }

  if (pageDrag.isBlocked) {
    notebook.style.transform = `translateX(${Math.min(pageDrag.distance * 0.12, 18)}px)`;
    showTurnHint('This is the first page');
    return;
  }

  const progress = dragProgress(pageDrag);
  if (flip && flip.isShown) setFlipProgress(progress);
  showTurnHint(describeDrag(pageDrag.direction, progress));
});

async function endPageDrag(event) {
  if (!pageDrag || event.pointerId !== pageDrag.pointerId) return;

  const drag = pageDrag;
  pageDrag = null;
  if (!drag.isActive) return;

  notebook.classList.remove('is-dragging');
  hideTurnHint();

  if (drag.isBlocked) {
    settleNotebook();
    return;
  }

  await drag.ready;
  setFlipProgress(dragProgress(drag));

  const shouldTurn = event.type !== 'pointercancel' && flip.progress >= TURN_THRESHOLD;
  await finishFlip(shouldTurn);
}

notebook.addEventListener('pointerup', endPageDrag);
notebook.addEventListener('pointercancel', endPageDrag);

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function getMoodEntries() {
  return pages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => MOOD_BY_ID[page.mood])
    .sort((a, b) => a.page.date.localeCompare(b.page.date) || a.index - b.index)
    .map(({ page }) => ({ date: page.date, mood: MOOD_BY_ID[page.mood] }));
}

function countMoods(entries) {
  const counts = Object.fromEntries(MOODS.map((mood) => [mood.id, 0]));
  entries.forEach((entry) => {
    counts[entry.mood.id] += 1;
  });
  return counts;
}

function average(entries) {
  return entries.reduce((sum, entry) => sum + entry.mood.score, 0) / entries.length;
}

function describeMoods(entries) {
  const counts = countMoods(entries);
  const highest = Math.max(...Object.values(counts));
  const topMoods = MOODS.filter((mood) => counts[mood.id] === highest).map((mood) => mood.label.toLowerCase());
  const plural = entries.length === 1 ? '' : 's';

  let summary = `You've logged ${entries.length} mood${plural}.`;

  if (topMoods.length === 1) {
    summary += ` Most often you felt ${topMoods[0]} (${highest}).`;
  } else {
    const last = topMoods.pop();
    summary += ` You felt ${topMoods.join(', ')} and ${last} equally often (${highest} each).`;
  }

  if (entries.length >= 4) {
    const half = Math.floor(entries.length / 2);
    const change = average(entries.slice(-half)) - average(entries.slice(0, half));

    if (change > 0.3) {
      summary += ' Your mood has been trending up lately.';
    } else if (change < -0.3) {
      summary += ' Your mood has dipped lately. Be kind to yourself.';
    } else {
      summary += ' Your mood has been steady lately.';
    }
  }

  return summary;
}

function buildChart(entries) {
  const width = 640;
  const height = 280;
  const margin = { top: 24, right: 28, bottom: 44, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const plotPadding = 28;
  const plotWidth = innerWidth - plotPadding * 2;
  const xFor = (index) =>
    entries.length === 1
      ? margin.left + innerWidth / 2
      : margin.left + plotPadding + (plotWidth * index) / (entries.length - 1);
  const yFor = (score) => margin.top + (innerHeight * (5 - score)) / 4;

  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Line chart of your mood over time',
    'aria-describedby': 'progress-summary',
  });

  MOODS.forEach((mood) => {
    const y = yFor(mood.score);
    svg.append(svgElement('line', { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: 'chart-grid' }));
    svg.append(svgElement('image', { href: mood.image, x: 10, y: y - 16, width: 32, height: 32 }));
  });

  if (entries.length > 1) {
    const points = entries.map((entry, index) => `${xFor(index)},${yFor(entry.mood.score)}`).join(' ');
    svg.append(svgElement('polyline', { points, class: 'chart-line' }));
  }

  const labelStep = Math.ceil(entries.length / 7);

  entries.forEach((entry, index) => {
    const x = xFor(index);

    const sticker = svgElement('image', {
      href: entry.mood.image,
      x: x - 16,
      y: yFor(entry.mood.score) - 16,
      width: 32,
      height: 32,
    });
    const tooltip = svgElement('title');
    tooltip.textContent = `${formatShortDate(entry.date)}: ${entry.mood.label}`;
    sticker.append(tooltip);
    svg.append(sticker);

    if (index % labelStep === 0) {
      const label = svgElement('text', { x, y: height - 16, 'text-anchor': 'middle' });
      label.textContent = formatShortDate(entry.date);
      svg.append(label);
    }
  });

  return svg;
}

function buildLegend(entries) {
  const counts = countMoods(entries);

  MOODS.filter((mood) => counts[mood.id] > 0).forEach((mood) => {
    const item = document.createElement('li');
    const image = document.createElement('img');

    image.src = mood.image;
    image.alt = '';
    image.width = 26;
    image.height = 26;

    item.append(image, `${mood.label} ${counts[mood.id]}`);
    progressLegend.append(item);
  });
}

function drawProgress() {
  const entries = getMoodEntries();
  const hasEntries = entries.length > 0;

  progressChart.replaceChildren();
  progressLegend.replaceChildren();
  progressChart.hidden = !hasEntries;
  progressLegend.hidden = !hasEntries;
  progressEmpty.hidden = hasEntries;

  if (!hasEntries) {
    progressSummary.textContent = '';
    return;
  }

  progressSummary.textContent = describeMoods(entries);
  progressChart.append(buildChart(entries.slice(-MAX_CHART_POINTS)));
  buildLegend(entries);
}

progressButton.addEventListener('click', () => {
  drawProgress();
  progressDialog.showModal();
});

progressClose.addEventListener('click', () => progressDialog.close());

progressDialog.addEventListener('click', (event) => {
  if (event.target === progressDialog) progressDialog.close();
});

const THEME_KEY = 'dailyJournal.theme';
const THEMES = ['pink', 'lavender', 'mint'];
const themeButtons = document.querySelectorAll('[data-theme-choice]');

function applyTheme(theme) {
  const choice = THEMES.includes(theme) ? theme : 'pink';
  document.documentElement.dataset.theme = choice;
  themeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
  });
}

themeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    applyTheme(button.dataset.themeChoice);
    try {
      localStorage.setItem(THEME_KEY, button.dataset.themeChoice);
    } catch (error) {
      // Storage is blocked. The theme still changes, it just won't be remembered.
    }
  });
});

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const CITY_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const PLACE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

let locationState = 'unknown';
let weatherState = null;

const locateButton = document.querySelector('#locate-btn');
const cityForm = document.querySelector('#city-form');
const cityInput = document.querySelector('#city-input');
const coverStatus = document.querySelector('#cover-status');
const coverPlace = document.querySelector('#cover-place');
const coverWeather = document.querySelector('#cover-weather');

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function getJSON(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const wxFace = (x, y) => `<g><circle cx="${x - 4.5}" cy="${y - 1}" r="1.7" fill="#5a4343"/><circle cx="${x + 4.5}" cy="${y - 1}" r="1.7" fill="#5a4343"/><path d="M${x - 2.5} ${y + 3} Q${x} ${y + 5.6} ${x + 2.5} ${y + 3}" fill="none" stroke="#5a4343" stroke-width="1.6" stroke-linecap="round"/><circle cx="${x - 8.5}" cy="${y + 3.2}" r="2.2" fill="#ffb3c7" opacity=".85"/><circle cx="${x + 8.5}" cy="${y + 3.2}" r="2.2" fill="#ffb3c7" opacity=".85"/></g>`;
const wxCloud = (fill = '#ffffff') => `<path d="M20 48 C11 48 8 38 15 34 C14 25 24 20 30 26 C34 17 48 20 48 30 C57 30 58 48 48 48 Z" fill="${fill}" stroke="#a894b5" stroke-width="1.8" stroke-linejoin="round"/>`;
const wxRays = (cx, cy, from, to, color) => `<g stroke="${color}" stroke-width="3" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4;
  const x = (radius) => (cx + radius * Math.cos(angle)).toFixed(1);
  const y = (radius) => (cy + radius * Math.sin(angle)).toFixed(1);
  return `<line x1="${x(from)}" y1="${y(from)}" x2="${x(to)}" y2="${y(to)}"/>`;
}).join('')}</g>`;
const wxDrop = (x, y) => `<path transform="translate(${x} ${y})" d="M0 0 C-3.5 4.5 -3.5 8 0 8 C3.5 8 3.5 4.5 0 0Z" fill="#7cc4f0" stroke="#4aa3d9" stroke-width="1"/>`;
const wxFlake = (x, y) => `<path transform="translate(${x} ${y})" d="M-3.5 0H3.5M0 -3.5V3.5M-2.5 -2.5L2.5 2.5M-2.5 2.5L2.5 -2.5" stroke="#8ccbe9" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
const wxSparkle = (x, y, scale = 1) => `<path transform="translate(${x} ${y}) scale(${scale})" d="M0 -5 L1.4 -1.4 L5 0 L1.4 1.4 L0 5 L-1.4 1.4 L-5 0 L-1.4 -1.4Z" fill="#ffd86b"/>`;
const wxSvg = (inner) => `<svg viewBox="0 0 64 64" focusable="false">${inner}</svg>`;

const WEATHER_ICONS = {
  sunny: wxSvg(`${wxRays(32, 32, 17, 23, '#ffb347')}<circle cx="32" cy="32" r="12.5" fill="#ffd86b" stroke="#e8a93c" stroke-width="1.8"/>${wxFace(32, 32)}`),
  night: wxSvg(`<circle cx="32" cy="33" r="16" fill="#fff0a8" stroke="#e5c96a" stroke-width="1.8"/><circle cx="42" cy="27" r="2.6" fill="#f4dc84"/><circle cx="23" cy="43" r="2" fill="#f4dc84"/>${wxFace(32, 33)}${wxSparkle(52, 12)}${wxSparkle(11, 16, 0.7)}`),
  partly: wxSvg(`${wxRays(24, 24, 12, 17, '#ffb347')}<circle cx="24" cy="24" r="9" fill="#ffd86b" stroke="#e8a93c" stroke-width="1.6"/><g transform="translate(5 9)">${wxCloud()}</g>${wxFace(37.5, 46)}`),
  cloudy: wxSvg(`<g transform="translate(14 -4) scale(.7)">${wxCloud('#e9e1f5')}</g><g transform="translate(0 4)">${wxCloud()}</g>${wxFace(32.5, 41)}`),
  rain: wxSvg(`<g transform="translate(0 -6)">${wxCloud()}</g>${wxFace(32.5, 31)}${wxDrop(22, 46)}${wxDrop(32, 51)}${wxDrop(42, 46)}`),
  storm: wxSvg(`<g transform="translate(0 -6)">${wxCloud('#ddd3ee')}</g>${wxFace(32.5, 31)}<polygon points="35,40 27,53 33,53 30,62 42,47 35,47 38,40" fill="#ffd23f" stroke="#e8a93c" stroke-width="1.2" stroke-linejoin="round"/>`),
  snow: wxSvg(`<g transform="translate(0 -6)">${wxCloud()}</g>${wxFace(32.5, 31)}${wxFlake(22, 49)}${wxFlake(32, 55)}${wxFlake(42, 49)}`),
  fog: wxSvg(`<g transform="translate(0 -6)">${wxCloud()}</g>${wxFace(32.5, 31)}<path d="M14 49h28M22 56h28" stroke="#c9bfe0" stroke-width="3.2" stroke-linecap="round"/>`),
  windy: wxSvg(`<g transform="translate(-6 2)">${wxCloud()}</g>${wxFace(26.5, 39)}<path d="M44 26 H54 a4.5 4.5 0 1 0 -4.5 -4.5" fill="none" stroke="#8fc9e3" stroke-width="3" stroke-linecap="round"/><path d="M40 52 H55 a4.5 4.5 0 1 1 -4.5 4.5" fill="none" stroke="#8fc9e3" stroke-width="3" stroke-linecap="round"/>`),
  cold: wxSvg(`<rect x="14" y="16" width="36" height="34" rx="9" fill="#d7f0fb" stroke="#7dbfe0" stroke-width="1.8"/><path d="M20 24 Q20 21 23 21" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>${wxFace(32, 35)}<path d="M8 30q-3 4 0 8M56 30q3 4 0 8M52 8v8M48 12h8" stroke="#7dbfe0" fill="none" stroke-width="1.8" stroke-linecap="round"/>`),
  hot: wxSvg(`${wxRays(32, 32, 17, 23, '#ff8a5c')}<circle cx="32" cy="32" r="12.5" fill="#ffb15c" stroke="#e5883a" stroke-width="1.8"/><rect x="21" y="27" width="9.5" height="6.5" rx="3" fill="#5a4343"/><rect x="33.5" y="27" width="9.5" height="6.5" rx="3" fill="#5a4343"/><path d="M30.5 29.5h3" stroke="#5a4343" stroke-width="1.6"/><path d="M29.5 38 Q32 40.6 34.5 38" fill="none" stroke="#5a4343" stroke-width="1.6" stroke-linecap="round"/><circle cx="23.5" cy="37" r="2.2" fill="#ff8f8f" opacity=".8"/><circle cx="40.5" cy="37" r="2.2" fill="#ff8f8f" opacity=".8"/>${wxDrop(52, 10)}`),
};

function weatherIcon(kind) {
  const icon = el('span', 'wx-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = WEATHER_ICONS[kind] || WEATHER_ICONS.cloudy;
  return icon;
}

function describeWeather({ code, tempF, windMph, isDay }) {
  if (code >= 95) return { kind: 'storm', label: 'Thunderstorm' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { kind: 'snow', label: 'Snowy' };
  if ([51, 53, 55, 56, 57].includes(code)) return { kind: 'rain', label: 'Drizzly' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { kind: 'rain', label: 'Rainy' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Foggy' };
  if (windMph >= 20) return { kind: 'windy', label: 'Windy' };
  if (tempF >= 88) return { kind: 'hot', label: 'Hot' };
  if (tempF <= 40) return { kind: 'cold', label: tempF <= 32 ? 'Freezing' : 'Chilly' };
  if (code <= 1) return isDay ? { kind: 'sunny', label: 'Sunny' } : { kind: 'night', label: 'Clear night' };
  if (code === 2) return { kind: 'partly', label: 'Partly cloudy' };
  return { kind: 'cloudy', label: 'Cloudy' };
}

function formatTemperature(tempF) {
  const region = (navigator.language || '').split('-')[1];
  const useFahrenheit = !region || ['US', 'LR', 'MM'].includes(region.toUpperCase());
  return useFahrenheit ? `${Math.round(tempF)}°F` : `${Math.round(((tempF - 32) * 5) / 9)}°C`;
}

async function fetchWeather(latitude, longitude) {
  const url = `${WEATHER_URL}?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}` +
    '&current=temperature_2m,weather_code,wind_speed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph';
  const data = await getJSON(url);
  const now = data && data.current;
  if (!now || typeof now.temperature_2m !== 'number') throw new Error('The weather service sent something unexpected');
  return { tempF: now.temperature_2m, code: now.weather_code, windMph: now.wind_speed_10m || 0, isDay: now.is_day !== 0 };
}

async function fetchPlaceName(latitude, longitude) {
  try {
    const data = await getJSON(`${PLACE_URL}?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&localityLanguage=en`);
    const town = data.city || data.locality;
    const region = data.principalSubdivision;
    return [town, region].filter(Boolean).join(', ');
  } catch (error) {
    return '';
  }
}

async function lookupCity(name) {
  const search = name.split(',')[0].trim();
  const data = await getJSON(`${CITY_SEARCH_URL}?name=${encodeURIComponent(search)}&count=1&language=en&format=json`);
  const match = data && data.results && data.results[0];
  if (!match) return null;
  return {
    latitude: match.latitude,
    longitude: match.longitude,
    label: [match.name, match.admin1 || match.country].filter(Boolean).join(', '),
  };
}

function setWeatherState(weather, place) {
  const { kind, label } = describeWeather(weather);
  weatherState = { place: place || 'Your location', kind, label, tempF: weather.tempF, text: `${formatTemperature(weather.tempF)} · ${label}` };
}

async function loadWeatherFor(latitude, longitude, knownPlace = '') {
  const [weather, place] = await Promise.all([
    fetchWeather(latitude, longitude),
    knownPlace ? Promise.resolve(knownPlace) : fetchPlaceName(latitude, longitude),
  ]);
  setWeatherState(weather, place);
  setMessage(coverStatus, '');
  cityForm.hidden = true;
}

function showCityForm(message) {
  cityForm.hidden = false;
  if (message) setMessage(coverStatus, message);
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject({ code: 0 });
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 600000 });
  });
}

async function useMyLocation() {
  locateButton.disabled = true;
  setMessage(coverStatus, 'Finding you…');

  try {
    const position = await getPosition();
    locationState = 'granted';
    await loadWeatherFor(position.coords.latitude, position.coords.longitude);
  } catch (error) {
    if (error && error.code === 1) {
      locationState = 'denied';
      showCityForm('No problem! Type your city to see the weather, or just skip it.');
    } else if (error && typeof error.code === 'number') {
      if (error.code === 0) locationState = 'unsupported';
      showCityForm("Couldn't find your location. Type your city instead?");
    } else {
      setMessage(coverStatus, "Couldn't load the weather right now. Please try again in a bit.", true);
    }
  } finally {
    locateButton.disabled = false;
    refreshWeatherUI();
  }
}

locateButton.addEventListener('click', useMyLocation);

cityForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = cityInput.value.trim();
  if (!name) return;

  setMessage(coverStatus, `Looking up ${name}…`);
  try {
    const city = await lookupCity(name);
    if (!city) {
      setMessage(coverStatus, `Couldn't find "${name}". Check the spelling?`, true);
      return;
    }
    await loadWeatherFor(city.latitude, city.longitude, city.label);
  } catch (error) {
    setMessage(coverStatus, "Couldn't load the weather right now. Please try again in a bit.", true);
  }
  refreshWeatherUI();
});

async function initLocation() {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    locationState = status.state;
    status.addEventListener('change', () => {
      locationState = status.state;
      refreshWeatherUI();
    });
  } catch (error) {
    locationState = 'prompt';
  }

  if (locationState === 'granted') {
    useMyLocation();
  } else if (locationState === 'denied') {
    showCityForm('Location is turned off. You can type your city instead.');
  }
  refreshWeatherUI();
}

function weatherFeatureOff() {
  return !weatherState && (locationState === 'denied' || locationState === 'unsupported');
}

function fillWeatherIfNeeded(page) {
  if (!weatherState || page.weather || page.date !== todayISO()) return;
  if (page.layout !== 'weekly' && page.layout !== 'classic') return;

  page.place = weatherState.place;
  page.weather = weatherState.text;
  page.weatherIcon = weatherState.kind;
  saveJournal();
}

function refreshWeatherUI() {
  if (weatherState) {
    coverPlace.textContent = weatherState.place;
    coverWeather.replaceChildren(weatherIcon(weatherState.kind), weatherState.text);
  }

  const page = currentPage();
  fillWeatherIfNeeded(page);
  if (isTurning) return;

  renderStamp(page);
  const chip = leftPage.querySelector('.weather-chip');
  if (chip) chip.replaceWith(buildWeatherChip(page));
}

function buildWeatherChip(page) {
  const chip = el('div', 'weather-chip');

  if (page.weather) {
    const text = el('div', 'weather-chip__text');
    text.append(el('strong', '', page.weather));
    if (page.place) text.append(el('small', '', page.place));
    chip.append(weatherIcon(page.weatherIcon || 'cloudy'), text);
  } else if (weatherFeatureOff() || page.date !== todayISO()) {
    chip.hidden = true;
  } else if (locationState === 'granted' || weatherState) {
    chip.append(el('span', 'weather-chip__loading', 'Getting the weather…'));
  } else {
    const ask = el('button', 'btn weather-chip__ask', "Add today's weather");
    ask.type = 'button';
    ask.dataset.action = 'locate-weather';
    chip.append(ask);
  }
  return chip;
}

const QUOTE_URL = 'https://dummyjson.com/quotes/random';
const CAT_URL = 'https://api.thecatapi.com/v1/images/search';

const FALLBACK_QUOTES = [
  { text: 'Small steps still move you forward.', author: 'Your journal' },
  { text: 'Today is a fresh page.', author: 'Your journal' },
  { text: 'Be gentle with yourself. You are doing your best.', author: 'Your journal' },
  { text: 'One good thing at a time.', author: 'Your journal' },
  { text: 'Rest is productive too.', author: 'Your journal' },
  { text: 'Little by little becomes a lot.', author: 'Your journal' },
];

const pendingLoads = new Set();

async function fetchQuote() {
  try {
    const data = await getJSON(QUOTE_URL);
    if (data && typeof data.quote === 'string' && data.quote.trim()) {
      return { text: data.quote.slice(0, 240), author: String(data.author || 'Unknown').slice(0, 60) };
    }
  } catch (error) {
    // The quote API is down, so use one of the saved quotes below.
  }
  return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
}

async function fetchCatUrl() {
  try {
    const data = await getJSON(CAT_URL);
    const url = data && data[0] && data[0].url;
    if (typeof url === 'string' && url.startsWith('https://')) return url;
  } catch (error) {
    // The cat API is down, so use the backup cat image below.
  }
  return `https://cataas.com/cat?width=600&height=600&t=${Date.now()}`;
}

async function loadQuoteFor(page, force = false) {
  const key = `${page.id}:quote`;
  if (pendingLoads.has(key) || (page.quote && !force)) return;

  pendingLoads.add(key);
  try {
    page.quote = await fetchQuote();
    saveJournal();
  } finally {
    pendingLoads.delete(key);
  }
  if (page === currentPage() && !isTurning) refreshQuoteCard(page);
}

async function loadCatFor(page, force = false) {
  const key = `${page.id}:cat`;
  if (pendingLoads.has(key) || (page.cat && !force)) return;

  pendingLoads.add(key);
  try {
    page.cat = await fetchCatUrl();
    saveJournal();
  } finally {
    pendingLoads.delete(key);
  }
  if (page === currentPage() && !isTurning) refreshCatCard(page);
}

function buildQuoteCard(page) {
  const card = el('figure', 'quote-card');
  card.append(el('blockquote', 'quote-card__text', page.quote ? page.quote.text : 'Finding a little boost for you…'));
  if (page.quote && page.quote.author) card.append(el('figcaption', 'quote-card__author', `${page.quote.author}`));

  const refresh = el('button', 'quote-card__refresh', '↻');
  refresh.type = 'button';
  refresh.dataset.action = 'new-quote';
  refresh.title = 'Show a different quote';
  refresh.setAttribute('aria-label', 'Show a different quote');
  card.append(refresh);
  return card;
}

function catCaption(page) {
  return todoStats(page).left === 0 ? 'All done! High five from your cat ♡' : 'Your cheer-up cat ♡';
}

function buildCatCard(page) {
  const card = el('figure', 'cat-card');
  const frame = el('div', 'cat-card__frame');

  if (page.cat) {
    const image = el('img', 'cat-card__img');
    image.src = page.cat;
    image.alt = 'A random cat photo';
    image.draggable = false;
    image.addEventListener('error', () => {
      frame.replaceChildren(el('p', 'cat-card__empty', 'This cat is feeling shy. Try another!'));
    });
    frame.append(image);
  } else {
    frame.append(el('p', 'cat-card__empty', 'A cat is on the way…'));
  }

  const refresh = el('button', 'cat-card__refresh', 'New cat');
  refresh.type = 'button';
  refresh.dataset.action = 'new-cat';

  card.append(frame, el('figcaption', 'cat-card__caption', catCaption(page)), refresh);
  card.classList.toggle('is-celebrating', todoStats(page).left === 0);
  return card;
}

function refreshQuoteCard(page) {
  rightPage.querySelectorAll('.quote-card').forEach((card) => card.replaceWith(buildQuoteCard(page)));
}

function refreshCatCard(page) {
  rightPage.querySelectorAll('.cat-card').forEach((card) => card.replaceWith(buildCatCard(page)));
}

const layoutDialog = document.querySelector('#layout-dialog');
const layoutCancel = document.querySelector('#layout-cancel');
const layoutTitle = document.querySelector('#layout-title');
const layoutButton = document.querySelector('#layout-btn');
const canvasFileInput = document.querySelector('#canvas-file-input');

function isoFromDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function weekdayDates(isoDate) {
  const date = parseISODate(isoDate);
  const sinceMonday = (date.getDay() + 6) % 7;
  return WEEKDAYS.map((day, index) => {
    const dayDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday + index);
    return { ...day, iso: isoFromDate(dayDate) };
  });
}

function labeledInput(labelText, type, field, value) {
  const label = el('label', 'mini-field');
  const input = el('input');
  input.type = type;
  input.value = value;
  input.dataset.field = field;
  label.append(el('span', '', labelText), input);
  return label;
}

function buildTextArea(page, field, placeholder) {
  const area = el('textarea', 'lined-text');
  area.dataset.textField = field;
  area.value = page[field];
  area.placeholder = placeholder;
  area.setAttribute('aria-label', field === 'text' ? 'Journal text, left page' : 'Journal text, right page');
  return area;
}

function buildTextLeft(page) {
  const wrap = el('section', 'txt');
  wrap.append(buildTextArea(page, 'text', 'Dear journal…'));
  return wrap;
}

function buildTextRight(page) {
  const wrap = el('section', 'txt');

  const top = el('div', 'right-top');
  const head = el('div', 'txt__head');
  head.append(el('h3', 'txt__title', 'Today ✿'), labeledInput('Date', 'date', 'date', page.date));
  top.append(head);

  wrap.append(top, buildTextArea(page, 'text2', 'Keep writing here…'));
  return wrap;
}

function buildDayCard(page, day) {
  const card = el('div', 'day-card');
  if (day.iso === todayISO()) card.classList.add('is-today');

  const name = el('span', 'day-card__name', day.name);
  name.append(el('small', '', formatShortDate(day.iso)));

  const text = el('textarea', 'day-card__text');
  text.dataset.weekDay = day.id;
  text.value = page.week[day.id];
  text.maxLength = 600;
  text.placeholder = 'Plans, notes, little wins…';
  text.setAttribute('aria-label', `${day.name}, ${formatShortDate(day.iso)}`);

  card.append(name, text);
  return card;
}

function buildWeeklyLeft(page) {
  const days = weekdayDates(page.date);
  const wrap = el('section', 'wk');

  const head = el('header', 'wk__head');
  const title = el('h3', 'wk__title', 'This week ✿');
  title.append(el('small', '', `${formatShortDate(days[0].iso)} to ${formatShortDate(days[4].iso)}`));

  const stamp = el('div', 'wk__stamp');
  stamp.append(labeledInput('Date', 'date', 'date', page.date), labeledInput('Time', 'time', 'time', page.time));

  head.append(title, stamp, buildWeatherChip(page));

  const list = el('div', 'wk__days');
  days.slice(0, 3).forEach((day) => list.append(buildDayCard(page, day)));

  wrap.append(head, list);
  return wrap;
}

function buildWeeklyRight(page) {
  const days = weekdayDates(page.date);
  const wrap = el('section', 'wk wk--right');

  const top = el('div', 'right-top');
  top.append(buildQuoteCard(page));

  const list = el('div', 'wk__days');
  days.slice(3).forEach((day) => list.append(buildDayCard(page, day)));

  wrap.append(top, list);
  return wrap;
}

function todoStats(page) {
  const total = page.todos.length;
  const done = page.todos.filter((task) => task.done).length;
  return { total, done, left: total - done };
}

function paintProgress(root, stats) {
  const percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const track = root.querySelector('.progress-bar');
  track.setAttribute('aria-valuemax', String(stats.total));
  track.setAttribute('aria-valuenow', String(stats.done));
  track.querySelector('.progress-bar__fill').style.width = `${percent}%`;
  root.querySelector('.todo__count').textContent = stats.left === 0
    ? 'All done! You did it ✿'
    : `${stats.left} ${stats.left === 1 ? 'task' : 'tasks'} left`;
  root.classList.toggle('is-complete', stats.left === 0);
}

function buildTodoItem(task) {
  const item = el('li', 'todo-item');
  item.classList.toggle('is-done', task.done);

  const label = el('label', 'todo-item__label');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = task.done;
  box.dataset.todoId = task.id;
  label.append(box, el('span', 'todo-item__text', task.text));
  item.append(label);

  if (task.id === WATER_ID) {
    item.title = 'Your daily reminder ♡';
  } else {
    const remove = el('button', 'todo-item__delete', '✕');
    remove.type = 'button';
    remove.dataset.action = 'delete-todo';
    remove.dataset.todoId = task.id;
    remove.setAttribute('aria-label', `Delete "${task.text}"`);
    item.append(remove);
  }
  return item;
}

function buildTodoLeft(page) {
  const wrap = el('section', 'todo');

  const head = el('header', 'todo__head');
  head.append(el('h3', 'todo__title', 'To-do ✿'), labeledInput('Date', 'date', 'date', page.date));

  const progress = el('div', 'todo__progress');
  const track = el('div', 'progress-bar');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Tasks finished');
  track.setAttribute('aria-valuemin', '0');
  track.append(el('span', 'progress-bar__fill'));
  progress.append(track, el('p', 'todo__count'));

  const list = el('ul', 'todo__list');
  page.todos.forEach((task) => list.append(buildTodoItem(task)));

  const form = el('form', 'todo__add');
  const input = el('input');
  input.type = 'text';
  input.name = 'task';
  input.maxLength = 80;
  input.placeholder = 'Add a task…';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'New task');
  const add = el('button', 'btn', 'Add');
  add.type = 'submit';
  form.append(input, add);

  wrap.append(head, progress, list, form);
  paintProgress(wrap, todoStats(page));
  return wrap;
}

function buildTodoRight(page) {
  const wrap = el('section', 'todo-right');
  const top = el('div', 'right-top');
  top.append(buildQuoteCard(page));
  wrap.append(top, buildCatCard(page));
  return wrap;
}

function updateTodoProgress(page) {
  const root = leftPage.querySelector('.todo');
  if (root) paintProgress(root, todoStats(page));
  refreshCatCard(page);
}

function buildPhotoLeft(page) {
  const wrap = el('section', 'photo-page');

  const top = el('div', 'photo-page__top');
  top.append(
    labeledInput('Date', 'date', 'date', page.date),
    el('p', 'photo-page__hint', 'Drop photos anywhere, double-click to write, and tap a sticker on the right.')
  );

  const tray = el('div', 'photo-tray');
  tray.setAttribute('role', 'group');
  tray.setAttribute('aria-label', 'Add to this page');
  [['add-text', 'Add text'], ['add-cat', 'Add a cat'], ['add-photo', 'Add photo']].forEach(([action, label]) => {
    const button = el('button', 'btn', label);
    button.type = 'button';
    button.dataset.action = action;
    tray.append(button);
  });

  wrap.append(top, tray);
  return wrap;
}

function buildPickPrompt() {
  const box = el('div', 'pick-prompt');
  const button = el('button', 'btn btn--primary', 'Pick a page style');
  button.type = 'button';
  button.dataset.action = 'choose-layout';
  box.append(el('p', 'pick-prompt__text', 'This page is waiting for a style ✿'), button);
  return box;
}

function renderLayoutSlots(page) {
  const builders = {
    text: [buildTextLeft, buildTextRight],
    weekly: [buildWeeklyLeft, buildWeeklyRight],
    todo: [buildTodoLeft, buildTodoRight],
    photo: [buildPhotoLeft, null],
    classic: [null, null],
  };
  const [left, right] = builders[page.layout] || [buildPickPrompt, null];

  leftSlot.replaceChildren(...(left ? [left(page)] : []));
  rightSlot.replaceChildren(...(right ? [right(page)] : []));
}

function ensureLayoutContent(page) {
  if (page.layout === 'weekly' || page.layout === 'todo') loadQuoteFor(page);
  if (page.layout === 'todo') loadCatFor(page);
}

notebook.addEventListener('input', (event) => {
  const field = event.target;
  if (field.matches('[data-text-field]')) {
    currentPage()[field.dataset.textField] = field.value;
    queueSave();
  } else if (field.matches('[data-week-day]')) {
    currentPage().week[field.dataset.weekDay] = field.value;
    queueSave();
  }
});

notebook.addEventListener('change', (event) => {
  const field = event.target;
  const page = currentPage();

  if (field.matches('[data-field="date"]')) {
    if (!field.value) {
      field.value = page.date;
      return;
    }
    page.date = field.value;
    entryDate.value = page.date;
    saveJournal();
    renderLayoutSlots(page);
    fillWeatherIfNeeded(page);
  } else if (field.matches('[data-field="time"]')) {
    if (field.value) {
      page.time = field.value;
      queueSave();
    }
  } else if (field.matches('[data-todo-id]')) {
    const task = page.todos.find((entry) => entry.id === field.dataset.todoId);
    if (!task) return;
    task.done = field.checked;
    field.closest('.todo-item').classList.toggle('is-done', task.done);
    updateTodoProgress(page);
    saveJournal();
  }
});

notebook.addEventListener('submit', (event) => {
  if (!event.target.matches('.todo__add')) return;
  event.preventDefault();

  const page = currentPage();
  const input = event.target.querySelector('input');
  const text = input.value.trim();
  if (!text) return;

  if (page.todos.length >= 31) {
    setMessage(appStatus, "That's a full list! Finish a few tasks first.", true);
    return;
  }

  page.todos.push({ id: newId(), text, done: false });
  saveJournal();
  renderLayoutSlots(page);
  leftSlot.querySelector('.todo__add input')?.focus();
});

notebook.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || !notebook.contains(button)) return;

  const page = currentPage();

  switch (button.dataset.action) {
    case 'new-quote':
      button.closest('.quote-card').classList.add('is-loading');
      loadQuoteFor(page, true);
      break;
    case 'new-cat':
      button.closest('.cat-card').classList.add('is-loading');
      loadCatFor(page, true);
      break;
    case 'locate-weather':
      useMyLocation();
      break;
    case 'delete-todo':
      page.todos = page.todos.filter((task) => task.id !== button.dataset.todoId || task.id === WATER_ID);
      saveJournal();
      renderLayoutSlots(page);
      break;
    case 'add-text':
      addTextItem();
      break;
    case 'add-cat':
      addCatPhoto();
      break;
    case 'add-photo':
      canvasFileInput.click();
      break;
    case 'choose-layout':
      openLayoutPicker(false);
      break;
    default:
      break;
  }
});

function openLayoutPicker(cancelable) {
  const page = currentPage();

  layoutDialog.querySelectorAll('[data-layout-choice]').forEach((card) => {
    const choice = card.dataset.layoutChoice;
    card.hidden = choice === 'classic' && page.layout !== 'classic';
    if (choice === page.layout) {
      card.setAttribute('aria-current', 'true');
    } else {
      card.removeAttribute('aria-current');
    }
  });
  layoutCancel.hidden = !cancelable;
  layoutTitle.textContent = cancelable ? 'Change this page style' : 'Pick a page style';

  if (!layoutDialog.open) layoutDialog.showModal();
}

function promptLayoutIfNeeded() {
  if (currentPage().layout || layoutDialog.open || !cover.hidden || isTurning) return;
  openLayoutPicker(false);
}

function chooseLayout(layout) {
  if (!LAYOUTS.includes(layout)) return;
  const page = currentPage();

  layoutDialog.close();
  if (page.layout === layout) return;

  page.layout = layout;
  page.todos = normalizeTodos(page.todos);
  selectItem(null);
  renderPage();
  saveJournal();
}

layoutDialog.addEventListener('click', (event) => {
  const card = event.target.closest('[data-layout-choice]');
  if (card) chooseLayout(card.dataset.layoutChoice);
});

layoutCancel.addEventListener('click', () => layoutDialog.close());

layoutButton.addEventListener('click', () => {
  if (!isTurning) openLayoutPicker(true);
});

const ITEM_TYPES = ['sticker', 'text', 'image'];
const ITEM_COLORS = ['#5a4343', '#d6578a', '#7a5cc7', '#2f9e7a', '#d9822b'];
const ITEM_CONTROLS = [
  ['smaller', '−', 'Make smaller'],
  ['bigger', '+', 'Make bigger'],
  ['rotate-left', '↺', 'Turn left'],
  ['rotate-right', '↻', 'Turn right'],
  ['front', '↑', 'Bring to front'],
  ['color', '✎', 'Change color'],
  ['delete', '✕', 'Delete'],
];

let selectedItemId = null;

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object' || !ITEM_TYPES.includes(raw.type)) return null;

  const number = (value, fallback, min, max) =>
    (typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback);
  const defaultWidth = { sticker: 26, text: 42, image: 36 }[raw.type];

  const item = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : newId(),
    type: raw.type,
    side: raw.side === 'right' ? 'right' : 'left',
    x: number(raw.x, 20, -10, 100),
    y: number(raw.y, 20, -10, 100),
    w: number(raw.w, defaultWidth, 5, 95),
    rot: number(raw.rot, 0, -180, 180),
    z: Math.round(number(raw.z, 1, 1, 99999)),
    src: null,
    text: '',
    fs: 5,
    color: 0,
  };

  if (raw.type === 'sticker') {
    if (typeof raw.src !== 'string' || !/^(?:img|Image)\/[\w.-]+\.(svg|png|jpe?g|webp|gif)$/i.test(raw.src)) return null;
    item.src = raw.src;
  } else if (raw.type === 'image') {
    if (typeof raw.src === 'string' && (raw.src.startsWith('data:image/') || raw.src.startsWith('https://'))) {
      item.src = raw.src;
    } else if (raw.src !== null && raw.src !== undefined) {
      return null;
    }
  } else {
    item.text = typeof raw.text === 'string' ? raw.text.slice(0, 300) : '';
    item.fs = number(raw.fs, 5, 2, 14);
    item.color = Number.isInteger(raw.color) ? clamp(raw.color, 0, ITEM_COLORS.length - 1) : 0;
  }
  return item;
}

function findItem(page, id) {
  return page.items.find((item) => item.id === id) || null;
}

function nextZ(page) {
  return page.items.reduce((highest, item) => Math.max(highest, item.z), 0) + 1;
}

function layerFor(item) {
  return item.side === 'right' ? rightItems : leftItems;
}

function wrapFor(id) {
  return notebook.querySelector(`.item[data-item-id="${id}"]`);
}

function applyItemStyle(wrap, item) {
  const body = wrap.querySelector('.item__body');
  wrap.style.left = `${item.x}%`;
  wrap.style.top = `${item.y}%`;
  wrap.style.width = `${item.w}%`;
  wrap.style.zIndex = String(item.z);
  body.style.transform = `rotate(${item.rot}deg)`;

  if (item.type === 'text') {
    body.style.setProperty('--fs', String(item.fs));
    body.style.setProperty('--item-color', ITEM_COLORS[item.color]);
  }
  wrap.classList.toggle('controls-below', item.y < 12);
}

function buildItem(item) {
  const wrap = el('div', `item item--${item.type}`);
  wrap.dataset.itemId = item.id;
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', { sticker: 'Sticker', image: 'Photo', text: 'Text note' }[item.type]);
  wrap.classList.toggle('is-selected', item.id === selectedItemId);

  const body = el('div', 'item__body');
  if (item.type === 'text') {
    const text = el('div', 'item__text', item.text);
    text.dataset.placeholder = 'Type here…';
    text.setAttribute('aria-label', 'Note text');
    body.append(text);
  } else {
    const image = el('img');
    image.src = item.src;
    image.alt = '';
    image.draggable = false;
    body.append(image);
  }
  wrap.append(body);

  const controls = el('div', 'item__controls');
  ITEM_CONTROLS.forEach(([action, symbol, label]) => {
    if (action === 'color' && item.type !== 'text') return;
    const button = el('button', '', symbol);
    button.type = 'button';
    button.dataset.itemAction = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    controls.append(button);
  });
  wrap.append(controls);

  applyItemStyle(wrap, item);
  return wrap;
}

function renderItems(page) {
  leftItems.replaceChildren();
  rightItems.replaceChildren();
  page.items.forEach((item) => {
    if (item.type === 'image' && !item.src) return;
    layerFor(item).append(buildItem(item));
  });
}

function selectItem(id) {
  selectedItemId = id;
  notebook.querySelectorAll('.item').forEach((wrap) => {
    wrap.classList.toggle('is-selected', wrap.dataset.itemId === id);
  });
}

function insertItem(page, partial) {
  if (page.items.length >= MAX_ITEMS_PER_PAGE) {
    setMessage(appStatus, 'This page is full of goodies! Remove something to add more.', true);
    return null;
  }

  const item = normalizeItem({ id: newId(), z: nextZ(page), ...partial });
  if (!item) return null;
  page.items.push(item);

  if (page === currentPage() && !isTurning) {
    renderItems(page);
    selectItem(item.id);
  }
  saveJournal();
  return item;
}

function removeItem(page, id) {
  page.items = page.items.filter((item) => item.id !== id);
  if (selectedItemId === id) selectedItemId = null;
  wrapFor(id)?.remove();
  saveJournal();
}

function randomSpot() {
  return { x: 12 + Math.random() * 40, y: 22 + Math.random() * 35 };
}

function addSticker(src) {
  const page = currentPage();
  if (isTurning) return;
  if (!page.layout) {
    setMessage(appStatus, 'Pick a page style first, then decorate it ✿');
    return;
  }
  setMessage(appStatus, '');

  const added = insertItem(page, { type: 'sticker', src, side: page.items.length % 2 ? 'right' : 'left', w: 30, ...randomSpot() });

  // Credit the artist once, after the user has added more than 3 stickers.
  if (added && ++stickersAdded > STICKER_CREDIT_AFTER && !creditShown) {
    creditShown = true;
    creditDialog.showModal();
    launchConfetti();
  }
}

function launchConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const colors = ['#7fae8e', '#a8cf9a', '#f2d98d', '#8fc1d9', '#f2b6a0'];
  const shapes = ['🍃', '❀', '✿', '✦', '•'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < 48; i += 1) {
    const piece = document.createElement('span');
    const color = colors[i % colors.length];
    if (i % 3 === 0) {
      piece.className = 'is-bit';
      piece.style.background = color;
    } else {
      piece.textContent = shapes[i % shapes.length];
      piece.style.color = color;
    }
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty('--dur', `${2.4 + Math.random() * 1.8}s`);
    piece.style.setProperty('--delay', `${Math.random() * 0.6}s`);
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    piece.style.setProperty('--spin', `${(Math.random() - 0.5) * 1080}deg`);
    layer.append(piece);
  }

  creditDialog.append(layer);
  setTimeout(() => layer.remove(), 4800);
}

const STICKER_CREDIT_AFTER = 3;
const creditDialog = document.querySelector('#credit-dialog');
let stickersAdded = 0;
let creditShown = false;

document.querySelector('#credit-close').addEventListener('click', () => creditDialog.close());
creditDialog.addEventListener('click', (event) => {
  if (event.target === creditDialog) creditDialog.close();
});

stickerGrid.addEventListener('click', (event) => {
  const button = event.target.closest('.sticker-btn');
  if (button) addSticker(button.dataset.sticker);
});

function addTextItem(spot) {
  const page = currentPage();
  if (isTurning) return;

  const item = insertItem(page, { type: 'text', side: 'left', ...(spot || randomSpot()) });
  if (item) beginTextEdit(wrapFor(item.id));
}

function spotFromPoint(clientX, clientY, widthPercent) {
  const left = leftItems.getBoundingClientRect();
  const right = rightItems.getBoundingClientRect();
  const sideBySide = right.left - left.left > 40;
  const isRight = sideBySide ? clientX >= right.left : clientY >= right.top;
  const box = isRight ? right : left;

  return {
    side: isRight ? 'right' : 'left',
    x: clamp(((clientX - box.left) / box.width) * 100 - widthPercent / 2, -5, 85),
    y: clamp(((clientY - box.top) / box.height) * 100 - 8, 0, 85),
  };
}

async function addImageFiles(files, point) {
  const page = currentPage();
  const images = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, 6);

  if (images.length === 0) {
    setMessage(appStatus, "That file isn't an image. Try a JPG, PNG, or GIF.", true);
    return;
  }

  setMessage(appStatus, images.length === 1 ? 'Adding your photo…' : 'Adding your photos…');
  let added = 0;

  for (const file of images) {
    if (file.size > MAX_FILE_BYTES) {
      setMessage(appStatus, 'That photo is too big. Try one under 15 MB.', true);
      continue;
    }
    try {
      const src = await readPhoto(file, CANVAS_PHOTO_SIZE);
      const where = point
        ? spotFromPoint(point.x + added * 14, point.y + added * 14, 36)
        : { side: added % 2 ? 'right' : 'left', ...randomSpot() };
      insertItem(page, { type: 'image', src, w: 36, rot: Math.round(Math.random() * 8 - 4), ...where });
      added += 1;
    } catch (error) {
      setMessage(appStatus, "Couldn't read that image. Try a different file.", true);
    }
  }
  if (added > 0) setMessage(appStatus, '');
}

async function addCatPhoto() {
  const page = currentPage();
  if (isTurning) return;
  setMessage(appStatus, 'Fetching a cat…');

  const url = await fetchCatUrl();
  let src = url;
  try {
    const response = await fetch(url);
    if (response.ok) src = await readPhoto(await response.blob(), CANVAS_PHOTO_SIZE);
  } catch (error) {
    // Couldn't download and resize the photo, so keep using the original cat link.
  }

  insertItem(page, { type: 'image', src, w: 36, rot: Math.round(Math.random() * 8 - 4), side: 'left', ...randomSpot() });
  setMessage(appStatus, '');
}

canvasFileInput.addEventListener('change', () => {
  addImageFiles(canvasFileInput.files, null);
  canvasFileInput.value = '';
});

let canvasDragDepth = 0;
const isPhotoPage = () => currentPage().layout === 'photo';

notebook.addEventListener('dragenter', (event) => {
  if (!hasFiles(event) || !isPhotoPage()) return;
  event.preventDefault();
  canvasDragDepth += 1;
  notebook.classList.add('is-canvas-dragover');
});

notebook.addEventListener('dragover', (event) => {
  if (!hasFiles(event) || !isPhotoPage()) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

notebook.addEventListener('dragleave', (event) => {
  if (!hasFiles(event) || !isPhotoPage()) return;
  canvasDragDepth = Math.max(0, canvasDragDepth - 1);
  if (canvasDragDepth === 0) notebook.classList.remove('is-canvas-dragover');
});

notebook.addEventListener('drop', (event) => {
  if (!hasFiles(event) || !isPhotoPage()) return;
  event.preventDefault();
  canvasDragDepth = 0;
  notebook.classList.remove('is-canvas-dragover');
  addImageFiles(event.dataTransfer.files, { x: event.clientX, y: event.clientY });
});

notebook.addEventListener('dblclick', (event) => {
  if (!isPhotoPage() || isTurning || event.target.closest('.item, button, input, textarea, label')) return;
  const spot = spotFromPoint(event.clientX, event.clientY, 42);
  addTextItem({ ...spot, x: clamp(spot.x, 0, 55) });
});

function beginTextEdit(wrap) {
  if (!wrap) return;
  const text = wrap.querySelector('.item__text');
  text.contentEditable = 'true';
  wrap.classList.add('is-editing');
  text.focus();

  const range = document.createRange();
  range.selectNodeContents(text);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function endTextEdit(text) {
  const wrap = text.closest('.item');
  const page = currentPage();
  const item = findItem(page, wrap.dataset.itemId);

  text.contentEditable = 'false';
  wrap.classList.remove('is-editing');
  if (!item) return;

  if (text.innerText.trim() === '') {
    removeItem(page, item.id);
  } else {
    item.text = text.innerText.slice(0, 300);
    saveJournal();
  }
}

let itemDrag = null;

function sideBySide() {
  return rightItems.getBoundingClientRect().left - leftItems.getBoundingClientRect().left > 40;
}

function onItemPointerDown(event) {
  const wrap = event.target.closest('.item');
  if (!wrap || event.button !== 0 || isTurning) return;

  event.stopPropagation();
  if (event.target.closest('.item__controls')) return;
  if (event.target.isContentEditable) return;

  const item = findItem(currentPage(), wrap.dataset.itemId);
  if (!item) return;
  selectItem(item.id);

  const layerBox = wrap.parentElement.getBoundingClientRect();
  const wrapBox = wrap.getBoundingClientRect();
  itemDrag = {
    item,
    wrap,
    startX: event.clientX,
    startY: event.clientY,
    originLeft: wrapBox.left - layerBox.left,
    originTop: wrapBox.top - layerBox.top,
    moved: false,
  };
  window.addEventListener('pointermove', onItemPointerMove);
  window.addEventListener('pointerup', onItemPointerUp);
  window.addEventListener('pointercancel', onItemPointerUp);
}

function onItemPointerMove(event) {
  if (!itemDrag) return;
  const drag = itemDrag;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;

  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  drag.wrap.classList.add('is-dragging');

  let layer = drag.wrap.parentElement;
  let left = drag.originLeft + dx;
  let top = drag.originTop + dy;
  const width = drag.wrap.offsetWidth;
  const height = drag.wrap.offsetHeight;

  if (sideBySide()) {
    const shift = rightItems.getBoundingClientRect().left - leftItems.getBoundingClientRect().left;
    const centerX = left + width / 2;

    if (drag.item.side === 'left' && centerX > layer.clientWidth) {
      drag.item.side = 'right';
      drag.originLeft -= shift;
      left -= shift;
      rightItems.append(drag.wrap);
    } else if (drag.item.side === 'right' && centerX < 0) {
      drag.item.side = 'left';
      drag.originLeft += shift;
      left += shift;
      leftItems.append(drag.wrap);
    }
    layer = drag.wrap.parentElement;
  }

  left = clamp(left, -width / 2, layer.clientWidth - width / 2);
  top = clamp(top, -height / 2, layer.clientHeight - height / 2);
  drag.wrap.style.left = `${left}px`;
  drag.wrap.style.top = `${top}px`;
  drag.latest = { left, top, layer };
}

function onItemPointerUp() {
  window.removeEventListener('pointermove', onItemPointerMove);
  window.removeEventListener('pointerup', onItemPointerUp);
  window.removeEventListener('pointercancel', onItemPointerUp);

  const drag = itemDrag;
  itemDrag = null;
  if (!drag) return;
  drag.wrap.classList.remove('is-dragging');

  if (drag.moved && drag.latest) {
    const { left, top, layer } = drag.latest;
    drag.item.x = Math.round((left / layer.clientWidth) * 1000) / 10;
    drag.item.y = Math.round((top / layer.clientHeight) * 1000) / 10;
    applyItemStyle(drag.wrap, drag.item);
    saveJournal();
  }
}

function onItemControl(event) {
  const button = event.target.closest('[data-item-action]');
  if (!button) return;
  event.stopPropagation();

  const wrap = button.closest('.item');
  const page = currentPage();
  const item = findItem(page, wrap.dataset.itemId);
  if (!item) return;

  switch (button.dataset.itemAction) {
    case 'smaller':
    case 'bigger': {
      const factor = button.dataset.itemAction === 'bigger' ? 1.15 : 1 / 1.15;
      if (item.type === 'text') {
        item.fs = clamp(item.fs * factor, 2, 14);
      } else {
        item.w = clamp(item.w * factor, 5, 95);
      }
      break;
    }
    case 'rotate-left':
      item.rot = item.rot - 15 < -180 ? 165 : item.rot - 15;
      break;
    case 'rotate-right':
      item.rot = item.rot + 15 > 180 ? -165 : item.rot + 15;
      break;
    case 'front':
      item.z = nextZ(page);
      break;
    case 'color':
      item.color = (item.color + 1) % ITEM_COLORS.length;
      break;
    case 'delete':
      removeItem(page, item.id);
      return;
    default:
      return;
  }
  applyItemStyle(wrap, item);
  queueSave();
}

function onItemKeyDown(event) {
  if (event.target.matches('.item__text')) {
    if (event.key === 'Escape') event.target.blur();
    return;
  }
  const wrap = event.target.closest('.item');
  if (!wrap || event.target !== wrap) return;

  const page = currentPage();
  const item = findItem(page, wrap.dataset.itemId);
  if (!item) return;

  const step = event.shiftKey ? 5 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };

  if (moves[event.key]) {
    event.preventDefault();
    item.x = clamp(item.x + moves[event.key][0], -5, 95);
    item.y = clamp(item.y + moves[event.key][1], -5, 95);
    applyItemStyle(wrap, item);
    queueSave();
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    removeItem(page, item.id);
  } else if (event.key === 'Enter' && item.type === 'text') {
    event.preventDefault();
    beginTextEdit(wrap);
  }
}

[leftItems, rightItems].forEach((layer) => {
  layer.addEventListener('pointerdown', onItemPointerDown);
  layer.addEventListener('click', onItemControl);
  layer.addEventListener('keydown', onItemKeyDown);

  layer.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    const text = event.target.closest('.item--text');
    if (text) beginTextEdit(text);
  });

  layer.addEventListener('focusin', (event) => {
    const wrap = event.target.closest('.item');
    if (wrap && wrap.dataset.itemId !== selectedItemId) selectItem(wrap.dataset.itemId);
  });

  layer.addEventListener('focusout', (event) => {
    if (event.target.matches('.item__text') && event.target.isContentEditable) endTextEdit(event.target);
  });

  layer.addEventListener('input', (event) => {
    if (!event.target.matches('.item__text')) return;
    const item = findItem(currentPage(), event.target.closest('.item').dataset.itemId);
    if (item) {
      item.text = event.target.innerText.slice(0, 300);
      queueSave();
    }
  });

  layer.addEventListener('paste', (event) => {
    if (!event.target.matches('.item__text')) return;
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const plain = event.clipboardData.getData('text/plain');
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(plain));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    event.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

document.addEventListener('pointerdown', (event) => {
  if (selectedItemId && !event.target.closest('.item')) selectItem(null);
});

const USERS_KEY = 'dailyJournal.users';
const SESSION_KEY = 'dailyJournal.session';
const ATTEMPTS_KEY = 'dailyJournal.attempts';

const PBKDF2_ITERATIONS = 600000;
const OLD_PBKDF2_ITERATIONS = 150000;
const DUMMY_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';
const SESSION_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const MAX_LOCK_SECONDS = 15 * 60;

const NAME_PATTERN = /^\p{L}[\p{L}\p{M}' -]*\p{L}$/u;
const EMAIL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;
const COMMON_PASSWORDS = [
  'password', 'password1', 'password12', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'iloveyou1', 'letmein123', 'welcome123', 'admin123', 'abc12345',
  'monkey123', 'dragon123', 'football1', 'baseball1', 'sunshine1', 'princess1', 'passw0rd',
];

const accountLabel = document.querySelector('#account-label');
const accountButton = document.querySelector('#account-btn');
const coverAccountLabel = document.querySelector('#cover-account-label');
const coverAccountButton = document.querySelector('#cover-account-btn');

const authDialog = document.querySelector('#auth-dialog');
const authForm = document.querySelector('#auth-form');
const authTitle = document.querySelector('#auth-title');
const authLead = document.querySelector('#auth-lead');
const authNameField = document.querySelector('#auth-name-field');
const authName = document.querySelector('#auth-name');
const authEmail = document.querySelector('#auth-email');
const authPassword = document.querySelector('#auth-password');
const authPasswordHint = document.querySelector('#auth-password-hint');
const authShow = document.querySelector('#auth-show');
const authStatus = document.querySelector('#auth-status');
const authSubmit = document.querySelector('#auth-submit');
const authTabs = document.querySelectorAll('[data-auth-mode]');

let authMode = 'signin';

function cleanName(value) {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function nameProblem(name) {
  if (!name) return 'Please enter your name.';
  if (name.length < 2 || name.length > 40) return 'Your name should be 2 to 40 letters long.';
  if (!NAME_PATTERN.test(name) || /[' -]{2}/.test(name)) {
    return 'Use letters only in your name. Spaces, hyphens and apostrophes are fine.';
  }
  return '';
}

function emailProblem(email) {
  if (!email) return 'Please enter your email.';
  const localPart = email.split('@')[0];
  if (email.length > 254 || localPart.length > 64 || !EMAIL_PATTERN.test(email)) {
    return "That doesn't look like a real email. It should look like name@example.com.";
  }
  return '';
}

function passwordProblem(password, email) {
  if (password.length < 8) return 'Your password needs at least 8 characters.';
  if (password.length > 128) return 'Your password can be at most 128 characters.';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'Your password needs at least one letter and one number.';
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) return 'That password is too common. Try something harder to guess.';

  const localPart = email.split('@')[0];
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    return "Your password shouldn't contain your email name.";
  }
  return '';
}

function showAuthProblem(field, message) {
  setMessage(authStatus, message, true);
  field.setAttribute('aria-invalid', 'true');
  field.focus();
}

function clearAuthProblems() {
  setMessage(authStatus, '');
  [authName, authEmail, authPassword].forEach((field) => field.removeAttribute('aria-invalid'));
}

function readUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY));
    return Array.isArray(users) ? users : [];
  } catch (error) {
    return [];
  }
}

function writeSession(user) {
  try {
    const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, expires }));
  } catch (error) {
    return;
  }
}

function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    let session = null;
    try {
      session = JSON.parse(raw);
    } catch (error) {
      session = null;
    }

    const isCurrent = session && typeof session === 'object';
    if (isCurrent && !(session.expires > Date.now())) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const id = isCurrent ? session.id : raw;
    return readUsers().find((user) => user.id === id) || null;
  } catch (error) {
    return null;
  }
}

function readAttempts() {
  try {
    const saved = JSON.parse(localStorage.getItem(ATTEMPTS_KEY));
    return { failures: Number(saved.failures) || 0, until: Number(saved.until) || 0 };
  } catch (error) {
    return { failures: 0, until: 0 };
  }
}

function lockSecondsLeft() {
  return Math.max(0, Math.ceil((readAttempts().until - Date.now()) / 1000));
}

function recordFailure() {
  const attempts = readAttempts();
  attempts.failures += 1;
  if (attempts.failures >= MAX_FAILED_ATTEMPTS) {
    const seconds = Math.min(MAX_LOCK_SECONDS, 30 * 2 ** (attempts.failures - MAX_FAILED_ATTEMPTS));
    attempts.until = Date.now() + seconds * 1000;
  }
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch (error) {
    return;
  }
}

function clearFailures() {
  try {
    localStorage.removeItem(ATTEMPTS_KEY);
  } catch (error) {
    return;
  }
}

function describeWait(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

function safeEqual(first, second) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}

async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('Signing in needs a secure page. Open the journal from a local server (localhost) or https.');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64ToBytes(salt), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function newSalt() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

function saveUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (error) {
    throw new Error("Your browser is blocking storage, so an account can't be made.");
  }
}

async function createAccount(name, email, password) {
  const users = readUsers();
  if (users.some((user) => user.email === email)) {
    throw new Error('That email already has an account. Try signing in instead.');
  }

  const salt = newSalt();
  const hash = await hashPassword(password, salt);
  const user = { id: newId(), name, email, salt, hash, iterations: PBKDF2_ITERATIONS };
  saveUsers([...users, user]);
  return user;
}

async function verifyAccount(email, password) {
  const users = readUsers();
  const user = users.find((entry) => entry.email === email);
  const iterations = user ? user.iterations || OLD_PBKDF2_ITERATIONS : PBKDF2_ITERATIONS;
  const hash = await hashPassword(password, user ? user.salt : DUMMY_SALT, iterations);

  if (!user || !safeEqual(hash, user.hash)) {
    recordFailure();
    throw new Error("That email and password don't match.");
  }
  clearFailures();

  if (iterations < PBKDF2_ITERATIONS) {
    const salt = newSalt();
    user.salt = salt;
    user.hash = await hashPassword(password, salt);
    user.iterations = PBKDF2_ITERATIONS;
    try {
      saveUsers(users);
    } catch (error) {
      return user;
    }
  }
  return user;
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignUp = mode === 'signup';

  authTabs.forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.authMode === mode)));
  authNameField.hidden = !isSignUp;
  authPasswordHint.hidden = !isSignUp;
  authName.required = isSignUp;
  authTitle.textContent = isSignUp ? 'Make an account' : 'Welcome back!';
  authLead.textContent = isSignUp ? 'Create an account so your pages are saved.' : 'Sign in to see and save your pages.';
  authSubmit.textContent = isSignUp ? 'Sign up' : 'Sign in';
  authPassword.autocomplete = isSignUp ? 'new-password' : 'current-password';
  authPassword.placeholder = isSignUp ? 'At least 8 characters' : 'Your password';
  clearAuthProblems();
}

function openAuth(mode = 'signin') {
  authForm.reset();
  authPassword.type = 'password';
  setAuthMode(mode);
  authDialog.showModal();
}

authTabs.forEach((tab) => tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode)));
authShow.addEventListener('change', () => {
  authPassword.type = authShow.checked ? 'text' : 'password';
});
[authName, authEmail, authPassword].forEach((field) => {
  field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
});
document.querySelector('#auth-close').addEventListener('click', () => authDialog.close());
document.querySelector('#auth-guest').addEventListener('click', () => authDialog.close());
authDialog.addEventListener('click', (event) => {
  if (event.target === authDialog) authDialog.close();
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAuthProblems();

  const isSignUp = authMode === 'signup';
  const name = cleanName(authName.value);
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value;

  const problem = [
    isSignUp ? [authName, nameProblem(name)] : null,
    [authEmail, emailProblem(email)],
    [authPassword, isSignUp ? passwordProblem(password, email) : password ? '' : 'Please enter your password.'],
  ].filter(Boolean).find(([, message]) => message);

  if (problem) {
    showAuthProblem(...problem);
    return;
  }

  const waitSeconds = isSignUp ? 0 : lockSecondsLeft();
  if (waitSeconds > 0) {
    setMessage(authStatus, `Too many tries. Please wait ${describeWait(waitSeconds)} and try again.`, true);
    return;
  }

  authSubmit.disabled = true;
  try {
    const user = isSignUp ? await createAccount(name, email, password) : await verifyAccount(email, password);
    authForm.reset();
    authDialog.close();
    await startAccountSession(user, isSignUp);
  } catch (error) {
    const left = lockSecondsLeft();
    const message = left > 0
      ? `Too many tries. Please wait ${describeWait(left)} and try again.`
      : error.message || 'Something went wrong. Please try again.';
    setMessage(authStatus, message, true);
  } finally {
    authSubmit.disabled = false;
  }
});

function pagesHaveContent(list) {
  return list.length > 1 || list.some((page) => page.layout && (
    page.text || page.text2 || page.photo || page.mood || page.items.length > 0 ||
    Object.values(page.week).some(Boolean) || page.todos.length > 1 || page.todos[0].done
  ));
}

function adoptLegacyJournal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.pages) || saved.pages.length === 0) return false;
    pages = saved.pages.map(normalizePage);
    currentIndex = clamp(Number(saved.currentIndex) || 0, 0, pages.length - 1);
    return true;
  } catch (error) {
    return false;
  }
}

async function startAccountSession(user, isNewAccount) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveJournal();
  }

  const guestPages = pages;
  const guestIndex = currentIndex;
  const guestHasContent = pagesHaveContent(guestPages);
  let adoptedLegacy = false;
  liftNeedle();
  selectItem(null);

  currentUser = user;
  savedPhotos.clear();
  writeSession(user);

  const hadSavedJournal = loadJournal();

  if (isNewAccount) {
    if (guestHasContent) {
      pages = guestPages;
      currentIndex = guestIndex;
    } else if (readUsers().length === 1) {
      adoptedLegacy = adoptLegacyJournal();
    }
  } else if (guestHasContent && window.confirm('Add the pages you wrote as a guest to your saved journal?')) {
    pages = hadSavedJournal ? [...pages, ...guestPages] : guestPages;
    if (!hadSavedJournal) currentIndex = guestIndex;
  }

  photosLoaded = loadPhotos().catch(() => {});
  renderPage();
  syncMusicToPage();
  updateAccountUI();
  refreshWeatherUI();
  saveJournal();

  if (adoptedLegacy) {
    try {
      writeLocal();
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Storage is unavailable, so there is nothing to remove.
    }
  }

  setMessage(appStatus, isNewAccount
    ? `Welcome, ${user.name}! Your pages will be saved from now on.`
    : `Welcome back, ${user.name}!`);
  await photosLoaded;
  promptLayoutIfNeeded();
}

function signOut() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveJournal();
  }
  liftNeedle();
  selectItem(null);

  currentUser = null;
  savedPhotos.clear();
  photosLoaded = Promise.resolve();
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    // Storage is unavailable, so there is nothing to clear. Start with a fresh page.
  }

  pages = [createPage()];
  currentIndex = 0;
  renderPage();
  updateAccountUI();
  setMessage(appStatus, "You're signed out. Sign in again to get your saved pages back.");
}

function updateAccountUI() {
  const signedIn = Boolean(currentUser);
  const label = signedIn ? `Hi, ${currentUser.name}! Your pages are saved.` : "Guest: pages aren't saved";

  accountLabel.textContent = label;
  accountLabel.classList.toggle('is-signed-in', signedIn);
  coverAccountLabel.textContent = signedIn ? label : "Not signed in: pages won't be saved";
  accountButton.textContent = signedIn ? 'Sign out' : 'Sign in';
  coverAccountButton.textContent = signedIn ? 'Sign out' : 'Sign in or sign up';
}

[accountButton, coverAccountButton].forEach((button) => {
  button.addEventListener('click', () => (currentUser ? signOut() : openAuth('signin')));
});

const LOGO_IMAGE = '';
const logoButton = document.querySelector('#logo-btn');

function applyLogo() {
  if (!LOGO_IMAGE) return;

  const image = new Image();
  image.alt = '';
  image.onload = () => {
    logoButton.querySelector('.logo__mark').replaceChildren(image);
    logoButton.classList.add('logo--custom');
  };
  image.src = LOGO_IMAGE;
}

logoButton.addEventListener('click', closeJournal);

function showTodayOnCover() {
  const today = todayISO();
  coverDate.dateTime = today;
  coverDate.textContent = parseISODate(today).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

currentUser = restoreSession();
loadJournal();
photosLoaded = currentUser ? loadPhotos().catch(() => {}) : Promise.resolve();
buildSongList();
renderPage();
showTodayOnCover();
updateStickerArrows();
applyTheme(document.documentElement.dataset.theme);
updateAccountUI();
applyLogo();
initLocation();