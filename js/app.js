(function () {
  "use strict";

  const CFG = window.EV3C_CONFIG || { languages: [] };
  const langs = CFG.languages || [];
  const DISLIKE_PREFIX = "ev3c_disliked:";
  const PLAYED_PREFIX = "ev3c_played:";
  const DISCOVER_KEY = "__discover__";
  const NOVEDADES_KEY = "__novedades__";
  const SNAPSHOT_KEY = "ev3c_snapshot";
  const PLAYED_RESET_RATIO = CFG.playedResetRatio ?? 0.9;
  const MAX_DURATION = CFG.maxDurationSeconds ?? 600;

  const GLOWS = {
    ALL: "linear-gradient(100deg, #00d4ff, #8b3bff 55%, #ff2bb4)",
    ENG: "linear-gradient(100deg, #00d4ff, #2a7bff)",
    ESP: "linear-gradient(100deg, #ff2bb4, #ff7a18)",
    CAT: "linear-gradient(100deg, #ffd23f, #ff2bb4)",
    FRA: "linear-gradient(100deg, #8b3bff, #00d4ff)",
    DISCOVER: "linear-gradient(100deg, #00ffcc, #8b3bff 45%, #ff2bb4)",
    FIRE: "linear-gradient(100deg, #ff7a18, #ff2bb4 55%, #ffd23f)",
    NEW: "linear-gradient(100deg, #ffd23f, #ff7a18 45%, #ff2bb4)",
    ART: "linear-gradient(100deg, #ffd23f, #00d4ff 50%, #8b3bff)"
  };

  const $ = (sel) => document.querySelector(sel);

  const els = {
    tabs: $("#langTabs"),
    placeholder: $("#playerPlaceholder"),
    placeholderText: $("#placeholderText"),
    glow: $("#playerGlow"),
    flag: $("#playerFlag"),
    label: $("#playerLabel"),
    desc: $("#playerDesc"),
    openBtn: $("#openPlaylist"),
    likeBtn: $("#likeBtn"),
    dislikeBtn: $("#dislikeBtn"),
    likeModal: $("#likeModal"),
    likeModalBox: $(".like-modal-box"),
    likeModalVideo: $("#likeModalVideo"),
    likePlaylistList: $("#likePlaylistList"),
    likeConfirmBtn: $("#likeConfirmBtn"),
    discoverLoader: $("#discoverLoader"),
    footerLangs: $("#footerLangs"),
    year: $("#year"),
    fileWarn: $("#fileWarn"),
    castTvBtn: $("#castTvBtn"),
    playerTvShield: $("#playerTvShield"),
    artistsPanel: $("#artistsPanel"),
    artistsList: $("#artistsList")
  };

  const isFileProtocol = window.location.protocol === "file:";

  const DISCOVER_STOPWORDS = new Set([
    "the", "and", "for", "with", "official", "video", "audio", "lyrics", "live",
    "remix", "cover", "music", "feat", "ft", "hd", "4k", "full", "album",
    "de", "la", "el", "en", "y", "a", "un", "una", "los", "las", "del", "que",
    "les", "des", "une", "pour", "dans", "sur", "avec", "par"
  ]);
  const DISCOVER_QUERIES = {
    ALL: ["new music 2026", "latest songs", "music discovery", "indie music new"],
    ENG: ["new english songs 2026", "uk new music releases", "indie rock new"],
    ESP: ["música nueva 2026", "canciones nuevas", "nueva música española"],
    CAT: ["música nova catalunya", "cançons noves", "música catalana nova"],
    FRA: ["nouvelle musique française", "nouveautés musique 2026", "chanson nouveauté"]
  };
  const INVIDIOUS_FALLBACK = [
    "https://inv.nadeko.net",
    "https://invidious.tiekoetter.com",
    "https://invidious.f5.si",
    "https://inv.zoomerville.com"
  ];
  const PIPED_FALLBACK = ["https://api.piped.private.coffee"];

  let player = null;
  let apiReady = false;
  let current = 0;
  let lastContextIndex = 0;
  let userStarted = false;
  let shufflePending = false;
  let shouldAutoplay = false;
  let discoverLoading = false;
  let discoverWaitingPlay = false;
  let discoverLoaderTimer = null;
  let discoverTargetVideoId = null;
  const tooLongSkipped = new Set();
  let pendingDiscoverAutoplay = false;
  let lastTrackedVideoId = null;
  let excludedIds = new Set(window.EV3C_EXCLUDED || []);
  let invidiousInstances = [...INVIDIOUS_FALLBACK];
  let pipedInstances = [...PIPED_FALLBACK];
  let playlistsRefreshPromise = null;
  const playlistVideoIds = new Map();
  const playlistVideosData = new Map();
  let novedadesPool = [];
  const langDesc = langs.map((l) => l.desc);

  function isMixMode(lang) {
    return lang && lang.mode === "youtube-mix";
  }

  function isNovedadesMode(lang) {
    return lang && lang.mode === "novedades";
  }

  function isFireplaceMode(lang) {
    return lang && lang.mode === "fireplace";
  }

  function isArtistsMode(lang) {
    return lang && lang.mode === "artists";
  }

  function isSpecialMode(lang) {
    return isMixMode(lang) || isNovedadesMode(lang) || isFireplaceMode(lang) || isArtistsMode(lang);
  }

  function storageKey(lang) {
    if (isMixMode(lang)) return DISCOVER_KEY;
    if (isNovedadesMode(lang)) return NOVEDADES_KEY;
    if (isArtistsMode(lang)) return "__artists__";
    return lang.playlistId;
  }

  function mergeIntoExcluded(ids) {
    ids.forEach((id) => {
      if (id && id.length === 11) excludedIds.add(id);
    });
  }

  function mergeCurrentPlaylistIntoExcluded() {
    mergeIntoExcluded(getPlaylistList());
  }

  function isVideoInEv3cLists(videoId) {
    if (!videoId) return false;
    for (const ids of playlistVideoIds.values()) {
      if (ids.includes(videoId)) return true;
    }
    return excludedIds.has(videoId);
  }

  function isInMyLists(videoId) {
    return isVideoInEv3cLists(videoId);
  }

  async function loadInvidiousInstances() {
    try {
      const r = await fetch("https://api.invidious.io/instances.json?sort_by=health");
      const data = await r.json();
      const uris = [];
      for (const item of data) {
        if (typeof item === "string") uris.push(item);
        else if (Array.isArray(item) && item[0]) uris.push(String(item[0]));
        else if (item?.uri && item?.api) uris.push(item.uri);
      }
      if (uris.length) {
        invidiousInstances = [...new Set([...uris.slice(0, 15), ...INVIDIOUS_FALLBACK])];
      }
    } catch (e) { /* fallback */ }
  }

  async function invidiousFetch(path) {
    for (const base of invidiousInstances) {
      try {
        const r = await fetch(base.replace(/\/$/, "") + path);
        if (r.ok) return r.json();
      } catch (e) { /* siguiente instancia */ }
    }
    throw new Error("Invidious no disponible");
  }

  async function loadPipedInstances() {
    try {
      const r = await fetch("https://piped-instances.kavin.rocks/");
      const data = await r.json();
      const apis = [];
      for (const item of data) {
        if (item?.api_url && !item.censored) apis.push(item.api_url);
      }
      if (apis.length) {
        pipedInstances = [...new Set([...apis.slice(0, 12), ...PIPED_FALLBACK])];
      }
    } catch (e) { /* fallback */ }
  }

  async function pipedFetch(path) {
    for (const base of pipedInstances) {
      try {
        const r = await fetch(base.replace(/\/$/, "") + path);
        if (r.ok) return r.json();
      } catch (e) { /* siguiente instancia */ }
    }
    throw new Error("Piped no disponible");
  }

  function extractVideoIdFromUrl(url) {
    if (!url) return null;
    const m = String(url).match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function normalizePipedItem(item) {
    const videoId = extractVideoIdFromUrl(item?.url);
    if (!videoId) return null;
    const uploaded = item.uploaded;
    const published = uploaded > 1e12 ? Math.floor(uploaded / 1000) : (uploaded || 0);
    return {
      videoId,
      title: item.title || "",
      author: item.uploaderName || "",
      lengthSeconds: item.duration > 0 ? item.duration : null,
      published,
      viewCount: item.views || item.viewCount || 0
    };
  }

  async function discoverSearch(query) {
    try {
      const results = await invidiousFetch(
        `/api/v1/search?q=${encodeURIComponent(query)}&type=video`
      );
      if (Array.isArray(results) && results.length) return results;
    } catch (e) { /* fallback a Piped */ }

    try {
      const data = await pipedFetch(
        `/search?q=${encodeURIComponent(query)}&filter=videos`
      );
      const items = data?.items || [];
      return items.map(normalizePipedItem).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function applyPlaylistCount(lang, count) {
    if (!count || count <= 0) return;
    lang.videoCount = count;
    const idx = langs.indexOf(lang);
    if (idx < 0) return;
    let updated = langDesc[idx] || lang.desc;
    if (/\d+\s+vídeos?/gi.test(updated)) {
      updated = updated.replace(/\d+\s+vídeos?/gi, `${count} vídeos`);
    } else {
      const parts = updated.split(" · ");
      if (parts.length >= 2) parts.splice(1, 0, `${count} vídeos`);
      else parts.push(`${count} vídeos`);
      updated = parts.join(" · ");
    }
    langDesc[idx] = updated;
    lang.desc = updated;
    if (idx === current && !isSpecialMode(lang) && els.desc) {
      els.desc.textContent = updated;
    }
  }

  async function fetchAllPlaylistIds(playlistId, onProgress) {
    const seen = new Set();
    const allIds = [];
    const allMeta = [];
    let page = 1;
    let totalFromApi = null;
    const MAX_PAGES = 30;

    while (page <= MAX_PAGES) {
      let data;
      try {
        data = await invidiousFetch(`/api/v1/playlists/${playlistId}?page=${page}`);
      } catch (e) {
        break;
      }
      if (totalFromApi === null && data.videoCount > 0) totalFromApi = data.videoCount;
      const batch = [];
      for (const v of data.videos || []) {
        const id = v.videoId;
        if (!id || id.length !== 11 || seen.has(id)) continue;
        seen.add(id);
        batch.push(id);
        allMeta.push({
          videoId: id,
          title: v.title || "",
          author: v.author || "",
          lengthSeconds: v.lengthSeconds
        });
      }
      if (batch.length === 0) break;
      allIds.push(...batch);
      playlistVideosData.set(playlistId, allMeta.slice());
      if (onProgress) onProgress(allIds.slice());
      if (totalFromApi !== null && allIds.length >= totalFromApi) break;
      page++;
    }
    const total = Math.max(totalFromApi || 0, allIds.length);
    return { ids: allIds, total, meta: allMeta };
  }

  function syncLangFromYouTube(lang) {
    if (!player || !lang?.playlistId || isSpecialMode(lang)) return false;
    try {
      const list = player.getPlaylist?.();
      if (!list?.length) return false;
      playlistVideoIds.set(lang.playlistId, [...list]);
      mergeIntoExcluded(list);
      applyPlaylistCount(lang, list.length);
      return true;
    } catch (e) {
      return false;
    }
  }

  function showRefreshingStatus() {
    const lang = langs[current];
    if (!lang || isSpecialMode(lang) || !els.desc) return;
    els.desc.textContent = `Actualizando ${lang.name}…`;
  }

  async function refreshPlaylistsFromInvidious(options = {}) {
    if (!options.silent) showRefreshingStatus();
    await loadInvidiousInstances();
    const playlistLangs = langs.filter((l) => l.playlistId && !isSpecialMode(l));
    let refreshedAny = false;
    await Promise.all(playlistLangs.map(async (lang) => {
      try {
        const { ids, total } = await fetchAllPlaylistIds(lang.playlistId, (partialIds) => {
          playlistVideoIds.set(lang.playlistId, partialIds);
          mergeIntoExcluded(partialIds);
          applyPlaylistCount(lang, partialIds.length);
        });
        if (ids.length > 0) {
          playlistVideoIds.set(lang.playlistId, ids);
          mergeIntoExcluded(ids);
          applyPlaylistCount(lang, total);
          refreshedAny = true;
        }
      } catch (e) { /* continuar con config.js */ }
    }));
    if (refreshedAny) computeNovedades();
    if (!options.silent) refreshCurrentDesc();
  }

  function savePlaylistSnapshot() {
    if (playlistVideoIds.size === 0) return;
    const snap = { updatedAt: Date.now() };
    for (const [plId, ids] of playlistVideoIds) {
      snap[plId] = ids;
    }
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    } catch (e) { /* quota */ }
  }

  function computeNovedades() {
    const currentAll = new Set();
    for (const ids of playlistVideoIds.values()) {
      ids.forEach((id) => currentAll.add(id));
    }

    let raw = null;
    try {
      raw = localStorage.getItem(SNAPSHOT_KEY);
    } catch (e) { /* ignore */ }

    if (!raw) {
      novedadesPool = [];
      savePlaylistSnapshot();
      updateNovedadesDesc();
      updateNovedadesTabBadge();
      return;
    }

    let last;
    try {
      last = JSON.parse(raw);
    } catch (e) {
      novedadesPool = [];
      updateNovedadesDesc();
      updateNovedadesTabBadge();
      return;
    }

    const lastAll = new Set();
    Object.entries(last).forEach(([key, arr]) => {
      if (key === "updatedAt" || !Array.isArray(arr)) return;
      arr.forEach((id) => lastAll.add(id));
    });

    novedadesPool = [...currentAll].filter((id) => !lastAll.has(id));
    updateNovedadesDesc();
    updateNovedadesTabBadge();
  }

  function updateNovedadesDesc() {
    const n = novedadesPool.length;
    const text = n === 0
      ? "Novedades · no hay canciones nuevas desde tu última visita"
      : `Novedades · ${n} canción${n === 1 ? "" : "es"} nueva${n === 1 ? "" : "s"} desde tu última visita`;
    const idx = langs.findIndex((l) => isNovedadesMode(l));
    if (idx >= 0) {
      langDesc[idx] = text;
      langs[idx].desc = text;
    }
    if (isNovedadesMode(langs[current])) {
      els.desc.textContent = text;
    }
  }

  function updateNovedadesTabBadge() {
    const idx = langs.findIndex((l) => isNovedadesMode(l));
    if (idx < 0 || !els.tabs?.children[idx]) return;
    const btn = els.tabs.children[idx];
    const count = novedadesPool.length;
    btn.classList.toggle("novedades-has", count > 0);
    let badge = btn.querySelector(".nov-badge");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "nov-badge";
        btn.appendChild(badge);
      }
      badge.textContent = count > 99 ? "99+" : String(count);
    } else if (badge) {
      badge.remove();
    }
  }

  function maybeResetNovedadesPlayed(lang) {
    const key = storageKey(lang);
    const disliked = getDisliked(lang);
    const playable = novedadesPool.filter((id) => !disliked.has(id) && !tooLongSkipped.has(id));
    if (!playable.length) return getPlayed(key);

    const played = getPlayed(key);
    const playedCount = playable.filter((id) => played.has(id)).length;
    if (playedCount / playable.length >= PLAYED_RESET_RATIO) {
      resetPlayed(key);
      return new Set();
    }
    return played;
  }

  function pickNextNovedadesVideo(lang, excludeId) {
    const disliked = getDisliked(lang);
    const played = maybeResetNovedadesPlayed(lang);
    const pool = novedadesPool.filter(
      (id) => !disliked.has(id) && !tooLongSkipped.has(id) && id !== excludeId
    );
    const unplayed = pool.filter((id) => !played.has(id));
    const pickFrom = unplayed.length ? unplayed : pool;
    if (!pickFrom.length) return null;
    return pickFrom[Math.floor(Math.random() * pickFrom.length)];
  }

  async function playNovedadesVideo(autoplay) {
    const lang = langs[current];
    if (!player || !apiReady || !isNovedadesMode(lang)) return false;

    await ensurePlaylistsReady();

    const videoId = pickNextNovedadesVideo(lang, getCurrentVideoId());
    if (!isNovedadesMode(langs[current])) return false;

    if (!videoId) {
      updateNovedadesDesc();
      return false;
    }

    shufflePending = false;
    lastTrackedVideoId = null;
    player.loadVideoById(videoId);
    if (autoplay) player.playVideo();
    updateNovedadesDesc();
    return true;
  }

  async function ensurePlaylistsReady() {
    if (!playlistsRefreshPromise) {
      playlistsRefreshPromise = refreshPlaylistsFromInvidious();
    }
    try {
      await playlistsRefreshPromise;
    } catch (e) { /* fallback a config.js y EV3C_EXCLUDED */ }
  }

  function refreshCurrentDesc() {
    const lang = langs[current];
    if (!lang || isSpecialMode(lang)) return;
    els.desc.textContent = langDesc[current] || lang.desc;
  }

  function getDiscoverContextCode() {
    const ctx = langs[lastContextIndex];
    return !ctx || ctx.code === "ALL" || isSpecialMode(ctx) ? "ALL" : ctx.code;
  }

  function getDiscoverContextPlaylistIds() {
    const code = getDiscoverContextCode();
    const all = getAllLangConfig();
    if (code === "ALL") {
      return langs.filter((l) => l.playlistId && !isSpecialMode(l)).map((l) => l.playlistId);
    }
    const lang = langs.find((l) => l.code === code);
    return [lang?.playlistId, all?.playlistId].filter(Boolean);
  }

  function extractTitleWords(title) {
    return (title || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !DISCOVER_STOPWORDS.has(w));
  }

  function pickDiscoverSeeds(count = 6) {
    const plIds = getDiscoverContextPlaylistIds();
    const pool = [];
    plIds.forEach((plId) => {
      (playlistVideosData.get(plId) || []).forEach((v) => pool.push(v));
    });
    if (!pool.length) return [];
    return pool.sort(() => Math.random() - 0.5).slice(0, count);
  }

  function buildTasteSearchQueries(seeds) {
    const year = new Date().getFullYear();
    const tasteQueries = [];
    const newQueries = [];

    seeds.forEach((seed) => {
      if (seed.author) {
        tasteQueries.push(seed.author);
        tasteQueries.push(`${seed.author} official`);
        tasteQueries.push(`${seed.author} music`);
        newQueries.push(`${seed.author} new ${year}`);
        newQueries.push(`${seed.author} latest single`);
      }
      const words = extractTitleWords(seed.title);
      if (words.length >= 2) tasteQueries.push(words.slice(0, 3).join(" "));
      if (words[0]) tasteQueries.push(`${words[0]} similar artists`);
    });

    getDiscoverQueries().forEach((q) => newQueries.push(q));

    const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
    return [...shuffle(tasteQueries), ...shuffle(newQueries)];
  }

  function getRecencyBonus(item) {
    const pub = item.published;
    if (!pub || pub <= 0) return 0;
    const ageDays = (Date.now() / 1000 - pub) / 86400;
    if (ageDays <= 90) return 2;
    if (ageDays <= 180) return 1;
    if (ageDays <= 365) return 1;
    return 0;
  }

  function scoreDiscoverTaste(item, seeds) {
    let score = 0;
    const author = (item.author || "").toLowerCase();
    const title = (item.title || "").toLowerCase();

    seeds.forEach((seed) => {
      const seedAuthor = (seed.author || "").toLowerCase();
      if (seedAuthor && author === seedAuthor) score += 10;
      else if (seedAuthor && author.includes(seedAuthor.split(" ")[0])) score += 5;

      extractTitleWords(seed.title).forEach((w) => {
        if (title.includes(w)) score += 2;
      });
    });
    return score;
  }

  function pickFromScoredPool(pool, played, currentId) {
    const unplayed = pool.filter(
      (item) => !played.has(item.videoId) && item.videoId !== currentId
    );
    const candidates = unplayed.length ? unplayed : pool.filter((item) => item.videoId !== currentId);
    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      if (b.taste !== a.taste) return b.taste - a.taste;
      return b.recency - a.recency;
    });
    const topTaste = candidates[0].taste;
    const tier = candidates.filter((c) => c.taste >= Math.max(0, topTaste - 2));
    const pickFrom = tier.length ? tier : candidates;
    return pickFrom[Math.floor(Math.random() * pickFrom.length)].videoId;
  }

  function getDiscoverQueries() {
    const code = getDiscoverContextCode();
    const qAll = DISCOVER_QUERIES.ALL;
    if (code === "ALL") return [...qAll];
    return [...(DISCOVER_QUERIES[code] || []), ...qAll];
  }

  function isDurationAllowed(seconds) {
    if (seconds == null || seconds <= 0) return true;
    return seconds <= MAX_DURATION;
  }

  function isDiscoverCandidate(item, lang) {
    const videoId = typeof item === "string" ? item : item?.videoId;
    if (!videoId || videoId.length !== 11) return false;
    if (isVideoInEv3cLists(videoId)) return false;
    if (getDisliked(lang).has(videoId)) return false;
    if (typeof item === "object" && item.lengthSeconds != null && !isDurationAllowed(item.lengthSeconds)) {
      return false;
    }
    return true;
  }

  function addDiscoverCandidate(scored, item, seeds, lang, minTaste) {
    if (!isDiscoverCandidate(item, lang)) return;
    const taste = seeds.length ? scoreDiscoverTaste(item, seeds) : 0;
    if (seeds.length && taste < minTaste) return;
    const recency = getRecencyBonus(item);
    const entry = {
      videoId: item.videoId,
      taste,
      recency,
      score: taste * 10 + recency
    };
    const prev = scored.get(item.videoId);
    if (!prev || entry.score > prev.score) {
      scored.set(item.videoId, entry);
    }
  }

  function getDiscoverPlayed() {
    return getPlayed(DISCOVER_KEY);
  }

  async function findNewDiscoverVideo(lang) {
    const currentId = getCurrentVideoId();
    let played = getDiscoverPlayed();
    const seeds = pickDiscoverSeeds(6);

    await loadPipedInstances();

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) {
        resetPlayed(DISCOVER_KEY);
        played = new Set();
      }

      const scored = new Map();
      const queries = seeds.length
        ? buildTasteSearchQueries(seeds)
        : getDiscoverQueries().sort(() => Math.random() - 0.5);

      const searchPasses = [
        { slice: [0, 14], minTaste: 2 },
        { slice: [14, 28], minTaste: 1 },
        { slice: null, minTaste: 0, extra: getDiscoverQueries() }
      ];

      for (const pass of searchPasses) {
        if (scored.size > 0) break;
        const qList = pass.slice
          ? queries.slice(pass.slice[0], pass.slice[1])
          : [...pass.extra].sort(() => Math.random() - 0.5);
        for (const q of qList) {
          try {
            const list = await discoverSearch(q);
            list.forEach((v) => addDiscoverCandidate(scored, v, seeds, lang, pass.minTaste));
            if (scored.size >= 8) break;
          } catch (e) { /* siguiente búsqueda */ }
        }
      }

      const pick = pickFromScoredPool([...scored.values()], played, currentId);
      if (pick) return pick;
    }
    return null;
  }

  function updateDiscoverDesc() {
    const code = getDiscoverContextCode();
    if (code === "ALL") {
      els.desc.textContent = "Discover · según tu música habitual · fuera de tus listas";
      return;
    }
    const ctx = langs.find((l) => l.code === code);
    els.desc.textContent = `Discover · según tu música habitual · fuera de ${ctx?.name || code}`;
  }

  function showDiscoverLoader() {
    if (!els.discoverLoader) return;
    els.discoverLoader.classList.remove("hidden");
    discoverWaitingPlay = true;
    clearTimeout(discoverLoaderTimer);
    discoverLoaderTimer = setTimeout(hideDiscoverLoader, 25000);
  }

  function hideDiscoverLoader() {
    if (!els.discoverLoader) return;
    els.discoverLoader.classList.add("hidden");
    discoverWaitingPlay = false;
    discoverTargetVideoId = null;
    clearTimeout(discoverLoaderTimer);
    discoverLoaderTimer = null;
    if (isMixMode(langs[current])) updateDiscoverDesc();
  }

  async function playDiscoverVideo(autoplay) {
    const lang = langs[current];
    if (!player || !apiReady || !isMixMode(lang)) return false;
    if (discoverLoading) return false;

    discoverLoading = true;
    showDiscoverLoader();
    els.desc.textContent = "Discover · buscando canciones nuevas para ti…";

    try {
      await ensurePlaylistsReady();

      const videoId = await findNewDiscoverVideo(lang);
      if (!isMixMode(langs[current])) {
        hideDiscoverLoader();
        return false;
      }
      if (!videoId) {
        hideDiscoverLoader();
        els.desc.textContent = "Discover · no se encontró canción. Pulsa DISCOVER de nuevo.";
        return false;
      }

      shufflePending = false;
      lastTrackedVideoId = null;
      discoverTargetVideoId = videoId;
      player.loadVideoById(videoId);
      if (autoplay) player.playVideo();
      return true;
    } catch (e) {
      hideDiscoverLoader();
      return false;
    } finally {
      discoverLoading = false;
    }
  }

  let artistSort = "born";
  let currentArtist = null;
  let artistQueue = [];
  let artistQueueIndex = 0;

  function artistYear(value) {
    if (!value) return 0;
    const y = parseInt(String(value).slice(0, 4), 10);
    return Number.isFinite(y) ? y : 0;
  }

  function artistYearsLabel(artist) {
    if (artist.died) return `${artist.born}–${artist.died}`;
    return `${artist.born}–`;
  }

  function sortedArtists() {
    const list = [...(window.EV3C_ARTISTS || [])];
    if (artistSort === "name") {
      return list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    }
    if (artistSort === "died") {
      return list.sort((a, b) => {
        const ad = artistYear(a.died);
        const bd = artistYear(b.died);
        if (ad && bd && ad !== bd) return ad - bd;
        if (ad && !bd) return -1;
        if (!ad && bd) return 1;
        return artistYear(a.born) - artistYear(b.born);
      });
    }
    return list.sort((a, b) => {
      const d = artistYear(a.born) - artistYear(b.born);
      return d !== 0 ? d : a.name.localeCompare(b.name, "es");
    });
  }

  function hideArtistsPanel() {
    if (els.artistsPanel) els.artistsPanel.classList.add("hidden");
  }

  function showArtistsPanel() {
    if (!els.artistsPanel) return;
    els.artistsPanel.classList.remove("hidden");
    renderArtistsList();
  }

  function renderArtistsList() {
    if (!els.artistsList) return;
    els.artistsList.innerHTML = "";
    sortedArtists().forEach((artist) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "artist-card";
      const kind = artist.type === "group" ? "Grupo" : "Cantante";
      btn.innerHTML =
        `<div class="ac-type">${kind}</div>` +
        `<div class="ac-name">${artist.name}</div>` +
        `<div class="ac-meta">${artistYearsLabel(artist)}</div>`;
      btn.addEventListener("click", () => playArtistPopular(artist, true));
      els.artistsList.appendChild(btn);
    });
  }

  function getViewCount(item) {
    return item.viewCount || item.views || item.viewCountText || 0;
  }

  async function findArtistPopularVideos(artist) {
    await loadPipedInstances();
    const queries = [
      `${artist.q || artist.name} official music video`,
      `${artist.name} official`,
      `${artist.name} greatest hits`
    ];
    const scored = new Map();
    for (const q of queries) {
      try {
        const list = await discoverSearch(q);
        list.forEach((v) => {
          const id = v.videoId;
          if (!id || id.length !== 11) return;
          if (v.lengthSeconds != null && !isDurationAllowed(v.lengthSeconds)) return;
          const views = Number(getViewCount(v)) || 0;
          const prev = scored.get(id);
          if (!prev || views > prev.views) {
            scored.set(id, { videoId: id, views, title: v.title || "" });
          }
        });
        if (scored.size >= 8) break;
      } catch (e) { /* siguiente */ }
    }
    return [...scored.values()].sort((a, b) => b.views - a.views).slice(0, 12);
  }

  async function playArtistPopular(artist, autoplay) {
    if (!player || !apiReady) return false;
    currentArtist = artist;
    hideArtistsPanel();
    showDiscoverLoader();
    els.desc.textContent = `${artist.name} · buscando vídeos más populares…`;

    try {
      const videos = await findArtistPopularVideos(artist);
      if (!isArtistsMode(langs[current])) {
        hideDiscoverLoader();
        return false;
      }
      if (!videos.length) {
        hideDiscoverLoader();
        showArtistsPanel();
        els.desc.textContent = `${artist.name} · no se encontraron vídeos. Elige otro artista.`;
        return false;
      }
      artistQueue = videos;
      artistQueueIndex = 0;
      shufflePending = false;
      lastTrackedVideoId = null;
      player.loadVideoById(videos[0].videoId);
      if (autoplay) player.playVideo();
      els.desc.textContent = `${artist.name} · éxitos más populares en YouTube`;
      els.openBtn.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(artist.q || artist.name)}`;
      return true;
    } catch (e) {
      hideDiscoverLoader();
      showArtistsPanel();
      return false;
    }
  }

  function playNextArtistVideo() {
    if (!currentArtist || !artistQueue.length) return false;
    artistQueueIndex += 1;
    if (artistQueueIndex >= artistQueue.length) artistQueueIndex = 0;
    const next = artistQueue[artistQueueIndex];
    if (!next) return false;
    lastTrackedVideoId = null;
    player.loadVideoById(next.videoId);
    player.playVideo();
    return true;
  }

  function externalUrl(lang) {
    if (isSpecialMode(lang)) {
      const vid = getCurrentVideoId();
      if (vid) return `https://www.youtube.com/watch?v=${vid}`;
      return searchUrl(lang.searchQuery || "ev3c music");
    }
    if (lang.playlistId) return `https://www.youtube.com/playlist?list=${lang.playlistId}`;
    if (lang.videoId) return `https://www.youtube.com/watch?v=${lang.videoId}`;
    return searchUrl(lang.searchQuery);
  }

  function searchUrl(q) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q || "ev3c music")}`;
  }

  function getStoredSet(prefix, key) {
    if (!key) return new Set();
    try {
      const raw = localStorage.getItem(prefix + key);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function saveStoredSet(prefix, key, set) {
    if (!key) return;
    localStorage.setItem(prefix + key, JSON.stringify([...set]));
  }

  function getDisliked(lang) {
    return getStoredSet(DISLIKE_PREFIX, storageKey(lang));
  }

  function saveDisliked(lang, set) {
    saveStoredSet(DISLIKE_PREFIX, storageKey(lang), set);
  }

  function getPlayed(key) {
    return getStoredSet(PLAYED_PREFIX, key);
  }

  function savePlayed(key, set) {
    saveStoredSet(PLAYED_PREFIX, key, set);
  }

  function resetPlayed(key) {
    localStorage.removeItem(PLAYED_PREFIX + key);
  }

  function getPlaylistList() {
    if (!player) return [];
    try {
      const list = player.getPlaylist && player.getPlaylist();
      return list && list.length ? list : [];
    } catch (e) {
      return [];
    }
  }

  function getPlayableVideoIds(lang) {
    const list = getPlaylistList();
    const disliked = getDisliked(lang);
    if (list.length) {
      return list.filter((id) => !disliked.has(id));
    }
    return [];
  }

  function maybeResetPlayed(lang) {
    const key = storageKey(lang);
    const playable = getPlayableVideoIds(lang);
    if (!playable.length) return getPlayed(key);

    const played = getPlayed(key);
    const playedCount = playable.filter((id) => played.has(id)).length;
    const ratio = playedCount / playable.length;

    if (ratio >= PLAYED_RESET_RATIO) {
      resetPlayed(key);
      return new Set();
    }
    return played;
  }

  function markVideoPlayed(lang, videoId) {
    const key = storageKey(lang);
    if (!videoId || !key) return;

    const played = getPlayed(key);
    if (played.has(videoId)) return;

    played.add(videoId);
    savePlayed(key, played);
    maybeResetPlayed(lang);
  }

  function getCurrentVideoId() {
    if (!player) return null;
    try {
      const data = player.getVideoData();
      return data && data.video_id ? data.video_id : null;
    } catch (e) {
      return null;
    }
  }

  function getPriorityIndices(lang) {
    const list = getPlaylistList();
    if (!list.length) return { preferred: [], fallback: [] };

    const disliked = getDisliked(lang);
    const played = maybeResetPlayed(lang);
    const preferred = [];
    const fallback = [];

    for (let i = 0; i < list.length; i++) {
      if (disliked.has(list[i])) continue;
      if (tooLongSkipped.has(list[i])) continue;
      if (played.has(list[i])) fallback.push(i);
      else preferred.push(i);
    }

    return { preferred, fallback };
  }

  function playNextSmart(lang, autoplay) {
    if (!player || !lang || isSpecialMode(lang)) return false;

    const { preferred, fallback } = getPriorityIndices(lang);
    const pool = preferred.length ? preferred : fallback;

    if (!pool.length) {
      els.desc.textContent = "Todas las canciones están en dislike. Limpia el almacenamiento del navegador.";
      return false;
    }

    lastTrackedVideoId = null;
    const idx = pool[Math.floor(Math.random() * pool.length)];
    player.setShuffle(true);
    player.playVideoAt(idx);
    if (autoplay) player.playVideo();
    return true;
  }

  function randomIndex(lang) {
    const total = lang.videoCount || 50;
    return Math.floor(Math.random() * total);
  }

  function applyRandomStart() {
    if (!player || !shufflePending) return;
    const lang = langs[current];
    if (!lang || isSpecialMode(lang)) return;
    try {
      const list = player.getPlaylist && player.getPlaylist();
      if (list && list.length > 0) {
        syncLangFromYouTube(lang);
        mergeCurrentPlaylistIntoExcluded();
        playNextSmart(lang, shouldAutoplay);
        shufflePending = false;
      }
    } catch (e) { /* la playlist aún no está lista */ }
  }

  function loadRandomPlaylist(lang, autoplay) {
    if (!lang.playlistId) return false;
    shufflePending = true;
    shouldAutoplay = autoplay;
    lastTrackedVideoId = null;

    if (!player || !apiReady) return true;

    player.loadPlaylist({
      listType: "playlist",
      list: lang.playlistId,
      index: randomIndex(lang)
    });
    return true;
  }

  function trackCurrentVideo() {
    const lang = langs[current];
    const videoId = getCurrentVideoId();
    if (!videoId || !lang) return;
    if (!storageKey(lang)) return;
    if (videoId === lastTrackedVideoId) return;

    lastTrackedVideoId = videoId;
    markVideoPlayed(lang, videoId);
  }

  function getVideoDurationSec() {
    if (!player) return -1;
    try {
      const d = player.getDuration();
      return typeof d === "number" && d > 0 ? d : -1;
    } catch (e) {
      return -1;
    }
  }

  function skipTooLongIfNeeded() {
    const lang = langs[current];
    if (!lang || !player || isFireplaceMode(lang)) return;

    const check = (retries) => {
      const duration = getVideoDurationSec();
      if (duration > MAX_DURATION) {
        const videoId = getCurrentVideoId();
        if (videoId) tooLongSkipped.add(videoId);
        lastTrackedVideoId = null;
        if (isMixMode(lang)) playDiscoverVideo(true);
        else if (isNovedadesMode(lang)) playNovedadesVideo(true);
        else if (isArtistsMode(lang)) playNextArtistVideo();
        else playNextSmart(lang, true);
        return;
      }
      if (duration <= 0 && retries > 0) {
        setTimeout(() => check(retries - 1), 300);
      }
    };
    check(6);
  }

  function skipDislikedOnCue() {
    const lang = langs[current];
    if (!lang || !player) return;
    const videoId = getCurrentVideoId();
    if (!videoId) return;

    if (isMixMode(lang)) {
      if (isInMyLists(videoId) || getDisliked(lang).has(videoId)) {
        playDiscoverVideo(true);
      }
      return;
    }

    if (isFireplaceMode(lang)) return;

    if (isArtistsMode(lang)) {
      if (getDisliked(lang).has(videoId)) playNextArtistVideo();
      return;
    }

    if (isNovedadesMode(lang)) {
      if (getDisliked(lang).has(videoId)) {
        playNovedadesVideo(true);
      }
      return;
    }

    if (!getDisliked(lang).has(videoId)) return;
    playNextSmart(lang, true);
  }

  function getAllLangConfig() {
    return langs.find((l) => l.code === "ALL");
  }

  function getLikeableLangs() {
    return langs.filter((l) =>
      ["ENG", "ESP", "CAT", "FRA"].includes(l.code) && l.playlistId
    );
  }

  function getVideoPlaylistMembership(videoId) {
    const membership = new Map();
    langs.filter((l) => l.playlistId && !isSpecialMode(l)).forEach((lang) => {
      const ids = playlistVideoIds.get(lang.playlistId);
      membership.set(
        lang.playlistId,
        ids ? ids.includes(videoId) : excludedIds.has(videoId)
      );
    });
    return membership;
  }

  function isInAllList(videoId) {
    if (!videoId) return false;
    const all = getAllLangConfig();
    if (!all?.playlistId) return false;
    const ids = playlistVideoIds.get(all.playlistId);
    if (ids?.length) return ids.includes(videoId);
    if (window.EV3C_YOUTUBE_LIKE?.isLikedIn(all.playlistId, videoId)) return true;
    return excludedIds.has(videoId);
  }

  function addVideoToPlaylistCache(videoId, playlistIds) {
    playlistIds.forEach((plId) => {
      const ids = playlistVideoIds.get(plId) || [];
      if (!ids.includes(videoId)) playlistVideoIds.set(plId, [...ids, videoId]);
    });
    mergeIntoExcluded([videoId]);
  }

  function renderLikeModalList(videoId, title, membership) {
    const allLang = getAllLangConfig();
    els.likeModalVideo.textContent = title;
    els.likePlaylistList.innerHTML = "";

    if (allLang) {
      const inAll = membership.get(allLang.playlistId);
      const li = document.createElement("li");
      li.className = "like-playlist-item mandatory" + (inAll ? " in-list" : "");
      li.innerHTML =
        `<label tabindex="-1">` +
        `<input type="checkbox" checked disabled data-playlist-id="${allLang.playlistId}" />` +
        `<span class="pl-name">${allLang.flag} ${allLang.name}</span>` +
        `<span class="pl-badge">${inAll ? "ya está" : "siempre"}</span>` +
        `</label>`;
      els.likePlaylistList.appendChild(li);
    }

    const ctx = langs[lastContextIndex];
    const precheck = ctx && ["ENG", "ESP", "CAT", "FRA"].includes(ctx.code) ? ctx.code : null;

    getLikeableLangs().forEach((lang) => {
      const inList = membership.get(lang.playlistId);
      const li = document.createElement("li");
      li.className = "like-playlist-item" + (inList ? " in-list" : "");
      const checked = inList || lang.code === precheck ? " checked" : "";
      const disabled = inList ? " disabled" : "";
      const badge = inList ? `<span class="pl-badge">ya está</span>` : "";
      li.innerHTML =
        `<label tabindex="${inList ? "-1" : "0"}">` +
        `<input type="checkbox" value="${lang.code}" data-playlist-id="${lang.playlistId}"${checked}${disabled} />` +
        `<span class="pl-name">${lang.flag} ${lang.name}</span>` +
        badge +
        `</label>`;
      els.likePlaylistList.appendChild(li);
    });
  }

  function collectPlaylistsToAdd(videoId) {
    const membership = getVideoPlaylistMembership(videoId);
    const allLang = getAllLangConfig();
    const toAdd = [];

    if (allLang?.playlistId && !membership.get(allLang.playlistId)) {
      toAdd.push(allLang.playlistId);
    }

    els.likePlaylistList.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)').forEach((input) => {
      const plId = input.dataset.playlistId;
      if (plId && !membership.get(plId) && !toAdd.includes(plId)) toAdd.push(plId);
    });

    return toAdd;
  }

  let likeModalRefreshId = 0;

  async function openLikeModal() {
    if (!player || !apiReady || !els.likeModal) return;
    const videoId = getCurrentVideoId();
    if (!videoId) return;

    pendingLikeVideoId = videoId;
    const refreshId = ++likeModalRefreshId;

    let title = videoId;
    try {
      const data = player.getVideoData();
      if (data?.title) title = data.title;
    } catch (e) { /* ignore */ }

    els.likeModalVideo.textContent = title;
    els.likePlaylistList.innerHTML = '<li class="like-loading">Consultando listas en YouTube…</li>';
    els.likeModal.hidden = false;

    await ensurePlaylistsReady();
    if (refreshId !== likeModalRefreshId || pendingLikeVideoId !== videoId) return;

    renderLikeModalList(videoId, title, getVideoPlaylistMembership(videoId));
    focusLikeModal();

    refreshPlaylistsFromInvidious({ silent: true }).then(() => {
      if (refreshId !== likeModalRefreshId || els.likeModal.hidden || pendingLikeVideoId !== videoId) return;
      renderLikeModalList(videoId, title, getVideoPlaylistMembership(videoId));
      focusLikeModal();
    });
  }

  function updateLikeButtonState() {
    if (!els.likeBtn) return;
    const videoId = getCurrentVideoId();
    const inAll = isInAllList(videoId);
    els.likeBtn.classList.toggle("active", inAll);
    els.likeBtn.disabled = false;
    els.likeBtn.title = inAll
      ? "Añadir a más listas ev3c music"
      : "Añadir a listas ev3c music";
  }

  function flashLikeFeedback(msg) {
    const lang = langs[current];
    const prev = els.desc.textContent;
    els.desc.textContent = msg;
    setTimeout(() => {
      if (isMixMode(lang)) updateDiscoverDesc();
      else if (isNovedadesMode(lang)) updateNovedadesDesc();
      else if (isArtistsMode(lang) && currentArtist) {
        els.desc.textContent = `${currentArtist.name} · éxitos más populares en YouTube`;
      } else els.desc.textContent = langDesc[current] || lang?.desc || prev;
    }, 3200);
  }

  function closeLikeModal() {
    if (els.likeModal) els.likeModal.hidden = true;
    pendingLikeVideoId = null;
    likeModalRefreshId++;
    els.likeBtn?.focus();
  }

  function focusLikeModal() {
    const first = els.likeModal?.querySelector('label[tabindex="0"], #likeConfirmBtn');
    if (first) first.focus();
  }

  let pendingLikeVideoId = null;

  async function confirmLike() {
    if (!pendingLikeVideoId || !window.EV3C_YOUTUBE_LIKE) return;

    const videoId = pendingLikeVideoId;
    const playlistIds = collectPlaylistsToAdd(videoId);

    if (!playlistIds.length) {
      flashLikeFeedback("Ya está en todas las listas seleccionadas");
      closeLikeModal();
      return;
    }

    els.likeConfirmBtn.disabled = true;
    try {
      const result = await EV3C_YOUTUBE_LIKE.addToPlaylists(videoId, playlistIds);
      addVideoToPlaylistCache(videoId, playlistIds);
      closeLikeModal();
      updateLikeButtonState();

      const names = playlistIds.map((id) => {
        const lang = langs.find((l) => l.playlistId === id);
        return lang ? lang.code : "ALL";
      });

      if (result.needsConfig) {
        flashLikeFeedback(`✓ Guardada en ${names.join(", ")} · configura youtube.clientId`);
      } else if (result.error) {
        flashLikeFeedback(`✓ Local · YouTube: ${result.error}`);
      } else if (result.errors?.length) {
        flashLikeFeedback(`✓ Añadida · algunos errores en YouTube`);
      } else if (result.youtube > 0) {
        flashLikeFeedback(`✓ Añadida a ${names.join(", ")} en YouTube`);
      } else {
        flashLikeFeedback(`✓ Añadida a ${names.join(", ")}`);
      }
    } catch (e) {
      flashLikeFeedback("Error al añadir: " + e.message);
    } finally {
      els.likeConfirmBtn.disabled = false;
    }
  }

  function handleLike() {
    openLikeModal();
  }

  function initYoutubeLikeAuth() {
    if (!window.EV3C_YOUTUBE_LIKE || !CFG.youtube) return;
    EV3C_YOUTUBE_LIKE.init(CFG.youtube);
    const all = getAllLangConfig();
    if (all) mergeIntoExcluded([...EV3C_YOUTUBE_LIKE.getLikedAll()]);
  }

  function waitForGisAndInit() {
    if (window.google?.accounts?.oauth2) {
      initYoutubeLikeAuth();
      return;
    }
    setTimeout(waitForGisAndInit, 200);
  }

  function handleDislike() {
    const lang = langs[current];
    if (!lang || !player || !apiReady) return;

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    const disliked = getDisliked(lang);
    disliked.add(videoId);
    saveDisliked(lang, disliked);

    if (isMixMode(lang)) {
      lastTrackedVideoId = null;
      playDiscoverVideo(true);
    } else if (isNovedadesMode(lang)) {
      lastTrackedVideoId = null;
      playNovedadesVideo(true);
    } else if (isArtistsMode(lang)) {
      lastTrackedVideoId = null;
      playNextArtistVideo();
    } else if (lang.playlistId) {
      playNextSmart(lang, true);
    }
  }

  function selectLang(i, autoplay) {
    current = i;
    const lang = langs[i];
    if (!lang) return;

    [...els.tabs.children].forEach((t, idx) =>
      t.classList.toggle("active", idx === i)
    );

    els.glow.style.background = GLOWS[lang.code] || "var(--grad)";
    els.flag.textContent = lang.flag;
    els.label.textContent = lang.name;
    els.openBtn.href = externalUrl(lang);
    els.openBtn.target = "_blank";
    els.openBtn.rel = "noopener";

    lastTrackedVideoId = null;

    if (!isMixMode(lang) && !isNovedadesMode(lang) && !isFireplaceMode(lang) && !isArtistsMode(lang)) {
      lastContextIndex = i;
      discoverLoading = false;
      hideDiscoverLoader();
      hideArtistsPanel();
      els.desc.textContent = langDesc[i] || lang.desc;
    }

    if (isArtistsMode(lang)) {
      hideDiscoverLoader();
      els.placeholder.classList.add("hidden");
      currentArtist = null;
      artistQueue = [];
      els.desc.textContent = lang.desc;
      showArtistsPanel();
      return;
    }

    if (isFireplaceMode(lang)) {
      els.placeholder.classList.add("hidden");
      hideDiscoverLoader();
      hideArtistsPanel();
      els.desc.textContent = lang.desc;
      els.openBtn.href = `https://www.youtube.com/live/${lang.videoId}`;
      if (player && apiReady && lang.videoId) {
        shufflePending = false;
        player.loadVideoById(lang.videoId);
        if (autoplay || userStarted) player.playVideo();
      }
      return;
    }

    if (isNovedadesMode(lang)) {
      els.placeholder.classList.add("hidden");
      hideDiscoverLoader();
      hideArtistsPanel();
      updateNovedadesDesc();
      if (apiReady) {
        playNovedadesVideo(autoplay || userStarted);
      }
      return;
    }

    if (isMixMode(lang)) {
      els.placeholder.classList.add("hidden");
      discoverLoading = false;
      pendingDiscoverAutoplay = autoplay || userStarted;
      hideArtistsPanel();
      showDiscoverLoader();
      els.desc.textContent = "Discover · buscando canciones nuevas para ti…";
      if (apiReady) {
        playDiscoverVideo(pendingDiscoverAutoplay);
      }
      return;
    }

    if (lang.playlistId) {
      hideArtistsPanel();
      els.placeholder.classList.add("hidden");
      loadRandomPlaylist(lang, autoplay || userStarted);
      return;
    }

    if (lang.videoId && player && apiReady) {
      shufflePending = false;
      els.placeholder.classList.add("hidden");
      player.loadVideoById(lang.videoId);
      if (autoplay || userStarted) player.playVideo();
      return;
    }

    els.placeholder.classList.remove("hidden");
    els.placeholderText.textContent =
      `Conecta la playlist de ${lang.name} en js/config.js. Mientras tanto, búscala en YouTube.`;
  }

  function startPlayback() {
    userStarted = true;
    if (els.fileWarn) els.fileWarn.hidden = true;
    selectLang(current, true);
  }

  function showFileWarning() {
    if (!isFileProtocol || !els.fileWarn) return;
    els.fileWarn.hidden = false;
  }

  window.onYouTubeIframeAPIReady = function () {
    const first = langs[0] || {};
    const origin = window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : undefined;

    const playerVars = {
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      enablejsapi: 1
    };
    if (origin) playerVars.origin = origin;

    player = new YT.Player("ytPlayer", {
      width: "100%",
      height: "100%",
      playerVars,
      events: {
        onReady: function () {
          apiReady = true;
          lockYoutubeIframe();
          (async () => {
            await ensurePlaylistsReady();
            refreshCurrentDesc();
            const lang = langs[current] || first;
            if (isMixMode(lang)) {
              playDiscoverVideo(!isFileProtocol);
            } else if (isNovedadesMode(lang)) {
              playNovedadesVideo(!isFileProtocol);
            } else if (isArtistsMode(lang)) {
              showArtistsPanel();
            } else if (isFireplaceMode(lang) && lang.videoId) {
              player.loadVideoById(lang.videoId);
              if (!isFileProtocol) player.playVideo();
            } else if (lang.playlistId) {
              loadRandomPlaylist(lang, !isFileProtocol);
            }
          })();
        },
        onStateChange: function (e) {
          if (
            shufflePending &&
            (e.data === YT.PlayerState.CUED ||
              e.data === YT.PlayerState.UNSTARTED ||
              e.data === YT.PlayerState.PLAYING)
          ) {
            applyRandomStart();
            return;
          }

          if (e.data === YT.PlayerState.PLAYING) {
            const vid = getCurrentVideoId();
            if (
              discoverWaitingPlay &&
              (isMixMode(langs[current]) || isArtistsMode(langs[current])) &&
              (!discoverTargetVideoId || isArtistsMode(langs[current]) || vid === discoverTargetVideoId)
            ) {
              hideDiscoverLoader();
            }
            if (!isFireplaceMode(langs[current])) {
              skipDislikedOnCue();
              skipTooLongIfNeeded();
              trackCurrentVideo();
            }
            updateLikeButtonState();
            if (isSpecialMode(langs[current])) {
              els.openBtn.href = externalUrl(langs[current]);
            }
            return;
          }

          if (e.data === YT.PlayerState.CUED) {
            skipDislikedOnCue();
            return;
          }

          if (e.data === YT.PlayerState.ENDED) {
            lastTrackedVideoId = null;
            const lang = langs[current];
            if (isFireplaceMode(lang)) {
              if (lang.videoId) player.loadVideoById(lang.videoId);
              return;
            }
            if (isMixMode(lang)) {
              playDiscoverVideo(true);
            } else if (isNovedadesMode(lang)) {
              playNovedadesVideo(true);
            } else if (isArtistsMode(lang)) {
              playNextArtistVideo();
            } else {
              playNextSmart(lang, true);
            }
          }
        }
      }
    });
  };

  langs.forEach((lang, i) => {
    const btn = document.createElement("button");
    btn.className = "lang-tab";
    btn.setAttribute("role", "tab");
    btn.innerHTML = `<span class="flag">${lang.flag}</span><span class="code">${lang.code}</span>`;
    btn.addEventListener("click", () => {
      userStarted = true;
      selectLang(i, true);
    });
    els.tabs.appendChild(btn);

    if (els.footerLangs) {
      const a = document.createElement("a");
      a.href = externalUrl(lang);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = lang.name;
      els.footerLangs.appendChild(a);
    }
  });

  if (els.likeBtn) {
    els.likeBtn.addEventListener("click", handleLike);
  }

  if (els.likeConfirmBtn) {
    els.likeConfirmBtn.addEventListener("click", confirmLike);
  }

  document.querySelectorAll("[data-like-close]").forEach((el) => {
    el.addEventListener("click", closeLikeModal);
  });

  if (els.dislikeBtn) {
    els.dislikeBtn.addEventListener("click", handleDislike);
  }

  document.querySelectorAll("[data-artist-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      artistSort = btn.dataset.artistSort || "born";
      document.querySelectorAll("[data-artist-sort]").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      renderArtistsList();
    });
  });

  if (window.EV3C_CAST && els.castTvBtn) {
    EV3C_CAST.init({
      getUrl: () => externalUrl(langs[current] || {}),
      getVideoId: () => getCurrentVideoId(),
      onFeedback: (msg) => flashLikeFeedback(msg)
    });
    els.castTvBtn.addEventListener("click", () => EV3C_CAST.sendToTv());
  }

  waitForGisAndInit();

  document.querySelectorAll("[data-yt-channel]").forEach((el) => {
    el.href = CFG.channelUrl || searchUrl("ev3c music");
    el.target = "_blank";
    el.rel = "noopener";
  });

  document.querySelectorAll("[data-yt-search]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(searchUrl(langs[current] ? langs[current].searchQuery : "ev3c music"), "_blank", "noopener");
    });
  });

  document.querySelectorAll("[data-start-play]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      startPlayback();
    });
  });

  if (els.year) els.year.textContent = new Date().getFullYear();

  window.addEventListener("beforeunload", savePlaylistSnapshot);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") savePlaylistSnapshot();
  });

  function isAndroidTv() {
    const ua = navigator.userAgent || "";
    return /EV3C_Music/i.test(ua) ||
      (/Android/i.test(ua) && /(TV|GoogleTV|BRAVIA|AFT|SmartTV|MIBOX|MiTV|Xiaomi|SHIELD)/i.test(ua));
  }

  function lockYoutubeIframe() {
    const iframe = document.querySelector("#ytPlayer iframe");
    if (!iframe) return;
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("aria-hidden", "true");
  }

  function unlockYoutubeIframe() {
    const iframe = document.querySelector("#ytPlayer iframe");
    if (!iframe) return;
    iframe.removeAttribute("tabindex");
    iframe.removeAttribute("aria-hidden");
    try { iframe.focus(); } catch (e) { /* ignore */ }
  }

  let youtubeRemoteMode = false;
  let lastTvFocus = null;

  function enterYoutubeControls() {
    youtubeRemoteMode = true;
    lastTvFocus = document.activeElement;
    document.body.classList.add("yt-controls");
    unlockYoutubeIframe();
    if (els.desc) els.desc.textContent = "Mando en YouTube · Atrás para volver a ev3c music";
  }

  function exitYoutubeControls() {
    youtubeRemoteMode = false;
    document.body.classList.remove("yt-controls");
    lockYoutubeIframe();
    const restore = lastTvFocus && document.contains(lastTvFocus)
      ? lastTvFocus
      : els.playerTvShield || els.tabs?.querySelector(".lang-tab");
    restore?.focus();
    refreshCurrentDesc();
    if (isMixMode(langs[current])) updateDiscoverDesc();
    else if (isNovedadesMode(langs[current])) updateNovedadesDesc();
    else if (isFireplaceMode(langs[current]) && langs[current]) {
      els.desc.textContent = langs[current].desc;
    }
  }

  function tvFocusables() {
    const modalOpen = els.likeModal && !els.likeModal.hidden;
    const root = modalOpen ? els.likeModalBox || els.likeModal : document;
    return [...root.querySelectorAll(
      'button:not([disabled]):not([hidden]), a.btn:not([hidden]), label[tabindex="0"]'
    )].filter((el) => {
      if (el.closest("[hidden]")) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function moveTvFocus(dx, dy) {
    const items = tvFocusables();
    if (!items.length) return;
    const active = document.activeElement;
    const currentEl = items.includes(active) ? active : items[0];
    if (!items.includes(active)) {
      currentEl.focus();
      return;
    }

    const from = currentEl.getBoundingClientRect();
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    let best = null;
    let bestScore = Infinity;

    items.forEach((el) => {
      if (el === currentEl) return;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const vx = ex - cx;
      const vy = ey - cy;
      if (dx && vx * dx <= 8) return;
      if (dy && vy * dy <= 8) return;
      const primary = dx ? Math.abs(vx) : Math.abs(vy);
      const secondary = dx ? Math.abs(vy) : Math.abs(vx);
      const score = primary + secondary * 2.4;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    });

    (best || currentEl).focus();
  }

  function activateTvFocus(el) {
    if (!el) return;
    if (el.id === "playerTvShield") {
      enterYoutubeControls();
      return;
    }
    if (el.tagName === "LABEL") {
      const input = el.querySelector("input");
      if (input && !input.disabled) input.checked = !input.checked;
      return;
    }
    el.click();
  }

  function initTvRemote() {
    if (isAndroidTv()) {
      document.body.classList.add("tv-remote");
      if (els.castTvBtn) els.castTvBtn.hidden = true;
    }

    if (els.playerTvShield) {
      els.playerTvShield.addEventListener("click", () => {
        document.body.classList.add("tv-remote");
        enterYoutubeControls();
      });
    }

    document.addEventListener("keydown", (e) => {
      const key = e.key;
      const isArrow = key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
      const isOk = key === "Enter" || key === "NumpadEnter" || key === "Select";
      const isBack = key === "Escape" || key === "GoBack" || e.keyCode === 4 || key === "Backspace";

      if (youtubeRemoteMode) {
        if (isBack) {
          e.preventDefault();
          exitYoutubeControls();
        }
        return;
      }

      if (isArrow || isOk || isBack) {
        document.body.classList.add("tv-remote");
        lockYoutubeIframe();
      }

      if (isBack && els.likeModal && !els.likeModal.hidden) {
        e.preventDefault();
        closeLikeModal();
        return;
      }

      if (isArrow) {
        e.preventDefault();
        if (key === "ArrowLeft") moveTvFocus(-1, 0);
        if (key === "ArrowRight") moveTvFocus(1, 0);
        if (key === "ArrowUp") moveTvFocus(0, -1);
        if (key === "ArrowDown") moveTvFocus(0, 1);
        return;
      }

      if (isOk) {
        const el = document.activeElement;
        if (el && (el.matches("button, a.btn, label[tabindex]") || tvFocusables().includes(el))) {
          e.preventDefault();
          activateTvFocus(el);
        }
      }
    });

    const firstTab = els.tabs?.querySelector(".lang-tab");
    if (isAndroidTv() && firstTab) firstTab.focus();
  }

  if (langs.length) {
    playlistsRefreshPromise = refreshPlaylistsFromInvidious();
    selectLang(0, false);
    if (isFileProtocol) {
      showFileWarning();
    }
  }

  initTvRemote();
})();
