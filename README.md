# Roguidle

An idle roguelike for the browser: a hero delves an emoji dungeon on its
own, one small boss guards the stairs on every floor, and every boss
killed leaves a chest of gear worth opening by hand. No build step, no
account, no server — a save lives in your browser, and the game keeps
playing whether the tab is open or not.

**Play it:** https://dravendraven.github.io/roguidle/ (once GitHub Pages
is turned on for this repo).

## Running it locally

```
python tools/dev-server.py
```

then open http://localhost:8137/index.html. That server disables
browser caching, unlike plain `python -m http.server` — without it,
edits can silently not take effect.

Inspired by [rogule.com](https://rogule.com); design and tech notes are
in `docs/notes/`.
