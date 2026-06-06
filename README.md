# ev3c music · Web oficial

Web one-page para el canal de YouTube **ev3c music** con sus 4 listas por idioma:
**ENG · ESP · CAT · FRA**.

> *Create · Feel · Inspire — Music in every language, emotions without limits.*

---

## Cómo verla

Abre `index.html` en el navegador (doble clic) o sirve la carpeta:

```bash
# opción rápida con Python
python -m http.server 8000
# luego abre http://localhost:8000
```

## Conectar tus playlists (lo único que tienes que tocar)

Edita **`js/config.js`**. Para cada idioma pega el **ID de la playlist**
(lo que va después de `list=` en la URL de YouTube):

```
https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx
                                       └──── este ID ────┘
```

```js
{
  code: "ENG",
  ...
  playlistId: "PLxxxxxxxxxxxxxxxx",   // <- pega aquí
}
```

- Si pones `playlistId`, se reproduce la lista entera.
- Si solo tienes un vídeo, usa `videoId` en su lugar.
- Si dejas ambos vacíos, el botón abre una **búsqueda automática** en YouTube
  con el término de `searchQuery` (ya funciona sin configurar nada).

También puedes cambiar `channelUrl` por la URL real de tu canal para el botón
**Suscribirse**.

## Estructura

```
ev3c_music/
├── index.html        # estructura
├── css/styles.css    # estilo neón / glassmorphism animado
├── js/config.js      # ← EDITA AQUÍ tus playlists
├── js/app.js         # lógica (tabs, reproductor, animaciones)
└── assets/           # logo.png y banner.png
```

## Detalles de diseño

- Tema oscuro con degradado de marca cian → púrpura → magenta.
- Hero con banner animado, logo flotante y ecualizador en vivo.
- Tabs de idioma con glow propio para cada lengua.
- Reproductor de YouTube embebido (modo `youtube-nocookie`, sin tracking extra).
- Animaciones de scroll, responsive y accesible.
