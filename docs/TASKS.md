# Protoforge — task tracker

Single source of truth for what is done, in progress and still to do. Updated as work lands.
Legend: `[x]` done & verified · `[~]` in progress · `[ ]` to do · `[!]` blocked / needs the user

## 0. Foundations
- [x] Monorepo with npm workspaces: `shared/` (types + catalog), `server/` (Express + agents), `web/` (Vite + React + R3F)
- [x] Product-spec contract `shared/src/types.ts` (CAD, brief, BOM, electronics, firmware, assembly, review, agents, project)
- [x] Parametric component catalog `shared/src/catalog.ts` (40 models: motors, props, boards, batteries, cameras, displays, connectors, fasteners…)
- [x] Secrets kept in gitignored `server/.env` (template: `server/.env.example`)
- [x] Anthropic API key verified (claude-opus-5-5 and claude-sonnet-5-5 both respond)

## 1. MongoDB Atlas
- [!] Pasted URI (`cluster0.rn8xse`, user `Caesar`): authentication failed, and that cluster is not in any org visible to the logged-in Atlas CLI account
- [x] Created a dedicated free **M0 cluster `protoforge`** (AWS us-east-1) in Atlas org "Subodh's Org", project "Project 0" (`6782ca53fb1b4d78f183700f`)
- [x] DB user `protoforge_app` with `readWrite@protoforge` only (password generated, stored only in `server/.env` and Vercel env)
- [x] Network access `0.0.0.0/0` on that project (required: Vercel serverless functions have no fixed egress IPs)
- [x] Cluster ready; `MONGODB_URI` set in `server/.env` and Vercel; `check.ts` passes
- [x] Fallback to public DNS resolvers when the local router drops SRV queries (`querySrv ENODATA`)
- [x] Imported robot, drone and iPhone projects into MongoDB (`server/src/scripts/import.ts`)

## 2. Backend / agent pipeline (`server/`)
- [x] Express API (health, catalog, projects CRUD, refine, logs, SSE stream)
- [x] Store: MongoDB (`projects`, `logs` collections) with local JSON-file fallback; seeds from `server/seed/*.json`
- [x] Claude wrapper: forced tool-use structured output, streaming, retries, concurrency limit, token accounting
- [x] Agents: Architect → CAD lead + per-subsystem CAD sub-agents ∥ Sourcing ∥ Electronics → Firmware → Integration → Assembly → Review
- [x] Normalization/repair of every agent output; deterministic review checks
- [x] Vercel adaptation: `server/src/vercel.ts` entry, `app.ts` shared app, `waitUntil`, resumable pipeline with an atomic Mongo lease (each invocation ≤ 300 s; the next request resumes from the last finished agent), store-polling SSE, Mongo client reuse

## 3. Web app (`web/`)
- [x] App shell: Home (prompt + examples + recent projects), Project workspace, Landscape, Component library
- [x] Pipeline panel: live agent tree (sub-agents), timings, tokens, log feed (SSE with polling fallback)
- [x] 3D CAD workspace: primitives + CSG cuts + material presets + 40 procedural component models, part tree, inspector, exploded view, x-ray, edges, joints, STL/GLB/PNG export
- [x] Electronics: schematic (auto-layout, net highlighting), breadboard (deterministic wiring layout), per-pin connection guide + wiring table + CSV, power budget
- [x] Firmware viewer (Prism), BOM table (filters, totals, CSV), Assembly steps linked to 3D highlights, Review report
- [x] Market landscape research page + `docs/LANDSCAPE.md`

## 4. Integration & verification
- [x] Typecheck all workspaces clean; production build of `web/`
- [x] Run end-to-end: "Build a 5-inch FPV racing drone" (all 13 agents done, 103 parts, ~6 min) → all tabs populated, 3D renders motors on frame, breadboard wiring complete, firmware pins match netlist
- [~] Run end-to-end: "Build an iPhone" (97 parts; integration + assembly hit local network errors — re-run on Vercel) → display, frame, camera plateau with lenses, logic board, battery, internals
- [ ] Visual check of every tab in the browser (CAD viewer + library verified by the CAD builder; full pass pending)
- [x] Seed project `server/seed/robot.json`; drone/iPhone/robot stored in MongoDB

## 5. Deployment (GitHub + Vercel)
- [x] `vercel.json` + `scripts/build-vercel.mjs` (Build Output API: static site + bundled Express function, Node 22, maxDuration 300)
- [x] Initial commit and push to `github.com/subodh-thallada/ai-to-3d`
- [x] `vercel link` (project `protoforge`), GitHub repo connected (push to main deploys), env vars set for production/preview/development
- [~] Production deploy from GitHub (first build failed: Vercel discontinued nodejs20.x → switched to nodejs22.x) → verify a full pipeline run on the production URL

## 6. Docs
- [~] `docs/TASKS.md` (this file)
- [x] `README.md`: what it is, architecture diagram, local setup, deployment, API, data model
- [ ] `docs/ARCHITECTURE.md`: agent pipeline, prompts, data contract, rendering

## Known issues / next
- Local network here drops long uploads and DNS intermittently (git push / `vercel deploy` uploads failed several times); deploying via GitHub integration avoids local uploads.
- Research ideas not yet built (see `docs/LANDSCAPE.md`): Wokwi `diagram.json` export for in-browser simulation, multi-view render self-check by the reviewer (vision), STEP export via OpenCascade WASM.

## Decisions log
- 2026-11-14: JSON parametric CAD (primitives + CSG cuts + procedural component library) instead of an OpenCascade kernel. It renders instantly in the browser, is robust to LLM output, and exports STL/GLB. B-rep/STEP export would be a future upgrade (e.g. replicad/OpenCascade WASM).
- 2026-11-14: Breadboard layout is computed deterministically from the netlist (not drawn by the LLM), so every wire is guaranteed to match the netlist exactly.
- 2026-11-14: Atlas cluster `allclear` (Sandbox Project) belongs to another app and was left untouched; Protoforge got its own free M0 cluster in a separate project.
- 2026-11-14: Vercel Hobby caps functions at 300 s while a full run takes ~6 min, so the pipeline is resumable: every agent result is persisted, an atomic lease marks the owning invocation, and any request for a stalled project takes the lease and continues.
