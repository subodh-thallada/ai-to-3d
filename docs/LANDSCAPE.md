# AI-to-Hardware Landscape (Nov 2026)

This report covers companies turning prompts into 3D models, CAD, electronics, firmware and physical products, and what Protoforge takes from them. The structured version used by the app is in `web/src/data/landscape.ts` (`LANDSCAPE`).

**Method.** Each company was checked against its own site or reputable trade and press coverage, with sources listed under each entry. Funding is only given when a source reported it; where sources disagreed, the best-supported figure is used and the conflict is noted. Unknown funding is left out.

## Summary

- **Text-to-CAD has converged on "CAD as code plus an agent loop".** Zoo moved from direct text-to-B-Rep generation to LLM-written KCL code. Its Zookeeper agent then runs the model, looks at multi-view snapshots and checks mass properties before answering. Onshape exposes FeatureScript to agents through an MCP server. Adam ships open-source parametric text-to-CAD (CADAM). Backflip reconstructs feature histories (extrude, revolve) from scans.
- **AI 3D asset generation raised the most money but makes meshes.** These meshes are for games and printing, not engineered assemblies. Meshy raised ~$400M at a $1.5B valuation (Jul 2026). VAST/Tripo raised ~$446M in a Series B/B+ (Sep 2026). The research frontier here is *part-aware* generation, such as Hunyuan3D-Part (P3-SAM segmentation plus part bounding boxes).
- **AI electronics has split into four lanes:**
  - schematic and architecture generation (Circuit Mind ACE, Celus, Flux)
  - physics-driven layout (Quilter)
  - boards defined in code (JITX, atopile, Diode)
  - datasheet-grounded verification (Circuit Mind AVE, Diode, Cadstrom)
- **A 2026 wave of prompt-to-device startups goes end to end:** Confetti (YC F2026), Blueprint (a16z speedrun), Atech (Lovable-led pre-seed) and Atomic Machines ($250M, "prompt-to-product manufacturing"). Flux added AI-generated, board-matched enclosures in Sep 2026.
- **No product we found shows the full stack in one cross-linked view.** That stack is: brief, a CAD assembly built from real purchased components, netlist, auto schematic, breadboard wiring down to each pin, firmware, sourced BOM, assembly steps tied to 3D parts, and a scored engineering review. This is Protoforge's position.

---

## 1. Text-to-CAD / AI CAD

### Zoo: Text-to-CAD, KCL, Zookeeper
- **What it does:** Turns a prompt into a parametric model written in KCL, Zoo's CAD language, with B-Rep or mesh output. Zookeeper (shipped with Design Studio v1.1, Jan 2026) is a conversational CAD agent. It plans, writes, runs and debugs KCL, reviews multi-view snapshots and computes mass, volume, center of mass and surface area. KCL 3.0 shipped in 2026.
- **Key ideas:** code over meshes, so design intent survives edits; a tool-using agent loop with visual self-checks; engineering properties as verification signals.
- **Sources:**
  - https://zoo.dev/research/zookeeper
  - https://docs.zoo.dev/research/introducing-text-to-cad
  - https://zoo.dev/blog
  - https://www.fabbaloo.com/?p=238331

### Adam: AdamCAD / CADAM
- **What it does:** YC W25 startup. Its viral text-to-3D tool is turning into an AI copilot for professional CAD, and the open-source CADAM library generates parametric CAD from prompts.
- **Funding:** $4.1M seed (Oct 2025, led by TQ Ventures).
- **Sources:**
  - https://techcrunch.com/2025/10/31/yc-alum-adam-raises-4-1m-to-turn-viral-text-to-3d-tool-into-ai-copilot/
  - https://adam.new

### Backflip AI
- **What it does:** Founded by the Markforged founders (Greg Mark, David Benhaim). Turns 3D scans and meshes into editable parametric CAD (real extrude and revolve operations), with STEP export, through a web app and a SOLIDWORKS plug-in. Trained on a synthetic dataset of more than 100M geometries.
- **Funding:** $30M (co-led by NEA and a16z, Dec 2024).
- **Sources:**
  - https://siliconangle.com/2024/12/19/ai-powered-3d-modelling-startup-backflip-closes-30m-round/
  - https://develop3d.com/cad/backflip-introduces-mesh-to-cad/
  - https://www.voxelmatters.com/backflip-ai-launches-cad-copilot-that-turns-3d-scans-into-editable-models/

### Leo AI
- **What it does:** Copilot for mechanical engineers. It answers engineering questions grounded in engineering knowledge, recommends off-the-shelf parts and runs calculations. It reports 50k+ engineers on the platform as of early 2026.
- **Funding:** $9.7M total, including a $5M seed led by Flint Capital (2025).
- **Sources:**
  - https://pulse2.com/leo-ai-9-7-million-raised-for-transforming-mechanical-engineering
  - https://www.getleo.ai

### Autodesk: Project Bernini, Neural CAD, Fusion AI
- **What it does:** Project Bernini (May 2024, experimental) generated 3D shapes from text, images, point clouds or voxels and was trained on 10M shapes. Neural CAD (Autodesk University 2025) is a set of foundation models trained on professional CAD data that reason about geometry, topology and constraints. Early features include AutoConstrain in Fusion.
- **Sources:**
  - https://develop3d.com/ai/autodesk-unveils-project-bernini-for-3d-generative-ai/
  - https://develop3d.com/featured/autodesks-ai-blueprint-for-cad/

### Onshape AI Advisor (PTC)
- **What it does:** AI Advisor has been built into the Onshape design environment since Oct 2025 and runs on Amazon Bedrock. Onshape Labs (Jul 2026) adds a FeatureScript MCP Server, so agents can create, test and debug custom CAD features in natural language.
- **Sources:**
  - https://www.onshape.com/en/blog/ai-advisor-artificial-intelligence-cad-engineering-software
  - https://develop3d.com/cad/onshape-release-ai-advisor-for-real-time-guidance/
  - https://www.digitalengineering247.com/article/onshape-ai-advisor-now-embedded-directly-in-the-design-environment

### Siemens NX Copilot
- **What it does:** Natural-language copilot in NX (Jul 2025, now called Designcenter NX Copilot) that turns plain-language requests into NX commands. The Dec 2025 release added AI-based selection of similar faces and edges, and PMI prediction.
- **Sources:**
  - https://www.digitalengineering247.com/article/siemens-brings-ai-copilot-immersive-design-to-nx
  - https://blogs.sw.siemens.com/nx-design/december-2025-release-designcenter-nx-download-now/

### nTop
- **What it does:** Implicit-modeling computational design platform, positioned as the geometry layer AI surrogates run on. One example generated 100+ drone geometries without manual work, with a PhysicsX surrogate making predictions inside nTop.
- **Sources:**
  - https://www.ntop.com/platform/
  - https://www.ntop.com/resources/webinars/ai-accelerated-design-workflows-with-ntop-and-physicsx/

## 2. AI 3D generation

### Meshy
- **What it does:** Text, image and sketch to textured 3D. Meshy 3D Agent (Jul 2026) produces print-ready models. It reports 12M+ users and 100M+ models created.
- **Funding:** ~$400M Series B at a $1.5B valuation (Jul 2026).
- **Sources:**
  - https://3dprintingindustry.com/news/meshy-raises-nearly-400m-at-1-5b-valuation-in-largest-ai-3d-round-to-date-253294/
  - https://www.3dnatives.com/en/meshy-400-million-in-series-b-21072026/

### Tripo (VAST)
- **What it does:** 3D-native foundation models for text and image to 3D, including the Tripo P2.0 preview. Reports about 10M users.
- **Funding:** ~$446M Series B/B+ led by Matrix Partners China (Sep 2026). There were several other 2026 rounds, with conflicting reports.
- **Sources:**
  - https://www.dealstreetasia.com/stories/tripo-ai-series-b-rounds-493956
  - https://develop3d.com/ai/tripo-ai-150-million-funding-for-3d-foundation-models/

### Hyper3D Rodin (Deemos)
- **What it does:** Native 3D generation with quad topology and PBR materials, from text or one to five images. Gen-2.5 released May 2026. The team won a SIGGRAPH 2025 Best Paper.
- **Sources:**
  - https://hyper3d.ai
  - https://help.scenario.com/articles/3791851266-rodin-hyper3d-gen-2-5-models-the-essentials

### Tencent Hunyuan3D: Part and HY3D-Bench
- **What it does:** Hunyuan3D-Part (Sep 2025) has two pieces: P3-SAM segments a mesh into parts with bounding boxes, and X-Part generates complete parts. HY3D-Bench (Feb 2026) is an open dataset of 252k+ watertight meshes with part-level segmentation.
- **Sources:**
  - https://huggingface.co/tencent/Hunyuan3D-Part
  - https://github.com/Tencent-Hunyuan/HY3D-Bench
  - https://www.arxiv.org/pdf/2602.03907

## 3. AI electronics & PCB

### Flux
- **What it does:** Browser-based PCB design. Its agentic release (Oct 2025) designs boards and sources parts from prompts. In Sep 2026 it added AI enclosures: chat-designed and board-matched, with latches, vents and port cutouts. The enclosure updates when components move, and the manufacturing and assembly instructions are rewritten to match.
- **Funding:** $37M total, including a $27M Series B led by 8VC (Feb 2026).
- **Sources:**
  - https://www.flux.ai/blog/we-raised-37m-to-take-the-hard-out-of-hardware
  - https://siliconangle.com/2026/02/27/flux-nabs-37m-automate-printed-circuit-board-development-ai/
  - https://finance.yahoo.com/technology/ai/articles/flux-launches-ai-capabilities-hardware-120000399.html

### Quilter
- **What it does:** Autonomous PCB layout trained with physics-driven reinforcement learning. It returns several physics-tested candidate layouts for a submitted schematic.
- **Funding:** $25M Series B led by Index Ventures (Oct 2025), ~$40M to date.
- **Sources:**
  - https://www.businesswire.com/news/home/20251007165399/en/
  - https://www.quilter.ai

### JITX
- **What it does:** Boards defined as code (Python): requirements, constraints, stackups and rules. AI proposes edits that engineers review.
- **Funding:** $12M Series A led by Sequoia (2022).
- **Sources:**
  - https://www.jitx.com/blog/series-a-announcement
  - https://jitx.com/
  - https://spectrum.ieee.org/startup-jitx-uses-ai-to-automate-complex-circuit-board-design

### Circuit Mind
- **What it does:** ACE turns a block diagram into a schematic, BOM and analysis in minutes. AVE (Oct 2026) uses AI agents to check designs against datasheets and company design rules.
- **Funding:** $25M disclosed Oct 2026 ($18.5M Series A led by Norwest plus a seed round led by Third Prime).
- **Sources:**
  - https://thenextweb.com/news/circuit-mind-25m-funding-ai-circuit-board-design
  - https://iconnect007.com/article/152182/circuit-mind-announces-25m-in-funding-to-accelerate-the-rise-of-electronic-design-intelligence/152179/aep

### Diode Computers
- **What it does:** YC S24 company designing PCBs in code. AI agents cross-reference datasheets to catch errors before a human engineer reviews.
- **Funding:** $11.4M Series A led by a16z (2025). Seed figures conflict between sources.
- **Sources:**
  - https://www.ycombinator.com/companies/diode-computers-inc
  - https://www.pcbdirectory.com/news/diode-computers-develops-ai-powered-tools-to-revolutionize-pcb-design-and-manufacturing

### Celus
- **What it does:** Munich-based platform that automates electronics design from functional blocks: component selection, schematics, BOMs and footprints.
- **Funding:** EUR 25M Series A led by Earlybird (Jul 2022).
- **Sources:**
  - https://techcrunch.com/2022/07/06/celus-which-uses-ai-to-automate-circuit-board-design-raises-25-6m/
  - https://www.celus.io

### SnapMagic (formerly SnapEDA)
- **What it does:** A component library of symbols, footprints and 3D models, plus SnapMagic Copilot (Oct 2023). The copilot suggests reference designs around placed ICs, works as electronics autocomplete, and does text-to-circuit.
- **Sources:**
  - https://blog.snapeda.com/2023/10/04/snapeda-is-now-snapmagic-the-ai-copilot-for-electronics-design/
  - https://techcrunch.com/2023/10/10/snapeda-becomes-snapmagic-and-debuts-an-ai-copilot-to-help-automate-circuit-board-design

### atopile
- **What it does:** Open-source language for describing electronics as code. The compiler emits a BOM, fabrication and assembly data, and reports.
- **Funding:** YC-backed (small convertible note reported by CB Insights).
- **Sources:**
  - https://ycombinator.com/companies/atopile
  - https://atopile.io

## 4. AI hardware product (end to end)

### Confetti
- **What it does:** YC F2026. You describe a device in text or an image, and agents generate and revise the 3D design, pick off-the-shelf components, and help with wiring and firmware. It gives manufacturing quotes and delivers supported 3D-printed parts through print farms.
- **Sources:**
  - https://confetti.build/
  - https://fondo.com/blog/confetti-brings-hardware-design-and-parts-ordering-into-one-conversation

### Blueprint
- **What it does:** Toronto startup and self-described "Lovable for hardware". Prompts become buildable device designs with wiring schematics, mechanical designs and an off-the-shelf BOM. It reported 175k users in three months.
- **Funding:** ~US$1M (CA$1.4M) pre-seed via a16z speedrun.
- **Sources:**
  - https://betakit.com/a16z-backed-blueprint-raises-1-4-million-to-bring-vibe-coding-to-hardware

### Atech
- **What it does:** Copenhagen startup doing "vibe-engineering". Users get a solderless kit of modules and a motherboard, describe a product, and the AI generates the hardware configuration and firmware.
- **Funding:** ~$800K pre-seed led by Lovable, with Sequoia and a16z scout funds (Apr 2026).
- **Sources:**
  - https://tech.eu/2026/04/27/atech-raises-pre-seed-to-unlock-the-next-wave-of-physical-ai-builders
  - https://www.made.dk/artikler/prompting-hardware-prototypes-just-got-way-easier/

### Atomic Machines
- **What it does:** Founded by Jeff Holden. It came out of stealth in Oct 2026 with a "Matter Compiler" that builds micro-machines from code. Its first product is PrimeSwitch, a relay for AI data centers. The stated end goal is prompt-to-product manufacturing.
- **Funding:** $250M total.
- **Sources:**
  - https://thenextweb.com/news/atomic-machines-250m-matter-compiler-micro-machines
  - https://dealroom.co/news/160613-atomic-machines-exits-stealth-with-250m-to-build-machines-from-code/

Also seen but not verified in depth: MakeGPT (https://makegpt.com/) claims prompt-to-module firmware generation.

## 5. Firmware & embedded

### Embedder
- **What it does:** YC S25 AI coding agent for firmware. It reads datasheets, writes production C/C++ and verifies its code in a closed loop on real silicon.
- **Sources:**
  - https://ycombinator.com/companies/embedder
  - https://hn.svelte.dev/item/44915206 (Launch HN)

## 6. Simulation & verification

### Cadstrom
- **What it does:** AI verification for PCBs. It infers design intent, parses datasheet limits, and sets up and runs simulations automatically (continuous testing). It plans to cover certification and system-level verification.
- **Funding:** $6.8M seed (Dec 2024).
- **Sources:**
  - https://www.innovationendeavors.com/insights/our-investment-in-cadstrom-ai-enabled-tooling-for-electrical-engineers
  - https://pulse2.com/cadstrom-ai-expert-system-company-raises-6-8-million-seed/amp/

### Wokwi
- **What it does:** Browser-based simulator for ESP32 (S2, S3, C3, C6), Arduino, Pico and other boards, integrated with Espressif's docs, VS Code and CLion. Projects are described by `diagram.json` (parts and wires) and `wokwi.toml`. LLM workflows already generate these files.
- **Sources:**
  - https://docs.espressif.com/projects/esp-idf/en/latest/esp32/third-party-tools/wokwi.html
  - https://hackernoon.com/how-to-start-robotics-without-hardware-building-a-parking-sensor-with-ai-and-wokwi

### Cirkit Designer
- **What it does:** Browser-based circuit design with AI autowire, AI code generation, a built-in simulator, auto-routed color-coded wires, and diagram and firmware export.
- **Sources:**
  - https://www.cirkitdesigner.com
  - https://medium.com/@cirkit-designer/introducing-cirkit-designer-a0d4817d7ba2

## 7. Sourcing & manufacturing

### Nexar / Octopart
- **What it does:** GraphQL parts API (api.nexar.com/graphql) covering price, stock, lifecycle, lead time, datasheets and CAD models, with up to 100 parts per query. Community MCP servers expose it to AI assistants. Part of the Altium group (Renesas).
- **Sources:**
  - https://resources.altium.com/p/nexar-api-explained
  - https://support.nexar.com/support/solutions/articles/101000541169-octopart-and-nexar-api-unified-data-for-a-better-consistent-experience

### Xometry
- **What it does:** AI Instant Quoting Engine. You upload CAD (STEP, STL, etc.) and get price, lead time and DFM feedback drawn on the model, across CNC, sheet metal, casting and 3D printing.
- **Sources:**
  - https://www.xometry.com/how-xometry-works/
  - https://www.metal-am.com/xometry-upgrades-ai-models-for-custom-manufacturing/

### JLCPCB / EasyEDA
- **What it does:** Documents a workflow where AI coding agents (Claude Code, Codex) drive EasyEDA Pro through an API bridge. The agent resolves real library footprints and symbols, so the BOM maps to parts JLCPCB can source and assemble. A human reviews before ordering.
- **Sources:**
  - https://jlcpcb.com/blog/ai-pcb-design-easyeda

---

## What Protoforge borrows

| Idea | From | Where in Protoforge |
|---|---|---|
| CAD as code, not meshes | Zoo KCL, Adam CADAM, Onshape FeatureScript MCP, JITX, atopile | CAD sub-agents emit typed parametric JSON (primitives, extrude, lathe, tube, library components, CSG cuts, joints), built in the browser with three-bvh-csg |
| Agent loop with verification | Zoo Zookeeper, Diode, Circuit Mind AVE, Cadstrom | Review stage: deterministic checks, then a reviewer agent, giving a scored `ReviewReport` |
| Bounding boxes first, then parts | Hunyuan3D-Part, Circuit Mind ACE (block diagram first) | Architect writes `SubsystemPlan` envelopes plus interface coordinates; one CAD sub-agent per subsystem; integration agent joins them |
| Real parts, never hallucinated | SnapMagic, Nexar/Octopart, JLCPCB agent workflow, Celus | Sourcing agent writes the BOM with part numbers, prices and supplier links; the 40-model procedural component library renders real parts in 3D |
| Electro-mechanical co-design | Flux enclosures, Confetti | Integration agent links `CadPart.electronicsId`, `CadPart.bomId` and `EComponent.cadPartIds` |
| Breadboard autowire and wiring guide | Cirkit Designer, Wokwi | Deterministic breadboard layout and a per-pin connection guide |
| Firmware from the real pin map | Embedder, Atech | Firmware agent writes a `FirmwareSpec` with a `pinMap` consistent with the nets |
| Conversational refinement | Zookeeper, Adam, Meshy 3D Agent | `POST /api/projects/:id/refine` and `project.revisions` |
| Docs that follow the design | Flux (assembly instructions regenerate on change) | Assembly agent regenerates `AssemblyStep[]` tied to `CadPart` ids on every run |

## Where Protoforge differs

1. **Breadth in one cross-linked model.** Competitors cover one or two disciplines: CAD (Zoo, Adam, Backflip), boards (Flux, Quilter, JITX), or meshes (Meshy, Tripo). Protoforge produces mechanical, electrical, firmware, sourcing, assembly and review output in one project, and every artifact references the others by id.
2. **Assemblies built from purchased components.** Mesh generators output one blob. Protoforge assembles custom parts *and* catalog models of real motors, boards and batteries, joined with typed mates, so the exploded view, x-ray and assembly steps mean something physically.
3. **Visible orchestration.** The multi-agent pipeline (architect, then parallel CAD sub-agents, sourcing and electronics, then firmware, integration, assembly and review) streams live over SSE. Each agent's role, status and logs are visible, while most competitors hide one opaque model.
4. **Built for makers.** The breadboard wiring guide, pin by pin, targets someone building the first prototype on a bench. Most of the ECAD market targets professional PCB layout.
5. **Deliberate limits.** Protoforge does not do physics-driven PCB layout (Quilter), B-Rep/STEP kernels (Zoo, Backflip, Autodesk), or manufacturing fulfilment (Xometry, JLCPCB, Confetti print farms). It exports STL/GLB and hands off from there.

## Next ideas from the research (not yet in Protoforge)

1. **Wokwi export.** Generate `diagram.json` and `wokwi.toml` from `ElectronicsSpec` and `FirmwareSpec`, so the generated firmware can be simulated in the browser before buying parts.
2. **Multi-view render self-check and mass properties.** Following Zookeeper, render the assembly from four or more views, pass the images to the reviewer agent to catch floating or intersecting parts, and compute volume, mass and center of mass (for example center of gravity vs thrust axis on a drone) as deterministic checks.
3. **Datasheet-grounded electrical rules** (Circuit Mind AVE, Diode, Cadstrom). Per-pin absolute-max and logic-level checks (3.3 V vs 5 V), GPIO current limits (an LED or motor without a resistor or driver), I2C pull-ups, decoupling capacitors.
4. **Editable parametric source export** (Zoo, Adam, Onshape). Turn the JSON CAD into OpenSCAD, CadQuery or KCL text so users can keep editing in a real parametric tool.
5. **Live BOM validation and fab-ready files** (Nexar/Octopart, JLCPCB). Resolve each part number through the Nexar GraphQL API for stock, price and lifecycle, and export JLCPCB-style BOM CSVs.
