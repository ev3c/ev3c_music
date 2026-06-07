(function () {
  "use strict";

  const CFG = window.EV3C_CONFIG || { languages: [] };
  const langs = CFG.languages || [];
  const DISLIKE_PREFIX = "ev3c_disliked:";

  const GLOWS = {
    ALL: "linear-gradient(100deg, #00d4ff, #8b3bff 55%, #ff2bb4)",
    ENG: "linear-gradient(100deg, #00d4ff, #2a7bff)",
    ESP: "linear-gradient(100deg, #ff2bb4, #ff7a18)",
    CAT: "linear-gradient(100deg, #ffd23f, #ff2bb4)",
    FRA: "linear-gradient(100deg, #8b3bff, #00d4ff)"
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
    dislikeBtn: $("#dislikeBtn"),
    footerLangs: $("#footerLangs"),
    year: $("#year"),
    fileWarn: $("#fileWarn")
  };

  const isFileProtocol = window.location.protocol === "file:";

  let player = null;
  let apiReady = false;
  let current = 0;
  let userStarted = false;
  let shufflePending = false;
  let shouldAutoplay = false;

  function externalUrl(lang) {
    if (lang.playlistId) return `https://www.youtube.com/playlist?list=${lang.playlistId}`;
    if (lang.videoId) return `https://www.youtube.com/watch?v=${lang.videoId}`;
    return searchUrl(lang.searchQuery);
  }

  function searchUrl(q) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q || "ev3c music")}`;
  }

  function getDisliked(playlistId) {
    if (!playlistId) return new Set();
    try {
      const raw = localStorage.getItem(DISLIKE_PREFIX + playlistId);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function saveDisliked(playlistId, set) {
    if (!playlistId) return;
    localStorage.setItem(DISLIKE_PREFIX + playlistId, JSON.stringify([...set]));
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

  function getPlayableIndices(lang) {
    if (!player) return [];
    try {
      const list = player.getPlaylist && player.getPlaylist();
      if (!list || !list.length) return [];
      const disliked = getDisliked(lang.playlistId);
      const indices = [];
      for (let i = 0; i < list.length; i++) {
        if (!disliked.has(list[i])) indices.push(i);
      }
      return indices;
    } catch (e) {
      return [];
    }
  }

  function playRandomNonDisliked(lang, autoplay) {
    if (!player || !lang) return false;
    const indices = getPlayableIndices(lang);
    if (!indices.length) {
      els.desc.textContent = "Todas las canciones están en dislike. Limpia el almacenamiento del navegador.";
      return false;
    }
    const idx = indices[Math.floor(Math.random() * indices.length)];
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
    if (!lang) return;
    try {
      const list = player.getPlaylist && player.getPlaylist();
      if (list && list.length > 0) {
        playRandomNonDisliked(lang, shouldAutoplay);
        shufflePending = false;
      }
    } catch (e) { /* la playlist aún no está lista */ }
  }

  function loadRandomPlaylist(lang, autoplay) {
    if (!lang.playlistId) return false;
    shufflePending = true;
    shouldAutoplay = autoplay;

    if (!player || !apiReady) return true;

    player.loadPlaylist({
      listType: "playlist",
      list: lang.playlistId,
      index: randomIndex(lang)
    });
    return true;
  }

  function skipDislikedOnCue() {
    const lang = langs[current];
    if (!lang || !lang.playlistId || !player) return;
    const videoId = getCurrentVideoId();
    if (!videoId) return;
    const disliked = getDisliked(lang.playlistId);
    if (disliked.has(videoId)) {
      playRandomNonDisliked(lang, true);
    }
  }

  function handleDislike() {
    const lang = langs[current];
    if (!lang || !lang.playlistId || !player || !apiReady) return;

    const videoId = getCurrentVideoId();
    if (!videoId) return;

    const disliked = getDisliked(lang.playlistId);
    disliked.add(videoId);
    saveDisliked(lang.playlistId, disliked);

    playRandomNonDisliked(lang, true);
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
    els.desc.textContent = lang.desc;
    els.openBtn.href = externalUrl(lang);
    els.openBtn.target = "_blank";
    els.openBtn.rel = "noopener";

    if (lang.playlistId) {
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
          if (first.playlistId) {
            loadRandomPlaylist(first, !isFileProtocol);
          }
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
          if (e.data === YT.PlayerState.CUED || e.data === YT.PlayerState.PLAYING) {
            skipDislikedOnCue();
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

  if (els.dislikeBtn) {
    els.dislikeBtn.addEventListener("click", handleDislike);
  }

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

  if (langs.length) {
    selectLang(0, false);
    if (isFileProtocol) {
      showFileWarning();
    }
  }
})();
