/**
 * Market landscape: companies turning AI into 3D models, CAD, electronics and
 * physical products. Researched Nov 2026 from company sites and trade press;
 * full source list lives in docs/LANDSCAPE.md. Funding figures are only listed
 * where a reputable source reported them; otherwise the field is omitted.
 */

export interface LandscapeCompany {
  name: string;
  url: string;
  category: string;
  description: string;
  keyIdeas: string[];
  funding?: string;
  protoforgeIntegration: string;
}

export interface Landscape {
  updated: string;
  summary: string;
  companies: LandscapeCompany[];
  integrations: { capability: string; inspiredBy: string[]; whereInProtoforge: string }[];
}

export const LANDSCAPE: Landscape = {
  updated: "2026-11-14",
  summary:
    "AI-for-hardware has split into narrow, well-funded lanes. Text-to-CAD tools (Zoo, Adam, Backflip, Leo, Autodesk Neural CAD, Onshape AI Advisor) converged on one lesson: generate editable, parametric code or feature trees, not meshes, and verify the result in an agent loop. AI 3D asset generators (Meshy, Tripo, Rodin, Hunyuan3D) raised the largest rounds of 2026 but output meshes aimed at games and printing, not engineered assemblies. AI electronics (Flux, Quilter, JITX, Circuit Mind, Diode, Celus, atopile, Cadstrom) splits into schematic generation, physics-driven layout, code-defined boards and datasheet-grounded verification. A new 2026 wave of prompt-to-device startups (Confetti, Blueprint, Atech, Atomic Machines) chases the end-to-end path, and Flux added AI enclosure generation in Sep 2026. No player we found ships the full stack Protoforge targets in one view: brief, CAD assembly built from real purchased components, netlist, schematic, breadboard wiring, firmware, sourced BOM, assembly steps and engineering review, all cross-linked by part id.",
  companies: [
    // ---------------------------------------------------------------- Text-to-CAD / AI CAD
    {
      name: "Zoo (Text-to-CAD, KCL, Zookeeper)",
      url: "https://zoo.dev",
      category: "Text-to-CAD",
      description:
        "Formerly KittyCAD. Text-to-CAD turns a prompt into a parametric model written in KCL, Zoo's own CAD programming language, with B-Rep or mesh output. Zookeeper, a conversational CAD agent in Zoo Design Studio (Jan 2026), plans, writes and runs KCL, inspects multi-view snapshots and computes mass properties. KCL 3.0 shipped in 2026.",
      keyIdeas: [
        "Generate CAD as code (KCL) so output stays editable and keeps design intent",
        "Agent loop: plan, call tools, run the model, look at multi-view snapshots, fix, repeat",
        "Tools return engineering properties (mass, volume, center of mass, surface area) for self-checking",
        "Moved from direct text-to-B-Rep generation to LLM-written code over a geometry engine",
      ],
      protoforgeIntegration:
        "Protoforge's CAD sub-agents use the same code-as-CAD idea: they emit parametric JSON (primitives, CSG cuts, joints) instead of meshes. Each subsystem runs as its own agent, and the review stage re-checks the geometry with deterministic tests, much like Zookeeper's self-verification.",
    },
    {
      name: "Adam (AdamCAD / CADAM)",
      url: "https://adam.new",
      category: "Text-to-CAD",
      description:
        "YC W25 startup whose text-to-3D tool went viral and which is now building an AI copilot for professional CAD. Its open-source CADAM library generates parametric CAD models from natural-language prompts.",
      keyIdeas: [
        "Parametric output with exposed parameters the user can tweak after generation",
        "Chat-driven iteration on an existing model rather than one-shot generation",
        "Open-source text-to-CAD core (CADAM) to build community and trust",
      ],
      funding: "$4.1M seed (Oct 2025, led by TQ Ventures)",
      protoforgeIntegration:
        "Matches Protoforge's refine loop: POST /api/projects/:id/refine re-runs the pipeline with the previous brief plus a new instruction and logs a revision. Each CadPart keeps editable dimensions in its JSON geometry.",
    },
    {
      name: "Backflip AI",
      url: "https://www.backflip.ai",
      category: "Text-to-CAD",
      description:
        "Founded by the Markforged founders. It started with text-to-3D-printable models and now turns 3D scans and meshes into editable parametric CAD (extrudes, revolves) with STEP export, through a web app and a SOLIDWORKS plug-in. Its models are trained on a synthetic dataset of more than 100M geometries.",
      keyIdeas: [
        "Reconstruct a feature history (extrude, revolve) rather than triangles",
        "Train on huge synthetic datasets of procedurally generated geometry",
        "Meet engineers inside their existing CAD tool (plug-in) and through STEP",
      ],
      funding: "$30M (Dec 2024, co-led by NEA and a16z)",
      protoforgeIntegration:
        "Protoforge also builds geometry from feature-like primitives (box, cylinder, extrude, CSG cuts), and its 40-model procedural component library is a hand-built version of procedural geometry generation. STL/GLB export covers the hand-off to slicers and DCC tools.",
    },
    {
      name: "Leo AI",
      url: "https://www.getleo.ai",
      category: "Text-to-CAD",
      description:
        "Copilot for mechanical engineers. It answers engineering questions, suggests standard parts and runs calculations, grounded in engineering knowledge and a company's own design data. It reports more than 50k engineers on the platform as of early 2026.",
      keyIdeas: [
        "Ground answers in engineering references and catalogs, not general web text",
        "Recommend off-the-shelf parts (fasteners, bearings, motors) during design",
        "Engineering calculations alongside geometry",
      ],
      funding: "$9.7M total incl. $5M seed led by Flint Capital (2025)",
      protoforgeIntegration:
        "Protoforge's sourcing agent picks real off-the-shelf parts with part numbers. Its catalog gives agents a fixed vocabulary of purchasable components (motors, boards, batteries), so the 3D models match the BOM.",
    },
    {
      name: "Autodesk (Project Bernini, Neural CAD, Fusion AI)",
      url: "https://www.autodesk.com/solutions/autodesk-ai",
      category: "Text-to-CAD",
      description:
        "Project Bernini (2024) was an experimental model that generates 3D shapes from text, images, point clouds or voxels, trained on 10M shapes. Neural CAD (Autodesk University 2025) is a set of foundation models trained on professional CAD data that reason about geometry, topology and constraints. Early features include AutoConstrain in Fusion.",
      keyIdeas: [
        "Separate shape from function: generate functional geometry, not just appearance",
        "Foundation models trained on B-Rep and feature data, not meshes",
        "AI adds constraints and relationships to sketches (AutoConstrain)",
      ],
      funding: "Public company (NASDAQ: ADSK)",
      protoforgeIntegration:
        "Protoforge records relationships explicitly: typed joints and mates (fastened, threaded, revolute, snap-fit, etc.) between parts, interface coordinates from the architect, and fixes applied by the integration agent. This is a lightweight, inspectable stand-in for learned constraints.",
    },
    {
      name: "Onshape AI Advisor (PTC)",
      url: "https://www.onshape.com/en/blog/ai-advisor-artificial-intelligence-cad-engineering-software",
      category: "Text-to-CAD",
      description:
        "AI Advisor is built into the cloud-native Onshape CAD/PDM environment (Oct 2025) and gives real-time modeling guidance. Onshape Labs (Jul 2026) adds a FeatureScript MCP Server, so agents can create, test and debug custom CAD features in natural language.",
      keyIdeas: [
        "Expose the CAD kernel to agents through MCP tools",
        "Natural language to FeatureScript (code-defined features)",
        "Guidance in context, inside the modeling session",
      ],
      funding: "Part of PTC (public)",
      protoforgeIntegration:
        "Protoforge runs as a cloud web app like Onshape. Its agents write a typed JSON CAD format that the viewer turns into geometry with three-bvh-csg, and the workspace inspector shows each part's agent-written description and fabrication notes.",
    },
    {
      name: "Siemens NX Copilot",
      url: "https://blogs.sw.siemens.com/nx-design/",
      category: "Text-to-CAD",
      description:
        "Natural-language copilot in NX (introduced Jul 2025, now called Designcenter NX Copilot). It turns plain-language requests into NX commands and gives best-practice guidance. Recent releases added AI-based selection of similar faces and edges, and PMI prediction.",
      keyIdeas: [
        "Map natural language onto existing deterministic CAD commands",
        "Embed industry best practices as guidance",
        "AI-assisted selection and annotation (PMI)",
      ],
      funding: "Part of Siemens (public)",
      protoforgeIntegration:
        "Protoforge also sends LLM output into deterministic machinery: the schematic layout, breadboard wiring and review checks are computed by code from the agent's structured spec, never drawn freely by the model.",
    },
    {
      name: "nTop",
      url: "https://www.ntop.com",
      category: "Text-to-CAD",
      description:
        "Computational design platform built on implicit modeling, where geometry is a mathematical field that never breaks under large parameter changes. nTop positions itself as the geometry layer AI surrogate models run on, for example generating 100+ drone geometries automatically with a PhysicsX surrogate.",
      keyIdeas: [
        "Robust geometry kernel so automated parameter sweeps never fail",
        "Couple generative geometry with AI physics surrogates",
        "Design-space exploration instead of a single design",
      ],
      protoforgeIntegration:
        "Protoforge's primitive and CSG representation is chosen for the same reason: generated parameters always produce valid, renderable geometry, so an agent can never emit an unbuildable model.",
    },
    // ---------------------------------------------------------------- AI 3D generation
    {
      name: "Meshy",
      url: "https://www.meshy.ai",
      category: "AI 3D generation",
      description:
        "Text, image and sketch to textured 3D models for games, film and 3D printing. In Jul 2026 it launched Meshy 3D Agent, which produces print-ready models, and raised the largest AI-3D round to date. It reports 12M+ users and 100M+ models created.",
      keyIdeas: [
        "Agentic generation with print-readiness checks (watertight, printable)",
        "Fast preview then refine/texture pass",
        "Huge consumer funnel feeding data flywheel",
      ],
      funding: "~$400M Series B at $1.5B valuation (Jul 2026)",
      protoforgeIntegration:
        "Protoforge targets engineered assemblies instead of single meshes. Each part is its own solid with a material, mass and fabrication note, and the model exports as STL/GLB so custom parts can go to a 3D printer.",
    },
    {
      name: "Tripo (VAST)",
      url: "https://www.tripo3d.ai",
      category: "AI 3D generation",
      description:
        "3D-native foundation models for text and image to 3D, including the Tripo P2.0 preview. Reports about 10M users and 90k studios and companies. Raised several rounds during 2026.",
      keyIdeas: [
        "3D-native foundation models rather than 2D-lifted geometry",
        "Clean topology and part-aware output for downstream editing",
        "API-first distribution into DCC tools and engines",
      ],
      funding: "~$446M Series B/B+ led by Matrix Partners China (Sep 2026)",
      protoforgeIntegration:
        "Protoforge gets part-aware output by construction: every subsystem is generated as named parts tied together with joints, so exploded view, x-ray and per-part selection work without segmenting a mesh afterwards.",
    },
    {
      name: "Hyper3D Rodin (Deemos)",
      url: "https://hyper3d.ai",
      category: "AI 3D generation",
      description:
        "Native 3D generative models (Rodin Gen-1.5, Gen-2 and Gen-2.5 in May 2026) that output quad-mesh topology with PBR materials, from text or one to five reference images. The team won a SIGGRAPH 2025 Best Paper.",
      keyIdeas: [
        "Quad topology and PBR materials ready for production pipelines",
        "Multi-image conditioning for fidelity",
        "Tiered quality and speed (fast vs high-poly) per generation",
      ],
      protoforgeIntegration:
        "Protoforge applies PBR material presets (aluminum, ABS, carbon fiber, PCB green, glass, rubber, etc.) to each CAD part, and lets users switch between full rendering and x-ray.",
    },
    {
      name: "Tencent Hunyuan3D (Part / HY3D-Bench)",
      url: "https://github.com/Tencent-Hunyuan/HY3D-Bench",
      category: "AI 3D generation",
      description:
        "Open 3D generation ecosystem. Hunyuan3D-Part (Sep 2025) segments a mesh into semantic parts with bounding boxes (P3-SAM) and generates complete parts (X-Part). HY3D-Bench (Feb 2026) released 252k+ watertight meshes with part-level segmentation.",
      keyIdeas: [
        "Part segmentation plus per-part bounding boxes as the bridge from blob to assembly",
        "Open datasets with part-level annotations",
        "Controllable part generation conditioned on boxes",
      ],
      funding: "Tencent (public)",
      protoforgeIntegration:
        "Protoforge's architect agent works the same way in reverse. It first lays out subsystem envelopes (center plus size boxes) and interface coordinates, then a CAD sub-agent fills each box with parts.",
    },
    // ---------------------------------------------------------------- AI electronics & PCB
    {
      name: "Flux",
      url: "https://www.flux.ai",
      category: "AI electronics & PCB",
      description:
        "Browser-based PCB design with an AI agent that designs circuit boards and sources parts from natural-language prompts (agentic release Oct 2025). In Sep 2026 it added AI enclosure generation: chat-designed, board-matched 3D-printable enclosures with latches, vents and port cutouts that update when components move. It also rewrites assembly instructions to match.",
      keyIdeas: [
        "One browser tab from prompt to board to enclosure",
        "Enclosure geometry derived from the real board outline and connectors",
        "Docs (manufacturing and assembly instructions) regenerate when the design changes",
        "Agent sources real parts while designing",
      ],
      funding: "$37M total incl. $27M Series B led by 8VC (Feb 2026)",
      protoforgeIntegration:
        "This is the closest product to Protoforge's electro-mechanical link. The integration agent ties every EComponent to its CadPart (cadPartIds and electronicsId), so boards, motors and batteries sit inside the CAD frame. Assembly steps are regenerated on every refine.",
    },
    {
      name: "Quilter",
      url: "https://www.quilter.ai",
      category: "AI electronics & PCB",
      description:
        "Autonomous PCB layout trained with physics-driven reinforcement learning. Engineers submit a schematic and get several physics-checked layout candidates to choose from. It showed a computer whose board was designed by AI.",
      keyIdeas: [
        "Reinforcement learning against physics rewards instead of imitation of human layouts",
        "Return several candidate designs, let the engineer pick",
        "Fit into existing EDA flows (import schematic, export layout)",
      ],
      funding: "$25M Series B led by Index Ventures (Oct 2025); ~$40M to date",
      protoforgeIntegration:
        "Protoforge's breadboard placement and wire routing is deterministic and rule-based, so the same netlist always gives the same buildable layout. Its review stage scores the result against hard checks.",
    },
    {
      name: "JITX",
      url: "https://www.jitx.com",
      category: "AI electronics & PCB",
      description:
        "Circuit boards written as code. Requirements, constraints, stackups and engineering rules are expressed in Python, and AI proposes edits that engineers review. Customers include Honeywell Aerospace, Lockheed Martin and OpenAI.",
      keyIdeas: [
        "Hardware as code makes designs diffable, reviewable and generatable",
        "Encode engineering rules as constraints that the compiler enforces",
        "AI proposes, human approves",
      ],
      funding: "$12M Series A led by Sequoia (2022)",
      protoforgeIntegration:
        "Protoforge's ElectronicsSpec is a typed, code-like netlist (components, typed pins, typed nets with voltages). The schematic, breadboard view, connection guide and power budget are all compiled from it.",
    },
    {
      name: "Circuit Mind",
      url: "https://www.circuitmind.io",
      category: "AI electronics & PCB",
      description:
        "London-based maker of ACE, which turns a hardware block diagram into a schematic, BOM and supporting analysis in minutes, and AVE (launched Oct 2026), where AI agents check circuit designs against component datasheets and company design rules.",
      keyIdeas: [
        "Block diagram first, then schematic: a requirements-to-architecture step",
        "Agents verify designs against datasheets, not just ERC",
        "BOM produced together with the schematic",
      ],
      funding: "$25M disclosed Oct 2026 ($18.5M Series A led by Norwest + seed led by Third Prime)",
      protoforgeIntegration:
        "Protoforge follows the same order: the architect writes a brief with subsystems, then the electronics agent writes the netlist, then the auto-schematic is drawn. The review stage adds deterministic electrical checks (unconnected pins, power budget vs supply) plus an agent reviewer.",
    },
    {
      name: "Diode Computers",
      url: "https://www.ycombinator.com/companies/diode-computers-inc",
      category: "AI electronics & PCB",
      description:
        "YC S24 company that designs PCBs with code. AI agents cross-reference component datasheets to catch errors before an experienced engineer reviews the final design.",
      keyIdeas: [
        "Code-defined boards as the agent's working medium",
        "Datasheet cross-referencing as an automated reviewer",
        "Human sign-off as the last gate",
      ],
      funding: "$11.4M Series A led by a16z (2025)",
      protoforgeIntegration:
        "This mirrors Protoforge's last two stages: deterministic checks and an agent reviewer produce a scored ReviewReport with pass, warn and fail items that a person reads before building.",
    },
    {
      name: "Celus",
      url: "https://www.celus.io",
      category: "AI electronics & PCB",
      description:
        "Munich-based platform that automates electronics design from functional requirements. Users describe the system as functional blocks and Celus selects components and generates schematics, BOMs and footprints.",
      keyIdeas: [
        "Functional-block canvas as the design entry point",
        "Automatic component selection tied to supply data",
        "Outputs straight into existing ECAD tools",
      ],
      funding: "EUR 25M Series A led by Earlybird (2022)",
      protoforgeIntegration:
        "Protoforge's sourcing agent fills a BOM with manufacturers, part numbers, prices and alternatives, and links each line to supplier search pages.",
    },
    {
      name: "SnapMagic (formerly SnapEDA)",
      url: "https://www.snapmagic.com",
      category: "AI electronics & PCB",
      description:
        "Large library of symbols, footprints and 3D models (SnapMagic Search), plus SnapMagic Copilot (2023). The copilot proposes manufacturer reference designs when an IC is placed, works as electronics autocomplete, and generates circuits from text.",
      keyIdeas: [
        "Proprietary component data as the moat for generation",
        "Reference designs suggested automatically around key ICs",
        "Electronics autocomplete inside existing ECAD",
      ],
      protoforgeIntegration:
        "Protoforge's 40-model procedural component library (catalog.ts) has the same role as SnapMagic's 3D model library. Real purchased parts render with correct proportions, mounting features and pin headers, so wiring and assembly can reference them.",
    },
    {
      name: "atopile",
      url: "https://atopile.io",
      category: "AI electronics & PCB",
      description:
        "YC-backed open-source language for describing electronics as code. Its toolchain compiles designs to a BOM, fabrication and assembly data, and reports that can be sent to a manufacturer.",
      keyIdeas: [
        "Reusable, versioned circuit modules",
        "Compiler emits manufacturing outputs directly",
        "Open source to build an ecosystem of modules",
      ],
      funding: "YC-backed",
      protoforgeIntegration:
        "Protoforge also compiles one typed source of truth into several outputs. Netlist, BOM, firmware pin map and assembly steps are generated from the same project and cross-referenced by id.",
    },
    // ---------------------------------------------------------------- AI hardware product (end to end)
    {
      name: "Confetti",
      url: "https://confetti.build",
      category: "AI hardware product",
      description:
        "YC Fall 2026 AI workbench. You describe a device in text or an image, and agents generate and revise the 3D design, find off-the-shelf components, help with wiring and firmware, and get manufacturing quotes. Supported parts can be 3D printed through print farms.",
      keyIdeas: [
        "One conversation from idea to ordered parts",
        "Agents per discipline (CAD, sourcing, firmware)",
        "Close the loop with fulfilment (print farms, quotes)",
      ],
      funding: "YC F2026",
      protoforgeIntegration:
        "Confetti's workflow is the closest match to Protoforge's. Protoforge adds visible multi-agent orchestration (per-subsystem CAD sub-agents with live logs over SSE), pin-by-pin breadboard wiring, and a scored engineering review.",
    },
    {
      name: "Blueprint",
      url: "https://betakit.com/a16z-backed-blueprint-raises-1-4-million-to-bring-vibe-coding-to-hardware",
      category: "AI hardware product",
      description:
        "Toronto startup that calls itself the 'Lovable for hardware'. It turns text prompts into buildable device designs, with wiring schematics, mechanical designs and a list of off-the-shelf parts. It reported 175k users in three months.",
      keyIdeas: [
        "Vibe-coding UX applied to physical devices",
        "Only use off-the-shelf parts so designs are buildable today",
        "BOM as a first-class output",
      ],
      funding: "~US$1M (CA$1.4M) pre-seed via a16z speedrun (2026)",
      protoforgeIntegration:
        "Protoforge targets the same prompt-to-device flow and makes buildability explicit. Every electronic part maps to a BOM line with a part number, and the breadboard guide tells a maker exactly which hole each wire goes into.",
    },
    {
      name: "Atech",
      url: "https://tech.eu/2026/04/27/atech-raises-pre-seed-to-unlock-the-next-wave-of-physical-ai-builders",
      category: "AI hardware product",
      description:
        "Copenhagen startup doing 'vibe-engineering' for hardware. Users buy a kit of solderless modules (sensors, cameras) and a motherboard, describe a product, and the AI generates the hardware configuration and firmware for a working prototype.",
      keyIdeas: [
        "Constrain the hardware space to known modules so generation always works",
        "Firmware generated against a fixed, known pinout",
        "Prototype in minutes, production later",
      ],
      funding: "~$800K pre-seed led by Lovable (Apr 2026)",
      protoforgeIntegration:
        "Protoforge also constrains generation to a known component catalog with fixed pin definitions. The firmware agent writes code against the exact pin map from the electronics netlist.",
    },
    {
      name: "Atomic Machines",
      url: "https://thenextweb.com/news/atomic-machines-250m-matter-compiler-micro-machines",
      category: "AI hardware product",
      description:
        "Founded by Jeff Holden (ex-Amazon Prime, Uber CPO). It came out of stealth in Oct 2026 with a 'Matter Compiler' that builds working micro-machines from code. Its first product is PrimeSwitch, a fast relay for AI data centers, and its stated long-term goal is prompt-to-product manufacturing.",
      keyIdeas: [
        "Compile designs straight to physical output (matter compiler)",
        "Vertical integration of design and fabrication",
        "Prompt-to-product manufacturing as the end state",
      ],
      funding: "$250M total (disclosed Oct 2026)",
      protoforgeIntegration:
        "Protoforge stops at a complete, sourced, buildable design package (CAD, BOM, wiring, firmware, assembly steps). It is the design front-end that vibe-manufacturing systems like this one would consume.",
    },
    // ---------------------------------------------------------------- Firmware
    {
      name: "Embedder",
      url: "https://www.ycombinator.com/companies/embedder",
      category: "Firmware & embedded",
      description:
        "YC S25 AI coding agent for firmware. It reads datasheets, writes production C/C++ and verifies its own code in a closed loop on real hardware.",
      keyIdeas: [
        "Datasheet-grounded code generation (registers, timing)",
        "Hardware-in-the-loop verification of generated firmware",
        "Agent specialised for embedded toolchains",
      ],
      funding: "YC S25",
      protoforgeIntegration:
        "Protoforge's firmware agent starts once the electronics spec is finished. It writes complete multi-file firmware with libraries, build steps and a pin map that matches the netlist, so the generated code fits the generated wiring.",
    },
    // ---------------------------------------------------------------- Simulation
    {
      name: "Cadstrom",
      url: "https://cadstrom.io",
      category: "Simulation & verification",
      description:
        "AI verification for electronics. It reads a PCB design to infer what each part is meant to do, parses datasheets for operating limits, then sets up and runs simulations automatically for continuous testing. Plans include certification and system-level verification.",
      keyIdeas: [
        "Infer design intent from the design itself",
        "Extract operating limits from datasheets automatically",
        "Make simulation continuous, like CI for hardware",
      ],
      funding: "$6.8M seed (Dec 2024)",
      protoforgeIntegration:
        "Protoforge re-runs its whole deterministic check suite on every pipeline run and every refine, like CI. The checks cover power draw vs supply, electrical consistency, and cross-references between CAD, BOM and electronics.",
    },
    {
      name: "Wokwi",
      url: "https://wokwi.com",
      category: "Simulation & verification",
      description:
        "Browser-based simulator for ESP32, Arduino, Raspberry Pi Pico and other microcontrollers, integrated into Espressif's docs, VS Code and CLion. Projects are described by diagram.json (parts and wires) plus wokwi.toml, a format LLM workflows already generate.",
      keyIdeas: [
        "Text-based circuit description (diagram.json) that AI can generate",
        "Run real firmware binaries against simulated peripherals",
        "CI-friendly headless simulation",
      ],
      protoforgeIntegration:
        "Protoforge already produces the inputs Wokwi needs: a netlist with every pin connection plus complete firmware. Its breadboard view shows the same parts-and-wires picture before anything is built.",
    },
    {
      name: "Cirkit Designer",
      url: "https://www.cirkitdesigner.com",
      category: "Simulation & verification",
      description:
        "Browser-based circuit design with AI features. AI wires components, generates project code and answers questions about the design, with a built-in real-time simulator, auto-routed color-coded wires and a large parts library.",
      keyIdeas: [
        "AI autowire on a breadboard-style canvas",
        "Wire colors by net type for readability",
        "Code and circuit generated together for maker boards",
      ],
      protoforgeIntegration:
        "Protoforge's breadboard view is similar. It places components with deterministic wiring, colors wires by net type (power, ground, signal, bus, motor), and lists every pin-to-pin connection as a step-by-step guide.",
    },
    // ---------------------------------------------------------------- Sourcing & manufacturing
    {
      name: "Nexar / Octopart",
      url: "https://nexar.com",
      category: "Sourcing & manufacturing",
      description:
        "Altium's (now Renesas) parts-data platform. A GraphQL API over Octopart data covers price, stock, lifecycle, lead time, datasheets and CAD models across distributors, with up to 100 parts per query. Community MCP servers expose it to AI assistants.",
      keyIdeas: [
        "Live multi-distributor price, stock and lifecycle per MPN",
        "Datasheet and CAD model URLs alongside commercial data",
        "Agent access through MCP",
      ],
      funding: "Part of Altium (Renesas)",
      protoforgeIntegration:
        "Protoforge BOM lines carry manufacturer part numbers and generated supplier search links (Octopart, DigiKey, etc.), so every part can be checked with one click.",
    },
    {
      name: "Xometry",
      url: "https://www.xometry.com",
      category: "Sourcing & manufacturing",
      description:
        "Manufacturing marketplace whose AI Instant Quoting Engine analyses uploaded CAD (STEP, STL, etc.). It gives price, lead time and design-for-manufacturability feedback drawn on the model, across CNC, sheet metal, casting and 3D printing.",
      keyIdeas: [
        "Geometry-driven pricing and lead-time models",
        "DFM feedback rendered directly on the 3D part",
        "Process and material selection as part of the quote",
      ],
      funding: "Public company (NASDAQ: XMTR)",
      protoforgeIntegration:
        "Each Protoforge CadPart carries a fabrication method and material, the BOM marks custom parts as fabricated items, and the review stage flags mechanical and fabrication risks. These are the same inputs a quoting engine needs.",
    },
    {
      name: "JLCPCB / EasyEDA",
      url: "https://jlcpcb.com",
      category: "Sourcing & manufacturing",
      description:
        "Low-cost PCB fabrication and assembly with the EasyEDA editor. JLCPCB documents a workflow where AI coding agents (Claude Code, Codex) drive EasyEDA Pro through an API bridge, searching the real library for footprints so the BOM maps to parts JLCPCB can source and assemble.",
      keyIdeas: [
        "Agents resolve real library parts instead of hallucinating footprints",
        "Design tool and fab/assembly house share one parts catalog",
        "Human review before ordering",
      ],
      protoforgeIntegration:
        "Protoforge's sourcing agent and catalog follow the same rule against invented parts: components must map to real part numbers, and the review's consistency checks cross-reference BOM, CAD and electronics ids.",
    },
  ],
  integrations: [
    {
      capability: "Code-as-CAD: agents write parametric JSON, not meshes",
      inspiredBy: ["Zoo (Text-to-CAD, KCL, Zookeeper)", "Adam (AdamCAD / CADAM)", "Onshape AI Advisor (PTC)", "nTop"],
      whereInProtoforge:
        "CAD sub-agents emit CadPart geometry (primitives, extrusions, lathes, tubes, library components, CSG cuts) and Joints in the shared CadModel. The CAD workspace builds geometry in the browser with three-bvh-csg.",
    },
    {
      capability: "Multi-agent decomposition with per-subsystem envelopes",
      inspiredBy: ["Tencent Hunyuan3D (Part / HY3D-Bench)", "Circuit Mind", "Confetti"],
      whereInProtoforge:
        "The architect writes a ProductBrief with SubsystemPlan envelopes (center plus size) and precise interface coordinates. The CAD lead spawns one sub-agent per subsystem in parallel, and the integration agent stitches them together with cross-subsystem joints.",
    },
    {
      capability: "Self-verifying agent loop with deterministic checks",
      inspiredBy: ["Zoo (Text-to-CAD, KCL, Zookeeper)", "Diode Computers", "Cadstrom"],
      whereInProtoforge:
        "Review stage: deterministic mechanical, electrical, sourcing and consistency checks run first, then the reviewer agent. The result is a scored ReviewReport with pass, warn and fail items.",
    },
    {
      capability: "Real purchased components rendered in 3D",
      inspiredBy: ["SnapMagic (formerly SnapEDA)", "Leo AI", "Backflip AI"],
      whereInProtoforge:
        "A 40-model procedural component library (motors, flight controllers, batteries, cameras, displays) is used as component geometry in the CAD assembly and shown on /library.",
    },
    {
      capability: "No hallucinated parts: BOM with real part numbers and supplier links",
      inspiredBy: ["Nexar / Octopart", "JLCPCB / EasyEDA", "Celus", "Flux"],
      whereInProtoforge:
        "The sourcing agent produces BomItems with manufacturer, part number, unit price, alternatives and supplier search URLs. The integration agent links them to CAD parts (bomId) and electronic components.",
    },
    {
      capability: "Requirements to netlist to auto schematic",
      inspiredBy: ["Circuit Mind", "JITX", "atopile", "Celus"],
      whereInProtoforge:
        "The electronics agent writes a typed ElectronicsSpec (components, typed pins, typed nets with voltages). The Schematic tab is laid out by code from that netlist.",
    },
    {
      capability: "Deterministic breadboard wiring and per-pin connection guide",
      inspiredBy: ["Cirkit Designer", "Wokwi", "Quilter"],
      whereInProtoforge:
        "The ElectronicsWorkspace Breadboard and Connections tabs place parts and route color-coded wires by rule, then list every pin-to-pin connection as a build step.",
    },
    {
      capability: "Firmware generated from the exact hardware pin map",
      inspiredBy: ["Embedder", "Atech", "Confetti"],
      whereInProtoforge:
        "The firmware agent starts as soon as electronics finishes. Its FirmwareSpec has complete files, libraries, build commands and a pinMap that matches the nets in the netlist.",
    },
    {
      capability: "Electro-mechanical co-design (boards live inside the CAD)",
      inspiredBy: ["Flux", "Confetti"],
      whereInProtoforge:
        "The integration agent sets CadPart.electronicsId and EComponent.cadPartIds and fixes positions, so the 3D workspace can highlight the physical part behind any electronic component or BOM line.",
    },
    {
      capability: "Power budget and supply checks",
      inspiredBy: ["Cadstrom", "Circuit Mind"],
      whereInProtoforge:
        "The ElectronicsSpec powerBudget is shown in the Power tab and checked against the supply in the review stage.",
    },
    {
      capability: "Conversational refinement with revision history",
      inspiredBy: ["Zoo (Text-to-CAD, KCL, Zookeeper)", "Adam (AdamCAD / CADAM)", "Meshy"],
      whereInProtoforge:
        "POST /api/projects/:id/refine re-runs the pipeline from the previous brief plus the user's instruction and appends to project.revisions. Progress streams live over SSE.",
    },
    {
      capability: "Assembly instructions tied to the 3D model",
      inspiredBy: ["Flux", "Xometry"],
      whereInProtoforge:
        "The assembly agent writes AssemblyStep[] whose partIds point to CadPart ids. Each step can highlight its parts in the 3D viewer, with the exploded view showing how they go together.",
    },
    {
      capability: "Inspectable assemblies: exploded view, x-ray, export",
      inspiredBy: ["Tripo (VAST)", "Hyper3D Rodin (Deemos)", "Backflip AI"],
      whereInProtoforge:
        "CadViewer and CadWorkspace offer an explode slider, x-ray, joint markers, a part tree and inspector, and STL/GLB export of the generated assembly.",
    },
  ],
};

/** Distinct categories in display order (first appearance). */
export const LANDSCAPE_CATEGORIES: string[] = Array.from(
  new Set(LANDSCAPE.companies.map((c) => c.category)),
);
