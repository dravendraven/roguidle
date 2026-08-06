# Roguidle

An idle roguelike for the browser: a hero delves an emoji dungeon on its
own, one small boss guards the stairs on every floor, and every boss
killed leaves a chest of gear worth opening by hand. No build step, no
account, no server — just a page that keeps a save in your browser and
keeps playing whether the tab is open or not.

**Play it:** https://dravendraven.github.io/roguidle/ (once GitHub Pages
is turned on for this repo — it serves straight from the root, no CI).

## Running it locally

```
python tools/dev-server.py
```

then open http://localhost:8137/index.html. That server turns off
browser caching, which plain `python -m http.server` won't do — without
it, edits to the game's code can silently not take effect.

## About

Inspired by [rogule.com](https://rogule.com), a lovely one-glance daily
roguelike. Roguidle borrows its emoji-only art budget and its love of
small legible numbers, but is otherwise a different, idler game — see
`docs/notes/` for the design and technical notes.
