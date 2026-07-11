(function () {
  "use strict";

  const LIKED_PREFIX = "ev3c_liked:";
  const TOKEN_KEY = "ev3c_yt_token";
  const YT_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

  let cfg = {};
  let tokenClient = null;
  let accessToken = null;
  let pendingJob = null;

  function likedKey(playlistId) {
    return LIKED_PREFIX + playlistId;
  }

  function getLiked(playlistId) {
    try {
      const raw = localStorage.getItem(likedKey(playlistId));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function saveLiked(playlistId, set) {
    localStorage.setItem(likedKey(playlistId), JSON.stringify([...set]));
  }

  function getLikedAll() {
    const allId = cfg.allPlaylistId;
    return allId ? getLiked(allId) : new Set();
  }

  function isConfigured() {
    return Boolean(cfg.clientId);
  }

  function getToken() {
    if (accessToken) return accessToken;
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) accessToken = stored;
    return accessToken;
  }

  function setToken(token) {
    accessToken = token;
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function init(config) {
    cfg = config || {};
    if (!cfg.clientId || !window.google?.accounts?.oauth2) return;

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: YT_SCOPE,
      callback: (response) => {
        if (response.error) {
          if (pendingJob?.reject) pendingJob.reject(new Error(response.error));
          pendingJob = null;
          return;
        }
        setToken(response.access_token);
        if (pendingJob) {
          const job = pendingJob;
          pendingJob = null;
          runYoutubeInserts(job.videoId, job.playlistIds)
            .then((r) => job.resolve && job.resolve(r))
            .catch((e) => job.reject && job.reject(e));
        }
      }
    });
  }

  function requestToken() {
    return new Promise((resolve, reject) => {
      if (!tokenClient) {
        reject(new Error("YouTube OAuth no configurado"));
        return;
      }
      pendingJob = {
        videoId: pendingJob?.videoId,
        playlistIds: pendingJob?.playlistIds,
        resolve,
        reject
      };
      tokenClient.requestAccessToken({ prompt: getToken() ? "" : "consent" });
    });
  }

  async function insertOnYouTube(videoId, playlistId) {
    const token = getToken();
    if (!token) throw new Error("Sin sesión de YouTube");

    let url = "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet";
    if (cfg.apiKey) url += "&key=" + encodeURIComponent(cfg.apiKey);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: "youtube#video", videoId }
        }
      })
    });

    if (res.status === 401) {
      setToken(null);
      throw new Error("Sesión expirada");
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      if (/duplicate|already|exist/i.test(msg)) {
        return { playlistId, duplicate: true };
      }
      throw new Error(msg);
    }
    return { playlistId, ok: true, data };
  }

  async function runYoutubeInserts(videoId, playlistIds) {
    const results = [];
    for (const playlistId of playlistIds) {
      try {
        results.push(await insertOnYouTube(videoId, playlistId));
      } catch (e) {
        if (e.message === "Sesión expirada") throw e;
        results.push({ playlistId, error: e.message });
      }
    }
    return results;
  }

  function markLocal(videoId, playlistIds) {
    playlistIds.forEach((plId) => {
      const set = getLiked(plId);
      set.add(videoId);
      saveLiked(plId, set);
    });
  }

  async function addToPlaylists(videoId, playlistIds) {
    if (!videoId) throw new Error("Sin vídeo");
    const unique = [...new Set(playlistIds.filter(Boolean))];
    if (!unique.length) throw new Error("Sin listas");

    markLocal(videoId, unique);

    if (!isConfigured()) {
      return { local: true, youtube: 0, needsConfig: true, playlistIds: unique };
    }

    try {
      if (!getToken()) {
        pendingJob = { videoId, playlistIds: unique };
        await requestToken();
        pendingJob = null;
        return { local: true, youtube: unique.length, playlistIds: unique };
      }

      const ytResults = await runYoutubeInserts(videoId, unique);
      const ok = ytResults.filter((r) => r.ok || r.duplicate).length;
      const errors = ytResults.filter((r) => r.error).map((r) => r.error);
      return { local: true, youtube: ok, errors, playlistIds: unique };
    } catch (e) {
      if (e.message === "Sesión expirada") {
        pendingJob = { videoId, playlistIds: unique };
        await requestToken();
        pendingJob = null;
        return { local: true, youtube: unique.length, playlistIds: unique };
      }
      return { local: true, youtube: 0, error: e.message, playlistIds: unique };
    }
  }

  function isLikedIn(playlistId, videoId) {
    return getLiked(playlistId).has(videoId);
  }

  function isLiked(videoId) {
    const allId = cfg.allPlaylistId;
    return allId ? isLikedIn(allId, videoId) : false;
  }

  window.EV3C_YOUTUBE_LIKE = {
    init,
    addToPlaylists,
    isLiked,
    isLikedIn,
    isConfigured,
    getLikedAll,
    getLiked
  };
})();
