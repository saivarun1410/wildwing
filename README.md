# Wildwing

Wildwing is a playable bird world. Begin on a branch, take flight when you choose, steer across an expansive procedural wilderness, hunt from lakes or meadows, perch in other trees, and gather twigs to build a nest at your home tree.

The world streams terrain and wildlife around the bird as it travels. Forests, shorelines, lakes, distant hills, clouds, and other birds are generated from a shareable world seed. There is no fixed map edge and no automatic flight path for the player bird.

## Play

Open the [live world](https://wildwing.pages.dev/). A browser with WebGL support is required. The site runs entirely in the browser; there is no account or server-side game state.

| Control | Action |
| --- | --- |
| `F` or `W` | Take off; `F` also returns to free flight |
| `W` / `S` | Fly faster / slower |
| `A` / `D` | Turn left / right |
| `↑` / `↓` | Climb / dive |
| `Shift` | Fast flight |
| `Space` | Flap for lift |
| Drag the world | Steer the bird |
| `P` | Find a branch and perch |
| `H` | Hunt fish from water |
| `J` | Hunt prey on land |
| `N` | Gather a twig and carry it home to build the nest |
| `/` or `Enter` | Type a command |

The command bar understands phrases such as `fly east`, `fly north`, `perch`, `hunt fish`, `hunt land`, `build nest`, and `return home`. A typed task takes the bird toward a nearby target. Steering manually returns control to you immediately.

The mini-map shows nearby land, water, trees, the home tree, and the bird's heading. Progress is saved locally per seed. Add `?seed=123456` to the URL to reopen a particular world.

## Develop

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
```

```sh
npm run check
```

`npm run check` runs simulation tests and builds the production site. To deploy the static output to an existing Cloudflare Pages project:

```sh
npm run build
npx wrangler pages deploy dist --project-name wildwing --branch main
```

## How it works

- `src/world.js` creates deterministic terrain, forests, fish, land prey, and home sites.
- `src/simulation.js` owns the bird's flight controls, task navigation, hunting, perching, and nest-building state.
- `src/scene.js` renders streaming terrain tiles, vegetation, water, sky, birds, and the growing nest with Three.js.
- `src/main.js` connects controls, commands, camera, mini-map, audio, and local progress.

The environment and birds are procedurally modeled in a stylized naturalistic form. No external 3D model assets are required. Tree and ground detail use instanced meshes to keep draw calls bounded as terrain tiles stream in and out.

## License

MIT © Sai Varun Thupakula. See [LICENSE](LICENSE).
