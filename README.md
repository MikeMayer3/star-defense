# Star Defense

A free neon tower-defense browser game. No build step, no dependencies, no accounts — one HTML file, one CSS file, one JS file.

**Beat all 5 maps.** Each map is a 30-wave campaign level on a 22×13 grid: alien ships fly a glowing lane toward your mothership; build turrets on open tiles to stop them. Your defense persists the whole map — no resets — and enemies scale up relentlessly, so upgrading turrets (tap a built one) and buying the expensive types is the only way through the back half. Bosses hit at waves 10/20/30; auto-checkpoints after each boss mean a defeat resumes from wave 11 or 21 instead of scratch. Clearing a map unlocks the next.

Waves are deterministic (wave N of a map is always the same) and composed of squadron blocks, and the build phase shows a preview of exactly what's coming — tap an enemy chip for its stats. Each map debuts a new enemy that counters a lazy build: Wardens (map 1) carry shields that block the first hits outright (rapid fire strips them), Aegis cruisers (map 2) deflect flat damage per hit (heavy shots punch through), Phantoms (map 3) are cloaked until slowed (Frost sees through), and Menders (map 4) heal nearby ships (pierce and chain reach them mid-pack). Map 5 fields everything at once.

## The seven turrets

| Turret | Cost | Specialty |
|---|---|---|
| 🔫 Pulse Blaster | $50 | Cheap all-rounder — no weakness, no specialty |
| ❄️ Frost Emitter | $75 | Slows ships, reveals Phantoms, extinguishes Brute fire shields |
| 🌀 Gatling Array | $110 | Rapid fire — shreds swarms, strips Warden shields |
| 🛰️ Command Beacon | $140 | Support — boosts damage & fire rate of nearby turrets |
| 💥 Plasma Mortar | $160 | Splash — wipes clusters, hits cloaked ships |
| ⚡ Tesla Coil | $220 | Lightning arcs through a whole pack, hits cloaked ships |
| 🎯 Rail Cannon | $320 | Long-range pierce — busts tanks & armor, overkills chaff |

Each turret upgrades twice (tap a built turret), and sells back for 70% of what you put in. Every enemy type counters a lazy build, so no single turret carries a run — Brutes shrug off non-Frost fire, Wardens eat single big shots (rapid fire strips them), Aegis armor bounces light rounds (heavy shots punch through), Phantoms need splash/arc/Frost, and Menders heal packs (pierce and chain reach them).

## Structure

```
public/            everything served to visitors
  index.html         menus + HUD markup
  style.css          neon UI styles
  game.js            the whole game (canvas, maps, waves, towers, sound)
wrangler.jsonc     Cloudflare Worker config (static assets only)
```

## Local preview

Any static file server works, pointed at `public/`:

```
python3 -m http.server 8080 --directory public
```

Then open `http://localhost:8080`. Add `?debug` to the URL for playtesting cheats (M = +$5000, K = kill wave, J = skip 9 waves).

## Android

The game ships to Android as a Trusted Web Activity (package
`com.allyourbase3.stardefense`) wrapping the live site — the installed app
always runs whatever is deployed, no store update needed for game changes.
The Bubblewrap wrapper project, signing keystore, and build toolchain live
outside this repo (on the Windows dev machine at `C:\Users\Micha\StarDefenseAndroid`).
`public/.well-known/assetlinks.json` holds the signing-cert fingerprints that
let the app run fullscreen; it must list both the local upload key and the
Play App Signing key.

## Deploying

Deployed as a Cloudflare **Worker with static assets**, git-connected ("Workers Builds") — every push to `main` triggers an automatic deploy using `wrangler.jsonc`. To set up fresh:

1. Push this repo to GitHub.
2. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Workers** → **Connect to Git**, and select this repo.
3. Cloudflare detects `wrangler.jsonc` automatically — no manual build settings needed.
4. Deploy. You get a free `star-defense.<your-subdomain>.workers.dev` URL, redeployed on every push to `main`.
