# Contributing to Wildwing

Thanks for helping improve Wildwing. Bug reports, accessibility fixes, performance work, documentation, and well-scoped gameplay or scenery improvements are welcome.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- For a bug, open an issue with a reproducible world URL (`?seed=...`), browser and device, steps to reproduce, expected behavior, and what happened. Add a screenshot or short recording when appearance or motion matters.
- For a substantial new feature or visual overhaul, open an issue first so the direction and performance budget can be discussed. Small fixes can go straight to a pull request.
- Be respectful and specific in issues and reviews. Critique the work, not the person. Do not post credentials or private data in a public issue.

## Set up locally

Use Node.js 22 or later. The project is a Vite and Three.js browser game with no backend.

```sh
git clone https://github.com/saivarun1410/wildwing.git
cd wildwing
npm ci
npm run dev
```

Open the local URL shown by Vite. Add a seed such as `?seed=123456` to reproduce the same world. Run the full check before submitting:

```sh
npm run check
```

That command runs the Node tests and builds the production bundle. GitHub Actions runs the same command on pushes and pull requests.

## Make a change

1. Create a branch in your fork. Keep each pull request focused on one change.
2. Follow the existing module boundaries: `world.js` generates the world, `simulation.js` handles bird behavior, `scene.js` and related modules render it, and `main.js` connects the UI. Keep seeded behavior reproducible.
3. Add or update meaningful tests for gameplay, map, or world generation changes. Avoid tests that only repeat the implementation.
4. For visual or control changes, play the build in a real browser. Check the affected scene at a recorded seed, day and night if relevant, and nearby and distant views if scenery is involved. Include screenshots or a short recording in the pull request, and state what still looks wrong. A passing build alone does not verify rendering.
5. Keep streamed scenery efficient. Use sensible texture sizes, instancing, and level of detail where appropriate; call out any meaningful effect on load time or frame rate.

### Assets and licenses

Only submit assets you created or have permission to redistribute in an open-source, commercially usable project. Do not copy imagery from reference screenshots. Prefer compact, well-licensed assets and bundle what the game needs locally. For every third-party asset, update `ASSET_LICENSES.md` with its source URL, license, local filenames, and any required attribution or modification notice. Do not add an asset if its license or provenance is unclear.

Code contributions are made under the repository's [MIT license](LICENSE). Asset licenses remain as documented in [ASSET_LICENSES.md](ASSET_LICENSES.md).

## Open a pull request

- Target `main` from your fork or feature branch. Use a draft pull request while work is incomplete.
- Explain the problem and the change, link the relevant issue, and list the commands and browser scenarios you checked. Include before and after images for visual changes.
- Keep unrelated formatting, generated `dist/` files, dependencies, and secrets out of the pull request.
- Respond to review comments with follow-up commits. Do not force-push after review without telling reviewers what changed.

The repository owner, [@saivarun1410](https://github.com/saivarun1410), is the only person who merges pull requests. Review approval does not grant merge permission.
