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

  languages: [
    {
      code: "ALL",
      flag: "🎵",
      name: "ev3c music",
      desc: "Lista principal · 444 vídeos · todos los idiomas",
      playlistId: "PLngPtibRb2iFrta4peXN3qV5yD9yIEQcq",
      videoCount: 444,
      videoId: "",
      searchQuery: "ev3c music"
    },
    {
      code: "ENG",
      flag: "🇬🇧",
      name: "ev3c music ENG",
      desc: "English tracks · 236 vídeos · feel the rhythm",
      playlistId: "PLngPtibRb2iHHBR67jrxkjuU5T0M578UA",
      videoCount: 236,
      videoId: "",
      searchQuery: "ev3c music eng"
    },
    {
      code: "ESP",
      flag: "🇪🇸",
      name: "ev3c music ESP",
      desc: "Canciones en español · 120 vídeos · siente la vibra",
      playlistId: "PLngPtibRb2iHWqOO2qhH6a5FlM_uCY2Mn",
      videoCount: 120,
      videoId: "",
      searchQuery: "ev3c music esp"
    },
    {
      code: "CAT",
      flag: "🏴󠁥󠁳󠁣󠁴󠁿",
      name: "ev3c music CAT",
      desc: "Cançons en català · 63 vídeos · emoció sense límits",
      playlistId: "PLngPtibRb2iEPBnv6M4dfZR6Ms-ERn0Yr",
      videoCount: 63,
      videoId: "",
      searchQuery: "ev3c music cat"
    },
    {
      code: "FRA",
      flag: "🇫🇷",
      name: "ev3c music FRA",
      desc: "Chansons en français · 17 vídeos · émotions sans limites",
      playlistId: "PLngPtibRb2iH9afV1MSjMAyWvRMe9wA_x",
      videoCount: 17,
      videoId: "",
      searchQuery: "ev3c music fra"
    }
  ]
};
