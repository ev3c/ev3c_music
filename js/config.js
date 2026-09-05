/* ============================================================
   ev3c music · CONFIGURACIÓN
   ------------------------------------------------------------
   Edita SOLO este archivo para conectar tus contenidos.

   1) channelUrl  -> URL de tu canal (botón "Suscribirse").
   2) Para cada idioma rellena UNO de estos campos:
        - playlistId : ID de la playlist de YouTube
                       (lo que va después de "list=" en la URL).
        - videoId    : ID de un vídeo suelto (alternativa).
      Si dejas ambos vacíos, se mostrará un buscador automático
      en YouTube con el término "searchQuery".

   Ejemplo de URL de playlist:
   https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx
                                          └──── ESTO ────┘
   ============================================================ */

window.EV3C_CONFIG = {
  channelUrl: "https://www.youtube.com/@ev3c",
  playedResetRatio: 0.9,
  maxDurationSeconds: 600,

  /* Like → añadir a ev3c_all en YouTube (requiere OAuth):
     1) Google Cloud Console → YouTube Data API v3 activada
     2) Credenciales OAuth 2.0 (tipo: aplicación web)
     3) Orígenes autorizados: http://localhost:8123
     4) Pega clientId (y apiKey opcional) abajo */
  youtube: {
    clientId: "",
    apiKey: "",
    allPlaylistId: "PLngPtibRb2iFrta4peXN3qV5yD9yIEQcq"
  },

  languages: [
    {
      code: "ALL",
      flag: "🎵",
      name: "ev3c music",
      desc: "Lista principal · todos los idiomas",
      playlistId: "PLngPtibRb2iFrta4peXN3qV5yD9yIEQcq",
      videoCount: 0,
      videoId: "",
      searchQuery: "ev3c music"
    },
    {
      code: "ENG",
      flag: "🇬🇧",
      name: "ev3c music ENG",
      desc: "English tracks · feel the rhythm",
      playlistId: "PLngPtibRb2iHHBR67jrxkjuU5T0M578UA",
      videoCount: 0,
      videoId: "",
      searchQuery: "ev3c music eng"
    },
    {
      code: "ESP",
      flag: "🇪🇸",
      name: "ev3c music ESP",
      desc: "Canciones en español · siente la vibra",
      playlistId: "PLngPtibRb2iHWqOO2qhH6a5FlM_uCY2Mn",
      videoCount: 0,
      videoId: "",
      searchQuery: "ev3c music esp"
    },
    {
      code: "CAT",
      flag: "🏴󠁥󠁳󠁣󠁴󠁿",
      name: "ev3c music CAT",
      desc: "Cançons en català · emoció sense límits",
      playlistId: "PLngPtibRb2iEPBnv6M4dfZR6Ms-ERn0Yr",
      videoCount: 0,
      videoId: "",
      searchQuery: "ev3c music cat"
    },
    {
      code: "FRA",
      flag: "🇫🇷",
      name: "ev3c music FRA",
      desc: "Chansons en français · émotions sans limites",
      playlistId: "PLngPtibRb2iH9afV1MSjMAyWvRMe9wA_x",
      videoCount: 0,
      videoId: "",
      searchQuery: "ev3c music fra"
    },
    {
      code: "NEW",
      flag: "🆕",
      name: "Novedades",
      desc: "Canciones añadidas desde tu última visita",
      mode: "novedades",
      playlistId: "",
      videoCount: 0,
      videoId: "",
      searchQuery: "ev3c music novedades"
    },
    {
      code: "DISCOVER",
      flag: "✨",
      name: "Discover",
      desc: "Tu música habitual · fuera de tus listas",
      mode: "youtube-mix",
      playlistId: "",
      videoCount: 0,
      videoId: "",
      searchQuery: "ev3c music discover"
    },
    {
      code: "FIRE",
      flag: "🔥",
      name: "Fireplace",
      desc: "Chimenea en directo · ambiente relajado",
      mode: "fireplace",
      playlistId: "",
      videoCount: 0,
      videoId: "cjsZyFd955U",
      searchQuery: "fireplace live"
    },
    {
      code: "ART",
      flag: "🎤",
      name: "Artistas",
      desc: "Cantantes y grupos · ordenados por fecha",
      mode: "artists",
      playlistId: "",
      videoCount: 0,
      videoId: "",
      searchQuery: "official music video"
    }
  ]
};
