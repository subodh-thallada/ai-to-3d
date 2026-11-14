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
- [~] Wait for cluster to be ready → write `MONGODB_URI` → run `npx tsx --env-file=.env src/scripts/check.ts` in `server/`

## 2. Backend / agent pipeline (`server/`)
- [~] Express API (health, catalog, projects CRUD, refine, logs, SSE stream)
- [~] Store: MongoDB (`projects`, `logs` collections) with local JSON-file fallback; seeds from `server/seed/*.json`
- [~] Claude wrapper: forced tool-use structured output, streaming, retries, concurrency limit, token accounting
- [~] Agents: Architect → CAD lead + per-subsystem CAD sub-agents ∥ Sourcing ∥ Electronics → Firmware → Integration → Assembly → Review
- [~] Normalization/repair of every agent output; deterministic review checks
- [ ] Vercel adaptation: `api/` function entry, `waitUntil` for the pipeline, store-polling SSE (works across instances), Mongo client reuse

## 3. Web app (`web/`)
- [~] App shell: Home (prompt + examples + recent projects), Project workspace, Landscape, Component library
- [~] Pipeline panel: live agent tree (sub-agents), timings, tokens, log feed (SSE with polling fallback)
- [~] 3D CAD workspace: primitives + CSG cuts + material presets + 40 procedural component models, part tree, inspector, exploded view, x-ray, edges, joints, STL/GLB/PNG export
- [~] Electronics: schematic (auto-layout, net highlighting), breadboard (deterministic wiring layout), per-pin connection guide + wiring table + CSV, power budget
- [~] Firmware viewer (Prism), BOM table (filters, totals, CSV), Assembly steps linked to 3D highlights, Review report
- [~] Market landscape research page + `docs/LANDSCAPE.md`

## 4. Integration & verification
- [ ] Typecheck all workspaces clean; production build of `web/`
- [ ] Run end-to-end: "Build a 5-inch FPV racing drone" → all tabs populated, 3D renders motors on frame, breadboard wiring complete, firmware pins match netlist
- [ ] Run end-to-end: "Build an iPhone" → display, frame, camera plateau with lenses, logic board, battery, internals
- [ ] Visual check of every tab in the browser (screenshots)
- [ ] Save good runs as seed projects so the gallery is never empty

## 5. Deployment (GitHub + Vercel)
- [ ] `vercel.json` (Vite static output + `api/` serverless function, `maxDuration`, rewrites)
- [ ] Initial commit and push to `github.com/subodh-thallada/ai-to-3d`
- [ ] `vercel link`, connect the GitHub repo, set env vars (ANTHROPIC_API_KEY, MONGODB_URI, MONGODB_DB, MODEL_*)
- [ ] `vercel deploy --prod` and verify a full pipeline run on the production URL

## 6. Docs
- [~] `docs/TASKS.md` (this file)
- [ ] `README.md`: what it is, architecture diagram, local setup, deployment, API, data model
- [ ] `docs/ARCHITECTURE.md`: agent pipeline, prompts, data contract, rendering

## Decisions log
- 2026-11-14: JSON parametric CAD (primitives + CSG cuts + procedural component library) instead of an OpenCascade kernel. It renders instantly in the browser, is robust to LLM output, and exports STL/GLB. B-rep/STEP export would be a future upgrade (e.g. replicad/OpenCascade WASM).
- 2026-11-14: Breadboard layout is computed deterministically from the netlist (not drawn by the LLM), so every wire is guaranteed to match the netlist exactly.
- 2026-11-14: Atlas cluster `allclear` (Sandbox Project) belongs to another app and was left untouched; Protoforge got its own free M0 cluster in a separate project.
