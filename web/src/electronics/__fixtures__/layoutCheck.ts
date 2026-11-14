/**
 * Self-check for the breadboard layout: run with
 *   cd web && npx tsx src/electronics/__fixtures__/layoutCheck.ts
 * Verifies no two things share a hole and every net node with a breadboard location is wired.
 */
import type { ElectronicsSpec } from "@protoforge/shared";
import { buildNetlist, pinKey } from "../model";
import { layoutBreadboard } from "../layout";
import { sampleElectronics } from "./sampleElectronics";

export function checkLayout(spec: ElectronicsSpec): string[] {
  const errors: string[] = [];
  const nl = buildNetlist(spec);
  const bb = layoutBreadboard(spec, nl);
  const holes = new Map<string, string>();
  const claim = (hole: string, who: string) => {
    if (holes.has(hole)) errors.push(`hole ${hole} used by ${holes.get(hole)} and ${who}`);
    holes.set(hole, who);
  };
  for (const w of bb.wires) {
    claim(w.to.hole, w.id);
    if (w.from.hole) claim(w.from.hole, w.id);
  }
  for (const p of bb.inlines) for (const pin of p.pins) claim(pin.hole, `${p.compId}.${pin.pinId}`);
  for (const n of nl.nets) {
    const loc = bb.netLocation.get(n.id) ?? "";
    if (n.nodes.length < 2 || loc.startsWith("not placed")) continue;
    for (const node of n.nodes) {
      if (!bb.pinHole.has(pinKey(node.component, node.pin))) errors.push(`net ${n.name}: ${node.component}.${node.pin} not wired`);
    }
  }
  return errors;
}

const errs = checkLayout(sampleElectronics);
const bb = layoutBreadboard(sampleElectronics);
console.log("rails", bb.rails);
console.log("strips", bb.strips.map((s) => `${s.netId}@${s.half}${s.row}`).join(" "));
console.log("wires", bb.wires.length, "inlines", bb.inlines.length, "modules", bb.modules.length, "warnings", bb.warnings);
for (const p of bb.inlines) console.log(" ", p.compId, p.shape, p.pins.map((x) => x.hole).join(","));
console.log(errs.length ? "FAIL\n" + errs.join("\n") : "OK: no hole collisions, every node wired");

// Stress: random large netlist
const big: ElectronicsSpec = {
  summary: "stress", supplyVoltage: 12, logicVoltage: 3.3, wiringSteps: [], safetyNotes: [], powerBudget: [],
  components: Array.from({ length: 60 }, (_, i) => ({
    id: `C${i}`, name: `Comp ${i}`, kind: (["mcu", "sensor", "passive", "driver", "power", "module"] as const)[i % 6],
    mount: (i % 3 === 0 ? "breadboard" : "offboard") as "breadboard" | "offboard",
    pins: Array.from({ length: i % 3 === 0 ? 2 + (i % 3) : 4 + (i % 9) }, (_, j) => ({ id: `P${j}`, label: `P${j}`, type: "digital" as const })),
  })),
  nets: [],
};
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
big.nets.push({ id: "VCC", name: "VCC", type: "power", voltage: 12, nodes: [] }, { id: "GND", name: "GND", type: "ground", nodes: [] }, { id: "V33", name: "3V3", type: "power", voltage: 3.3, nodes: [] });
for (let i = 0; i < 147; i++) big.nets.push({ id: `N${i}`, name: `NET_${i}`, type: "signal", nodes: [] });
for (const c of big.components) for (const p of c.pins) {
  if (rnd() < 0.15) continue;
  big.nets[Math.floor(rnd() * big.nets.length)].nodes.push({ component: c.id, pin: p.id });
}
big.nets[5].nodes.push({ component: "NOPE", pin: "X" });
const errs2 = checkLayout(big);
const bb2 = layoutBreadboard(big);
console.log("stress: wires", bb2.wires.length, "warnings", bb2.warnings.length, errs2.length ? "FAIL\n" + errs2.slice(0, 10).join("\n") : "OK");
