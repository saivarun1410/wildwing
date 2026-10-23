# Wildwing

[▶ Play the live demo](https://wildwing.pages.dev/) — no installation or account needed. Start playing, press `F` to take off, and use `T` to switch between day and night. Fly north for the snow mountains, east for the ocean and waterfall, or west-southwest for the city. Press `H`, `J`, or `N` to try hunting and nest building.

Wildwing is a playable bird world. Begin on a branch, take flight when you choose, steer across a procedural wilderness, hunt from lakes or meadows, perch in other trees, and gather twigs to build a nest at your home tree.

After starting, choose an eagle, falcon, owl, or kingfisher from the in-game Bird selector. Choose pleasant, sunny, cloudy, rainy, snowy, stormy, or misty weather from the Weather selector. Bird and weather choices are saved with progress for each world seed.

The world streams terrain and wildlife around the bird as it travels. Open meadows, mixed woodland, ponds, lakes, vegetated mountain slopes, snowy summits, a broad eastern ocean, waterfalls, wispy clouds, birds, and roaming land animals are generated from a shareable world seed. A city to the west-southwest has streets, towers, and moving cars and trucks. A large coastal waterfall is a landmark near the ocean. A day/night cycle brings a visible sun, moon, and stars. There is no fixed map edge and no automatic flight path for the player bird.

## Play

Open the [live demo](https://wildwing.pages.dev/), then click or tap the start scene or press `Enter`. A browser with WebGL support is required. The site runs entirely in the browser; there is no account or server-side game state.

| Control | Action |
| --- | --- |
| `F` or `W` | Take off; `F` also returns to free flight |
| `W` / `S` | Increase / decrease cruising speed (up to 120 m/s) |
| `A` / `D` | Turn left / right |
| `↑` / `↓` | Climb above the clouds / dive below the trees |
| `Shift` | Maximum speed while held |
| `Space` | Flap for lift |
| `T` | Switch between day and night |
| `M` or click the mini-map | Open or close the large world map |
| `Q` | Quit to the start screen and save progress; resume from the same position |
| Drag the world | Steer the bird |
| `P` | Find a branch and perch |
| `H` | Hunt fish from water |
| `J` | Hunt prey on land |
| `N` | Build the nest in five automatic gathering trips |

Action buttons are available on screen. A hunt, perch, or nest task continues even if a movement key was already held when it started; fresh steering input returns control to you.

On mobile, the playing screen uses a bottom navigation bar. Tap **Fly** to take off or return to free flight. **Move** opens press-and-hold steering, climb, dive, speed, flap, and boost controls; you can also drag the scenery to steer. **Actions** opens perch, hunting, nest, and return-home commands. **World** opens bird and weather choices, the large map, day/night, sound, help, and quit. Tap an open tab again to close it. The start screen keeps the fuller instructions visible.

After takeoff the bird climbs to cloud height and mostly glides. Active lift produces slower, smoother wingbeats. Hunts use a fast diving approach; high branch landings line up for a forward descending glide and flare near the branch. The city center is about 800 m west-southwest of home; open the large map to see the exact distance and face it. Fly north to cross the mountains and find mountain waterfalls, or east to reach the ocean and great waterfall.

The mini-map shows nearby land, water, trees, the home tree, and the bird's heading. Progress is saved locally per seed. The main URL opens the same default world on every visit. Add `?seed=571558` to the URL to open a particular alternate world.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, bug reports, visual checks, asset licensing, and the pull request process. Only the repository owner merges pull requests.

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

- `src/world.js` creates deterministic terrain, lakes, ponds, ocean coastline, mountain ranges, forest biomes, fish, land prey, and home sites.
- `src/simulation.js` owns the bird's flight controls, task navigation, hunting, perching, and nest-building state.
- `src/scene.js` renders streaming terrain tiles, vegetation, water, sky, birds, and the growing nest with Three.js.
- `src/birds.js` defines the selectable bird appearances; `src/weather.js` defines weather presets and precipitation effects.
- `src/ecosystem.js` adds roaming deer, bears, monkeys, foxes, and scattered waterfalls.
- `src/city.js` adds the southwestern downtown, road grid, buildings, cars, and trucks.
- `src/map.js` defines world-map landmarks, bearings, and distances.
- `src/main.js` connects controls, commands, camera, both maps, audio, and local progress.

The environment and birds are procedurally modeled. Trees and ground cover use locally bundled CC0 foliage textures on instanced meshes. Detailed vegetation is limited to nearby terrain tiles; distant tiles use lower-detail terrain.

## License

MIT © Sai Varun Thupakula. See [LICENSE](LICENSE).
