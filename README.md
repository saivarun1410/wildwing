# Wildwing

[▶ Play the live demo](https://wildwing.pages.dev/?seed=123456) — no installation or account needed. Start playing, press `F` to take off, and use `T` to switch between day and night. Fly north for the snow mountains or east for the ocean and waterfall. Press `H`, `J`, or `N` to try hunting and nest building.

Wildwing is a playable bird world. Begin on a branch, take flight when you choose, steer across a procedural wilderness, hunt from lakes or meadows, perch in other trees, and gather twigs to build a nest at your home tree.

The world streams terrain and wildlife around the bird as it travels. Groves, ponds, lakes, northern snow mountains, a broad eastern ocean, waterfalls, wispy clouds, birds, and roaming land animals are generated from a shareable world seed. A large coastal waterfall is a landmark near the ocean. A day/night cycle brings a visible sun, moon, and stars. There is no fixed map edge and no automatic flight path for the player bird.

## Play

Open the [live demo](https://wildwing.pages.dev/?seed=123456). A browser with WebGL support is required. The site runs entirely in the browser; there is no account or server-side game state.

| Control | Action |
| --- | --- |
| `F` or `W` | Take off; `F` also returns to free flight |
| `W` / `S` | Increase / decrease cruising speed (up to 120 m/s) |
| `A` / `D` | Turn left / right |
| `↑` / `↓` | Climb above the clouds / dive below the trees |
| `Shift` | Maximum speed while held |
| `Space` | Flap for lift |
| `T` | Switch between day and night |
| Drag the world | Steer the bird |
| `P` | Find a branch and perch |
| `H` | Hunt fish from water |
| `J` | Hunt prey on land |
| `N` | Build the nest in five automatic gathering trips |

Action buttons are available on screen. A hunt, perch, or nest task continues even if a movement key was already held when it started; fresh steering input returns control to you.

After takeoff the bird climbs to cloud height and mostly glides. Active lift produces slower, smoother wingbeats. Hunts use a fast diving approach; landing on a branch uses a slower approach. Fly north to find the snow mountains, or east to reach the ocean and great waterfall.

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

- `src/world.js` creates deterministic terrain, lakes, ponds, ocean coastline, forests, fish, land prey, and home sites.
- `src/simulation.js` owns the bird's flight controls, task navigation, hunting, perching, and nest-building state.
- `src/scene.js` renders streaming terrain tiles, vegetation, water, sky, birds, and the growing nest with Three.js.
- `src/ecosystem.js` adds roaming deer, bears, monkeys, foxes, and scattered waterfalls.
- `src/main.js` connects controls, commands, camera, mini-map, audio, and local progress.

The environment and birds are procedurally modeled in a stylized naturalistic form. No external 3D model assets are required. Tree and ground detail use instanced meshes to keep draw calls bounded as terrain tiles stream in and out.

## License

MIT © Sai Varun Thupakula. See [LICENSE](LICENSE).
