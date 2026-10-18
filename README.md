# Afterglow Atlas

A tiny universe to wander, compose, and keep. Afterglow Atlas is a dependency-free interactive nightscape: a glass lantern glides over a moonlit sea while you place stars that gradually become your own constellation.

## What you can do

- Move your pointer or touch the scene to guide the lantern. It wanders on its own when left alone.
- Click or tap anywhere in the scene to leave a star in the sky. Nearby stars connect into a personal map.
- Cycle between three atmospheres, each with its own sky, sea, and aurora.
- Save the current view as a PNG or share a link that includes your world seed, atmosphere, and stars.
- Turn the synthesized ambient soundtrack on or off, pause the scene, or visit a fresh world.

Your stars are saved in browser storage for each world seed. No account, cookies, build system, external graphics, or analytics are required. The optional Google Fonts stylesheet enhances typography; the experience still works with local fallback fonts.

## Run locally

Serve the `dist` folder with any static file server. For example:

```sh
python3 -m http.server 8000 --directory dist
```

Then open `http://localhost:8000`.

Run the dependency-free smoke tests with `npm test`.

## Controls

| Input | Action |
|---|---|
| Pointer movement / touch | Guide the lantern |
| Click / tap | Place a star |
| Arrow keys | Nudge the lantern |
| Space | Pause or resume |
| M | Toggle sound |
| S | Save the view |

The `?seed=123456` URL parameter opens a repeatable procedural world. Shared links also carry the selected atmosphere and placed stars. If your system prefers reduced motion, the experience starts paused.

## Deploy

The site is static. Point Cloudflare Pages at the repository with `dist` as the output directory and no build command, or deploy directly:

```sh
npx wrangler pages deploy dist --project-name afterglow-atlas
```

## Project structure

- `dist/index.html` — accessible controls and content
- `dist/styles.css` — responsive interface
- `dist/app.js` — procedural rendering, interaction, audio, and persistence

## License

MIT © Sai Varun Thupakula. See [LICENSE](LICENSE).
