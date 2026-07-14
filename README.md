# Star Defense

A free neon tower-defense browser game. No build step, no dependencies, no accounts — one HTML file, one CSS file, one JS file.

**Survive 50 waves across 5 sectors.** Alien ships fly a glowing lane toward your mothership; build turrets on open tiles to stop them. Kills earn credits to spend on more turrets and upgrades. Every 10th wave is a Dreadnought boss, and every cleared sector swaps in a new map (your turrets are recalled for a full refund).

## The six turrets

| Turret | Cost | Specialty |
|---|---|---|
| 🔫 Pulse Blaster | $50 | Cheap, reliable single-target |
| ❄️ Frost Emitter | $75 | Slows every ship it hits |
| 🌀 Gatling Array | $110 | Very fast fire, shreds light ships |
| 💥 Plasma Mortar | $160 | Lobbed shots with splash damage |
| ⚡ Tesla Coil | $220 | Lightning that chains between ships |
| 🎯 Rail Cannon | $320 | Long range, pierces everything in a line |

Each turret upgrades twice (click a built turret), and sells back for 70% of what you put in. Checkpoints unlock every 10 waves so you don't have to replay from wave 1.

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

## Deploying

Deployed as a Cloudflare **Worker with static assets**, git-connected ("Workers Builds") — every push to `main` triggers an automatic deploy using `wrangler.jsonc`. To set up fresh:

1. Push this repo to GitHub.
2. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Workers** → **Connect to Git**, and select this repo.
3. Cloudflare detects `wrangler.jsonc` automatically — no manual build settings needed.
4. Deploy. You get a free `star-defense.<your-subdomain>.workers.dev` URL, redeployed on every push to `main`.
