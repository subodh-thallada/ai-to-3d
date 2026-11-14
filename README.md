# Protoforge — prompt → product

Type **"build a drone"** or **"build an iPhone"** and a team of Claude agents designs the whole product end to end:

| Output | What you get in the web app |
|---|---|
| **3D CAD assembly** | Custom parts (plates, arms, housings, frames with boolean cut-outs) plus real purchased components (BLDC motors, props, flight controllers, ESP32/Arduino/Pi boards, LiPo packs, cameras, displays, connectors, screws…) rendered as detailed parametric 3D models, positioned and mated to the frame. Part tree, inspector, exploded view, x-ray, edges, joints overlay, STL / GLB / PNG export. |
| **Electronics** | Full netlist, an auto-laid-out schematic with net highlighting, a **breadboard wiring view** computed deterministically from the netlist (every wire, rail and strip), a per-pin "how to connect" guide, a wiring table (CSV), and a power budget. |
| **Firmware** | Complete multi-file code for the chosen platform (Arduino / ESP32 / Pico / Betaflight config / …) with libraries, build-and-flash steps and a pin map that matches the netlist. |
| **BOM** | Real manufacturers and part numbers, quantities, 2026 prices, supplier search links, mass, and totals by category (CSV). |
| **Assembly** | 10–25 build steps; each step highlights its parts in 3D. |
| **Review** | Deterministic checks (floating parts, dangling nets, pin mismatches, power vs battery, cost/mass) plus a reviewer agent's checks, a 0–100 score and suggestions. |
| **Refinement** | "Make the arms 20% longer and use 6S" re-runs the pipeline with the previous design as context. |

There is also a **market landscape** page researching the companies working on AI → CAD, AI → 3D, AI → PCB and AI → hardware, mapped to the Protoforge capabilities they inspired (`docs/LANDSCAPE.md`), and a **component library** page that renders all 40 parametric models.

## Architecture

```
            ┌──────────────────────── web (Vite + React 19 + three.js / R3F) ───────────────────────┐
 prompt ──► │ Home → Project workspace: Pipeline panel · Overview · 3D CAD · Electronics · Firmware ·  │
            │ BOM · Assembly · Review          (SSE live updates, polling fallback)                   │
            └──────────────┬─────────────────────────────────────────────────────────▲──────────────┘
                           │ REST /api                                                │ snapshots + logs
            ┌──────────────▼──────────── server (Express 5, Node 20) ──────────────────┴──────────────┐
            │  Architect (Opus)                                                                     │
            │     ├─► CAD lead ─► CAD sub-agent × N subsystems (parallel)                            │
            │     ├─► Sourcing agent (BOM)                       } parallel                          │
            │     └─► Electronics agent ─► Firmware agent                                            │
            │  Integration agent (cross-subsystem joints, position fixes, part↔BOM↔netlist links)     │
            │  Assembly agent → Review (deterministic checks + reviewer agent)                       │
            │  normalize.ts repairs every agent output into the shared contract                      │
            └──────────────┬─────────────────────────────────────────────────────────────────────────┘
                           │
                 MongoDB Atlas (projects, logs) — local JSON file store fallback
```

* **Contract**: `shared/src/types.ts` defines the full product spec (CAD parts/joints, brief, BOM, netlist, firmware, assembly, review, agent runs). `shared/src/catalog.ts` defines the parametric component library both the agents and the renderer use.
* **Structured output**: every agent is forced to call a single tool whose JSON Schema mirrors the contract; responses are streamed, retried and normalized.
* **CAD representation**: parametric JSON. Primitives (box with fillets, cylinder, cone, sphere, torus, capsule, plan-view extrusions with holes, lathe, swept tubes), boolean cuts (three-bvh-csg), material presets, and `component` parts drawn by the procedural library.

## Run locally

```bash
npm install
cp server/.env.example server/.env   # fill ANTHROPIC_API_KEY and MONGODB_URI
npm run dev                          # web on http://localhost:5173, API on :8787
```

Production-style single process: `npm run build && npm start` (Express serves `web/dist`).
Connectivity check: `cd server && npx tsx --env-file=.env src/scripts/check.ts`.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API |
| `MONGODB_URI` | — | Atlas connection string (falls back to `server/data/` JSON store if missing or unreachable) |
| `MONGODB_DB` | `protoforge` | database name |
| `MODEL_HEAVY` / `MODEL_FAST` | `claude-opus-5-5` / `claude-sonnet-5-5` | model tiers; per-stage override `MODEL_CAD`, `MODEL_ARCHITECT`, … |
| `PORT` | `8787` | API port |

## Deploy (Vercel)

`vercel.json` runs `npm run vercel-build`, which writes a [Build Output API](https://vercel.com/docs/build-output-api/v3) bundle: the Vite site as static files plus the Express API bundled by esbuild into one Node function (`/api/*`).

```bash
vercel link
vercel env add ANTHROPIC_API_KEY production   # and MONGODB_URI, MONGODB_DB, MODEL_*
vercel deploy --prod
```

Pushes to `main` on GitHub deploy automatically once the repo is connected (`vercel git connect`).

## Docs
* `docs/TASKS.md`: task tracker (done, in progress, to do) and decisions log
* `docs/LANDSCAPE.md`: market research on AI → CAD/3D/electronics/hardware companies
