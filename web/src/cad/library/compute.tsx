/** Compute boards: Arduino, ESP32, Raspberry Pi, Pico, flight controllers, ESCs, drivers, PCBs, chips. */
import { useMemo } from "react";
import { Board, Box, Chip, Cyl, Header, InstBoxes, InstCyl, Label, Lathe, Passives, Wire, clamp, num, rng, str, type Params, type V3 } from "./kit";

const USB_STEEL = { color: "#c7cbd0", metalness: 1, roughness: 0.28 };
const SILK = "#e6e9ef";

function UsbMicro({ p, rotY = 0 }: { p: V3; rotY?: number }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <Box s={[5.6, 2.6, 7.5]} p={[0, 1.3, 0]} m={USB_STEEL} round={0.4} />
      <Box s={[4.2, 1.2, 0.2]} p={[0, 1.3, -3.76]} m={{ color: "#050506" }} />
    </group>
  );
}

function UsbC({ p, rotY = 0 }: { p: V3; rotY?: number }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <Box s={[8.9, 3.2, 7.4]} p={[0, 1.6, 0]} m={USB_STEEL} round={1.4} />
      <Box s={[7, 1.6, 0.2]} p={[0, 1.6, -3.71]} m={{ color: "#050506" }} />
    </group>
  );
}

function Button6({ p, color = "#d8d9db" }: { p: V3; color?: string }) {
  return (
    <group position={p}>
      <Box s={[3.5, 1.2, 3.5]} p={[0, 0.6, 0]} m="steel" />
      <Cyl rad={0.9} h={0.6} p={[0, 1.5, 0]} m={{ color, roughness: 0.6 }} seg={16} />
    </group>
  );
}

export function ArduinoUno() {
  const t = 1.6;
  const W = 68.6;
  const L = 53.4;
  const dip = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < 14; i++) {
      const x = 2 + (i - 6.5) * 2.54;
      out.push([x, t + 0.9, 4 - 3.8], [x, t + 0.9, 4 + 3.8]);
    }
    return out;
  }, []);
  return (
    <group>
      <Board w={W} l={L} t={t} preset="pcb_blue" holes={[[-W / 2 + 14, -L / 2 + 2.5], [-W / 2 + 15.3, L / 2 - 2.5], [W / 2 - 2.5, -L / 2 + 7.6], [W / 2 - 2.5, L / 2 - 17.8]]} holeR={1.6} radius={1} />
      {/* digital headers along -Z edge, power/analog along +Z edge */}
      <Header n={10} p={[-6, t, -L / 2 + 2.5]} female />
      <Header n={8} p={[20, t, -L / 2 + 2.5]} female />
      <Header n={8} p={[-4, t, L / 2 - 2.5]} female />
      <Header n={6} p={[19.5, t, L / 2 - 2.5]} female />
      <Header n={3} rows={2} p={[30, t, 0]} axis="z" />
      {/* USB-B and barrel jack overhanging -X */}
      <Box s={[16, 11, 12]} p={[-W / 2 + 6, t + 5.5, -L / 2 + 13]} m={USB_STEEL} round={0.6} />
      <Box s={[0.2, 7, 8]} p={[-W / 2 - 2.05, t + 5.5, -L / 2 + 13]} m={{ color: "#050506" }} />
      <Box s={[13.5, 11, 9]} p={[-W / 2 + 4.5, t + 5.5, L / 2 - 7.5]} m={{ color: "#121315", roughness: 0.6 }} round={0.4} />
      <Cyl rad={3.1} h={0.2} p={[-W / 2 - 2.25, t + 6, L / 2 - 7.5]} r={[0, 0, Math.PI / 2]} m={{ color: "#050506" }} />
      {/* ATmega328P DIP-28 */}
      <Box s={[35.5, 3.6, 7.4]} p={[2, t + 2.6, 4]} m={{ color: "#141416", roughness: 0.6 }} round={0.3} />
      <InstBoxes size={[0.5, 1.8, 0.8]} m="steel" at={dip} />
      <Label text="ATMEGA328P" lines={["ATMEGA328P", "-PU 1832"]} w={20} l={5.4} p={[2, t + 4.41, 4]} bg="#141416" fg="#a3abbd" />
      <Box s={[10, 4, 10]} p={[-30, t + 2.5, 4]} m={{ color: "#141416" }} />
      <Chip w={5} l={5} h={1} p={[-19, t, -12]} label="16U2" />
      <Box s={[11, 3.5, 4.6]} p={[-14, t + 1.75, 14]} m={USB_STEEL} round={1.6} />
      <Cyl rad={3.1} h={8} p={[-20, t + 4, 18.5]} m={{ color: "#1d3a6b", roughness: 0.4 }} seg={24} />
      <Cyl rad={3.1} h={8} p={[-26.5, t + 4, 18.5]} m={{ color: "#1d3a6b", roughness: 0.4 }} seg={24} />
      <Button6 p={[-28, t, -L / 2 + 4]} color="#c0392b" />
      <Passives w={W * 0.6} l={L * 0.5} y={t} count={24} seed={11} avoid={[[2, 4, 37, 9], [-14, 14, 12, 6]]} />
      <Label text="UNO" w={14} l={7} p={[20, t + 0.01, -12]} bg="#1b5aa8" fg={SILK} res={128} />
      <InstBoxes size={[1.6, 0.6, 0.8]} m={{ color: "#f5f5f0", emissive: "#5cff7a", emissiveIntensity: 0.5 }} at={[[8, t + 0.3, -13], [8, t + 0.3, -16]]} />
    </group>
  );
}

export function ArduinoNano() {
  const W = 45;
  const L = 18;
  const y = 5.4;
  return (
    <group>
      <Header n={15} p={[0, y, -L / 2 + 1.3]} up={false} />
      <Header n={15} p={[0, y, L / 2 - 1.3]} up={false} />
      <Board w={W} l={L} t={1.6} y={y} preset="pcb_blue" holes={[[-W / 2 + 1.6, -L / 2 + 1.6], [W / 2 - 1.6, -L / 2 + 1.6], [W / 2 - 1.6, L / 2 - 1.6], [-W / 2 + 1.6, L / 2 - 1.6]]} holeR={0.8} radius={0.5} />
      <Chip w={7} l={7} h={1} p={[3, y + 1.6, 0]} label="328P" />
      <UsbMicro p={[-W / 2 + 3, y + 1.6, 0]} rotY={Math.PI / 2} />
      <Button6 p={[8, y + 1.6, 0]} />
      <Passives w={W * 0.7} l={L * 0.6} y={y + 1.6} count={14} seed={5} avoid={[[3, 0, 8, 8], [-W / 2 + 3, 0, 8, 6], [8, 0, 4, 4]]} />
    </group>
  );
}

export function Esp32Devkit() {
  const W = 51;
  const L = 28;
  const y = 5.4;
  const ant = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < 6; i++) out.push([W / 2 - 3.5, y + 2.42, -6 + i * 2.4]);
    return out;
  }, []);
  return (
    <group>
      <Header n={19} p={[-1, y, -L / 2 + 1.3]} up={false} />
      <Header n={19} p={[-1, y, L / 2 - 1.3]} up={false} />
      <Board w={W} l={L} t={1.6} y={y} preset="pcb_black" holeR={0} radius={0.8} />
      {/* WROOM module: blue-black PCB, shield can, antenna */}
      <Box s={[25.5, 0.8, 18]} p={[W / 2 - 25.5 / 2 + 1, y + 2, 0]} m="pcb_black" />
      <Box s={[17.6, 2.4, 15.8]} p={[W / 2 - 25.5 + 1 + 9.8, y + 3.6, 0]} m={{ color: "#bfc3c8", metalness: 1, roughness: 0.38 }} round={0.25} />
      <Label text="ESP32-WROOM" lines={["ESP32-WROOM-32E", "FCC ID 2AC7Z"]} w={14} l={8} p={[W / 2 - 25.5 + 1 + 9.8, y + 4.81, 0]} bg="#bfc3c8" fg="#2a2d33" />
      <InstBoxes size={[0.4, 0.04, 2]} m="gold" at={ant} />
      <InstBoxes size={[5, 0.04, 0.4]} m="gold" at={[[W / 2 - 4, y + 2.42, -7.2], [W / 2 - 4, y + 2.42, 7.2]]} />
      <UsbMicro p={[-W / 2 + 3, y + 1.6, 0]} rotY={Math.PI / 2} />
      <Button6 p={[-W / 2 + 7, y + 1.6, -9]} />
      <Button6 p={[-W / 2 + 7, y + 1.6, 9]} />
      <Chip w={5} l={5} h={1.2} p={[-11, y + 1.6, 0]} label="CP2102" />
      <Box s={[6, 1.8, 3.4]} p={[-15, y + 2.5, -7]} m={{ color: "#1a1b1e" }} />
      <Passives w={W * 0.36} l={L * 0.7} y={y + 1.6} count={12} seed={3} avoid={[[-11, 0, 6, 6], [-15, -7, 7, 4]]} />
    </group>
  );
}

export function RaspberryPi() {
  const W = 85;
  const L = 56;
  const t = 1.4;
  const gpio = useMemo(() => [-W / 2 + 3.5 + 29, t, -L / 2 + 3.5] as V3, []);
  const fins = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < 7; i++) out.push([-14 - 6 + i * 2, t + 3.4, 0]);
    return out;
  }, []);
  return (
    <group>
      <Board w={W} l={L} t={t} preset="pcb_green" holes={[[-W / 2 + 3.5, -L / 2 + 3.5], [-W / 2 + 61.5, -L / 2 + 3.5], [-W / 2 + 61.5, L / 2 - 3.5], [-W / 2 + 3.5, L / 2 - 3.5]]} holeR={1.35} radius={3} />
      <Header n={20} rows={2} p={gpio} />
      {/* SoC under a finned heatsink */}
      <Box s={[14, 1.2, 14]} p={[-14, t + 0.6, 0]} m={{ color: "#bfc3c8", metalness: 1, roughness: 0.3 }} />
      <Box s={[14, 1.4, 14]} p={[-14, t + 1.9, 0]} m="anodized_black" />
      <InstBoxes size={[0.9, 4.2, 14]} m="anodized_black" at={fins} />
      <Chip w={10} l={14} h={1} p={[2, t, 3]} label="LPDDR4" />
      <Chip w={8} l={8} h={1} p={[18, t, -6]} label="RP1" />
      {/* USB stacks and Ethernet on +X edge */}
      <Box s={[17.5, 15.6, 13.1]} p={[W / 2 - 17.5 / 2 + 2.5, t + 7.8, -L / 2 + 9]} m={USB_STEEL} round={0.5} />
      <Box s={[17.5, 15.6, 13.1]} p={[W / 2 - 17.5 / 2 + 2.5, t + 7.8, -L / 2 + 27]} m={USB_STEEL} round={0.5} />
      {[0, 1].map((k) => [0, 1].map((j) => <Box key={`${k}${j}`} s={[0.2, 5.4, 11]} p={[W / 2 + 2.6, t + 4.2 + j * 7, -L / 2 + 9 + k * 18]} m={{ color: k === 0 ? "#1f5fbf" : "#141416" }} />))}
      <Box s={[21, 13.5, 16]} p={[W / 2 - 21 / 2 + 3, t + 6.75, L / 2 - 10.25]} m={USB_STEEL} round={0.5} />
      <Box s={[0.2, 8, 12]} p={[W / 2 + 3.1, t + 7, L / 2 - 10.25]} m={{ color: "#121315" }} />
      {/* micro HDMI x2 + USB-C power on +Z edge */}
      <Box s={[6.5, 3, 7.5]} p={[-W / 2 + 26, t + 1.5, L / 2 - 3]} m={USB_STEEL} round={0.5} />
      <Box s={[6.5, 3, 7.5]} p={[-W / 2 + 39.5, t + 1.5, L / 2 - 3]} m={USB_STEEL} round={0.5} />
      <UsbC p={[-W / 2 + 11.2, t, L / 2 - 3]} rotY={Math.PI} />
      <Box s={[6, 2.5, 5]} p={[-W / 2 + 12, t + 1.25, -L / 2 + 14]} m={{ color: "#ece8dc" }} />
      <Passives w={W * 0.7} l={L * 0.6} y={t} count={30} seed={21} avoid={[[-14, 0, 16, 16], [2, 3, 12, 16], [18, -6, 10, 10], [-W / 2 + 12, -L / 2 + 14, 8, 7]]} />
      <Label text="Raspberry Pi 5" w={24} l={4} p={[0, t + 0.01, L / 2 - 9]} bg="#1f6b3a" fg={SILK} res={256} />
    </group>
  );
}

export function PiPico() {
  const W = 51;
  const L = 21;
  const t = 1;
  const pads = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i < 20; i++) {
      const x = -W / 2 + 1.61 + i * 2.54;
      out.push([x, t / 2, -L / 2 + 0.05], [x, t / 2, L / 2 - 0.05]);
    }
    return out;
  }, []);
  return (
    <group>
      <Board w={W} l={L} t={t} preset="pcb_green" holeR={1.05} holeInset={2} holes={[[-W / 2 + 2, -5.7], [-W / 2 + 2, 5.7], [W / 2 - 2, -5.7], [W / 2 - 2, 5.7]]} radius={0.5} />
      <InstCyl rad={0.8} h={t + 0.06} at={pads} m="gold" seg={14} />
      <Chip w={7} l={7} h={0.9} p={[2, t, 0]} label="RP2040" />
      <Chip w={4} l={5} h={0.8} p={[-8, t, 3]} label="W25Q" />
      <UsbMicro p={[-W / 2 + 3.2, t, 0]} rotY={Math.PI / 2} />
      <Button6 p={[-12, t, -5]} color="#f1efe8" />
      <InstBoxes size={[1, 0.4, 0.6]} m={{ color: "#f0f0e8", emissive: "#5cff7a", emissiveIntensity: 0.6 }} at={[[-14, t + 0.2, 5]]} />
      <Passives w={W * 0.6} l={L * 0.7} y={t} count={14} seed={9} avoid={[[2, 0, 8, 8], [-8, 3, 5, 6], [-W / 2 + 3, 0, 8, 6], [-12, -5, 4, 4]]} />
    </group>
  );
}

function Grommet({ p, r, h, color = "#8e44ad" }: { p: V3; r: number; h: number; color?: string }) {
  return <Lathe profile={[[r * 0.5, 0], [r, 0], [r * 0.8, h * 0.35], [r * 0.8, h * 0.65], [r, h], [r * 0.5, h], [r * 0.5, 0]]} p={p} m={{ color, roughness: 0.85 }} seg={20} />;
}

export function FlightController({ p }: { p: Params }) {
  const mount = num(p, "mount", 30.5) < 25 ? 20 : 30.5;
  const S = mount === 20 ? 25.5 : 36;
  const by = 1.7;
  const t = 1.6;
  const k = mount / 2;
  const holes: [number, number][] = [[-k, -k], [k, -k], [k, k], [-k, k]];
  const pads = useMemo(() => {
    const out: V3[] = [];
    const n = mount === 20 ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const a = -S / 2 + 7 + ((S - 14) * i) / (n - 1);
      out.push([a, by + t + 0.03, -S / 2 + 1.4], [a, by + t + 0.03, S / 2 - 1.4], [-S / 2 + 1.4, by + t + 0.03, a]);
    }
    return out;
  }, [S, mount]);
  return (
    <group>
      <Board w={S} l={S} t={t} y={by} preset="pcb_black" holes={holes} holeR={1.6} radius={3} />
      {holes.map(([x, z], i) => (
        <Grommet key={i} p={[x, 0, z]} r={2.6} h={by * 2 + t} />
      ))}
      <Chip w={mount === 20 ? 7 : 10} l={mount === 20 ? 7 : 10} h={1.4} p={[0, by + t, 0]} label="STM32" sub="F405RGT6" />
      <Chip w={3} l={3} h={0.9} p={[S * 0.22, by + t, -S * 0.2]} label="IMU" />
      <Chip w={2.5} l={2.5} h={0.8} p={[-S * 0.22, by + t, -S * 0.2]} label="BMP" />
      <Chip w={4} l={5} h={0.9} p={[-S * 0.22, by + t, S * 0.2]} label="FLASH" />
      <InstBoxes size={[1.8, 0.06, 1.2]} m="gold" at={pads} />
      <UsbC p={[S / 2 - 3.4, by + t, S * 0.15]} rotY={-Math.PI / 2} />
      <Box s={[6, 3, 3]} p={[0, by + t + 1.5, S / 2 - 3]} m={{ color: "#ece8dc", roughness: 0.6 }} />
      <Passives w={S * 0.7} l={S * 0.7} y={by + t} count={18} seed={4} avoid={[[0, 0, 11, 11], [0, S / 2 - 3, 7, 4], [S / 2 - 3.4, S * 0.15, 8, 10]]} />
      <InstBoxes size={[1, 0.4, 0.6]} m={{ color: "#f0f0e8", emissive: "#2fa8ff", emissiveIntensity: 0.8 }} at={[[S * 0.3, by + t + 0.2, S * 0.3]]} />
    </group>
  );
}

export function Esc({ p }: { p: Params }) {
  const variant = str(p, "variant", "4in1").toLowerCase();
  if (variant.startsWith("single")) {
    return (
      <group>
        <Box s={[20, 8, 45]} p={[0, 4, 0]} m={{ color: "#2c64b4", roughness: 0.35, opacity: 0.93, clearcoat: 0.3 }} round={2.5} />
        <Label text="35A ESC" lines={["BLHeli_32", "35A ESC"]} w={14} l={18} p={[0, 8.02, 0]} bg="#2c64b4" fg={SILK} />
        {["#1b1b1b", "#1b1b1b", "#1b1b1b"].map((c, i) => (
          <Wire key={i} pts={[[(i - 1) * 4, 4, 22], [(i - 1) * 4, 4, 35], [(i - 1) * 5, 3, 50]]} rad={0.9} m={{ color: c }} />
        ))}
        <Wire pts={[[-3, 4, -22], [-3, 4, -38], [-5, 3, -55]]} rad={1.1} m={{ color: "#c0392b" }} />
        <Wire pts={[[3, 4, -22], [3, 4, -38], [5, 3, -55]]} rad={1.1} m={{ color: "#1b1b1b" }} />
        <Wire pts={[[0, 6, -22], [1, 7, -32], [2, 6, -45]]} rad={0.4} m={{ color: "#f1efe8" }} />
      </group>
    );
  }
  const mount = num(p, "mount", 30.5) < 25 ? 20 : 30.5;
  const S = mount === 20 ? 26 : 36;
  const k = mount / 2;
  const holes: [number, number][] = [[-k, -k], [k, -k], [k, k], [-k, k]];
  const by = 1.5;
  const t = 1.6;
  const fets = useMemo(() => {
    const out: V3[] = [];
    const q = S * 0.25;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) out.push([sx * q + (i - 1) * 3.6, by + t + 0.5, sz * q + (j - 0.5) * 4]);
    }
    return out;
  }, [S]);
  const motorPads = useMemo(() => {
    const out: V3[] = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (let i = 0; i < 3; i++) out.push([sx * (S / 2 - 1.8), by + t + 0.04, sz * (S / 2 - 6 - i * 2.8)]);
    return out;
  }, [S]);
  return (
    <group>
      <Board w={S} l={S} t={t} y={by} preset="pcb_black" holes={holes} holeR={1.6} radius={3} />
      {holes.map(([x, z], i) => (
        <Grommet key={i} p={[x, 0, z]} r={2.6} h={by * 2 + t} color="#1f1f22" />
      ))}
      <InstBoxes size={[3, 1, 3.4]} m={{ color: "#18191c", roughness: 0.45 }} at={fets} />
      <InstBoxes size={[2.4, 0.3, 1.2]} m="steel" at={fets.map(([x, y, z]) => [x, y + 0.55, z] as V3)} />
      <Chip w={5} l={5} h={1} p={[0, by + t, 0]} label="AT32" />
      <InstBoxes size={[2.4, 0.06, 1.6]} m="gold" at={motorPads} />
      <InstBoxes size={[5, 0.08, 4]} m="gold" at={[[-4, by + t + 0.04, S / 2 - 3], [4, by + t + 0.04, S / 2 - 3]]} />
      <Box s={[4, 2.5, 3]} p={[0, by + t + 1.25, -S / 2 + 2.5]} m={{ color: "#ece8dc", roughness: 0.6 }} />
    </group>
  );
}

export function MotorDriver({ p }: { p: Params }) {
  const v = str(p, "variant", "l298n").toLowerCase();
  if (!v.startsWith("l298")) {
    return (
      <group>
        <Board w={20} l={20} t={1.6} preset="pcb_black" color="#b0283a" holeR={0} radius={0.6} />
        <Chip w={6} l={8} h={1.1} p={[0, 1.6, 0]} label="TB6612" />
        <InstCyl rad={0.5} h={0.05} at={Array.from({ length: 16 }, (_, i) => [(i % 8) * 2.54 - 8.9, 1.62, i < 8 ? -8.6 : 8.6] as V3)} m="gold" seg={10} />
        <Passives w={16} l={12} y={1.6} count={6} seed={2} avoid={[[0, 0, 7, 9]]} />
      </group>
    );
  }
  const S = 43;
  const fins = useMemo(() => Array.from({ length: 9 }, (_, i) => [-S / 2 + 6 + i * 3.8, 1.6 + 12, -S / 2 + 9] as V3), []);
  return (
    <group>
      <Board w={S} l={S} t={1.6} color="#b0283a" holeR={1.6} radius={1} />
      <Box s={[23, 24, 3]} p={[-2, 1.6 + 12, -S / 2 + 6]} m="anodized_black" />
      <InstBoxes size={[1.2, 24, 6]} m="anodized_black" at={fins} />
      <Box s={[20, 10, 3.2]} p={[-2, 1.6 + 5, -S / 2 + 9.2]} m={{ color: "#121315" }} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (S / 2 - 4.5), 1.6, 3]}>
          <Box s={[8, 10, 10]} p={[0, 5, 0]} m={{ color: "#1d63c4", roughness: 0.5 }} />
          <InstCyl rad={1.6} h={0.3} at={[[0, 10.1, -2.5], [0, 10.1, 2.5]]} m="steel" seg={16} />
        </group>
      ))}
      <Box s={[15, 10, 8]} p={[-8, 1.6 + 5, S / 2 - 5]} m={{ color: "#1d63c4", roughness: 0.5 }} />
      <Cyl rad={4} h={10} p={[10, 1.6 + 5, 10]} m={{ color: "#1a1a1a", roughness: 0.4 }} seg={28} />
      <Cyl rad={4} h={10} p={[10, 1.6 + 5, -2]} m={{ color: "#1a1a1a", roughness: 0.4 }} seg={28} />
      <Header n={6} p={[10, 1.6, S / 2 - 3]} />
      <Chip w={5} l={6} h={2} p={[-4, 1.6, 6]} label="78M05" />
    </group>
  );
}

export function Pcb({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 50), 4, 1000);
  const l = clamp(num(p, "length", 30), 4, 1000);
  const t = clamp(num(p, "thickness", 1.6), 0.2, 10);
  const color = str(p, "color", "#1f6b3a");
  const chipsN = Math.round(clamp(num(p, "chips", 4), 0, 30));
  const seed = num(p, "seed", 1);
  const layout = useMemo(() => {
    const rand = rng(seed);
    const placed: [number, number, number, number][] = [];
    const chips: { x: number; z: number; w: number; l: number; label: string }[] = [];
    const names = ["MCU", "PMIC", "DRAM", "FLASH", "RF", "CODEC", "IMU", "USB", "DSP", "LDO"];
    let guard = 0;
    while (chips.length < chipsN && guard++ < chipsN * 40) {
      const big = chips.length === 0;
      const cw = Math.min(w * 0.4, big ? 6 + rand() * 8 : 2.5 + rand() * 5);
      const cl = Math.min(l * 0.4, big ? cw * (0.8 + rand() * 0.4) : 2.5 + rand() * 5);
      const x = (rand() - 0.5) * (w - cw - 4);
      const z = (rand() - 0.5) * (l - cl - 4);
      if (placed.some(([px, pz, pw, pl]) => Math.abs(x - px) < (cw + pw) / 2 + 1.2 && Math.abs(z - pz) < (cl + pl) / 2 + 1.2)) continue;
      placed.push([x, z, cw, cl]);
      chips.push({ x, z, w: cw, l: cl, label: names[chips.length % names.length] });
    }
    const conn = l > 12 && w > 14 ? { x: -w / 2 + 4.5, z: 0 } : null;
    if (conn) placed.push([conn.x, conn.z, 8, 9.5]);
    return { chips, placed, conn };
  }, [w, l, chipsN, seed]);
  return (
    <group>
      <Board w={w} l={l} t={t} color={color} holeR={Math.min(1.6, Math.min(w, l) * 0.05)} holeInset={Math.min(3.5, Math.min(w, l) * 0.12)} radius={Math.min(2, Math.min(w, l) * 0.08)} />
      {layout.chips.map((c, i) => (
        <Chip key={i} w={c.w} l={c.l} h={c.w > 5 ? 1.2 : 0.9} p={[c.x, t, c.z]} label={c.label} />
      ))}
      {layout.conn ? <UsbC p={[layout.conn.x, t, layout.conn.z]} rotY={Math.PI / 2} /> : null}
      <Passives w={w} l={l} y={t} count={Math.round(clamp((w * l) / 30, 6, 160))} seed={seed} avoid={layout.placed} />
    </group>
  );
}

export function ChipModel({ p }: { p: Params }) {
  const w = clamp(num(p, "width", 10), 0.5, 200);
  const l = clamp(num(p, "length", 10), 0.5, 200);
  const h = clamp(num(p, "height", 1.2), 0.1, 50);
  const label = str(p, "label", "SoC");
  const pads = useMemo(() => {
    const out: V3[] = [];
    const n = Math.max(3, Math.min(16, Math.floor(w / 0.8)));
    for (let i = 0; i < n; i++) {
      const a = -w / 2 + (w * (i + 0.5)) / n;
      out.push([a, h * 0.08, -l / 2 - 0.02], [a, h * 0.08, l / 2 + 0.02]);
    }
    const m = Math.max(3, Math.min(16, Math.floor(l / 0.8)));
    for (let i = 0; i < m; i++) {
      const a = -l / 2 + (l * (i + 0.5)) / m;
      out.push([-w / 2 - 0.02, h * 0.08, a], [w / 2 + 0.02, h * 0.08, a]);
    }
    return out;
  }, [w, l, h]);
  return (
    <group>
      <Chip w={w} l={l} h={h} p={[0, 0, 0]} label={label} />
      <InstBoxes size={[Math.min(0.3, w * 0.03), h * 0.16, 0.3]} m="stainless" at={pads} />
    </group>
  );
}
