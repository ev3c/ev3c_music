(function () {
  "use strict";

  const YOUTUBE_CAST_APP_ID = "233637DE";
  const DEFAULT_CAST_APP_ID = chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || "CC1AD845";

  let cfg = {
    getUrl: () => "",
    getVideoId: () => null,
    onFeedback: () => {}
  };
  let castReady = false;

  function extractVideoId(url) {
    if (!url) return null;
    const m = String(url).match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function getCastUrl() {
    const videoId = cfg.getVideoId();
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    return cfg.getUrl();
  }

  function openYoutubeFallback(url) {
    window.open(url, "_blank", "noopener");
    cfg.onFeedback("Abre YouTube y pulsa 📺 Enviar a tu Xiaomi TV");
  }

  function loadOnSession(session, videoId) {
    return new Promise((resolve, reject) => {
      const mediaInfo = new chrome.cast.media.MediaInfo(videoId, "video/vnd.youtube");
      mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
      const metadata = new chrome.cast.media.GenericMediaMetadata();
      metadata.title = "ev3c music";
      mediaInfo.metadata = metadata;

      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      session.loadMedia(
        request,
        () => resolve(),
        (err) => reject(err)
      );
    });
  }

  function initCastFramework() {
    if (!window.cast?.framework || castReady) return;
    try {
      const ctx = cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: YOUTUBE_CAST_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        resumeSavedSession: true
      });
      castReady = true;
    } catch (e) { /* Cast no disponible */ }
  }

  window.__onGCastApiAvailable = function (isAvailable) {
    if (isAvailable) initCastFramework();
  };

  async function sendToTv() {
    const url = getCastUrl();
    if (!url) {
      cfg.onFeedback("Reproduce una canción antes de enviar a la TV");
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      openYoutubeFallback(url);
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: "ev3c music", url });
        cfg.onFeedback("Elige tu Xiaomi TV en el menú compartir");
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }

    if (window.cast?.framework) {
      initCastFramework();
      try {
        const ctx = cast.framework.CastContext.getInstance();
        if (ctx.getCastState() === cast.framework.CastState.NO_DEVICES_AVAILABLE) {
          openYoutubeFallback(url);
          return;
        }

        await ctx.requestSession();
        const session = ctx.getCurrentSession();
        if (!session) {
          openYoutubeFallback(url);
          return;
        }

        try {
          await loadOnSession(session, videoId);
          cfg.onFeedback("Reproduciendo en tu TV…");
          return;
        } catch (e) {
          try {
            ctx.setOptions({
              receiverApplicationId: DEFAULT_CAST_APP_ID,
              autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
            });
            const mediaInfo = new chrome.cast.media.MediaInfo(url, "text/html");
            const request = new chrome.cast.media.LoadRequest(mediaInfo);
            await new Promise((resolve, reject) => {
              session.loadMedia(request, resolve, reject);
            });
            cfg.onFeedback("Enviando a la TV…");
            return;
          } catch (e2) {
            /* fallback abajo */
          } finally {
            ctx.setOptions({
              receiverApplicationId: YOUTUBE_CAST_APP_ID,
              autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
            });
          }
        }
      } catch (e) {
        if (e === "cancel" || e?.code === "cancel") return;
      }
    }

    openYoutubeFallback(url);
  }

  window.EV3C_CAST = {
    init(options) {
      cfg = { ...cfg, ...options };
      if (window.cast?.framework) initCastFramework();
    },
    sendToTv,
    isAvailable() {
      return Boolean(window.cast?.framework) || Boolean(navigator.share);
    }
  };
})();
