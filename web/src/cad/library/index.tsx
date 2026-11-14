/**
 * Component library registry: catalog model id -> procedural React model.
 * Every entry of CATALOG (shared/src/catalog.ts) has a model here; unknown ids render a labelled
 * neutral box sized from the catalog footprint (or a 10 mm cube). Params are merged over catalog
 * defaults, so `{ type: "component", model: "bldc_motor" }` renders the default motor.
 */
import { Component, type ComponentType, type ReactNode } from "react";
import { CATALOG_BY_MODEL } from "@protoforge/shared";
import type { Params } from "./kit";
import { BldcMotor, DcMotor, Fan, Propeller, Servo, StepperNema17, VibrationMotor, Wheel } from "./motion";
import { ArduinoNano, ArduinoUno, ChipModel, Esc, Esp32Devkit, FlightController, MotorDriver, Pcb, PiPico, RaspberryPi } from "./compute";
import { BatteryCell, BatteryLipo, BatteryPouch, CameraModule, Connector, GpsModule, LensModel, Microphone, PowerModule, SensorModule, UltrasonicSensor } from "./power";
import { Antenna, Breadboard, Button, Display, Heatsink, Led, OledModule, RfModule, Screw, SolarPanel, Speaker, Standoff, SwitchToggle, UnknownModel } from "./io";

export { RenderModeContext } from "./kit";

type ModelComponent = ComponentType<{ p: Params }>;

export const MODEL_COMPONENTS: Record<string, ModelComponent> = {
  bldc_motor: BldcMotor,
  dc_motor: DcMotor,
  servo: Servo,
  stepper_nema17: StepperNema17,
  propeller: Propeller,
  wheel: Wheel,
  vibration_motor: VibrationMotor,
  fan: Fan,
  arduino_uno: ArduinoUno,
  arduino_nano: ArduinoNano,
  esp32_devkit: Esp32Devkit,
  raspberry_pi: RaspberryPi,
  pi_pico: PiPico,
  flight_controller: FlightController,
  esc: Esc,
  motor_driver: MotorDriver,
  pcb: Pcb,
  chip: ChipModel,
  battery_lipo: BatteryLipo,
  battery_cell: BatteryCell,
  battery_pouch: BatteryPouch,
  power_module: PowerModule,
  connector: Connector,
  camera_module: CameraModule,
  lens: LensModel,
  sensor_module: SensorModule,
  ultrasonic_sensor: UltrasonicSensor,
  gps_module: GpsModule,
  microphone: Microphone,
  display: Display,
  oled_module: OledModule,
  led: Led,
  button: Button,
  switch_toggle: SwitchToggle,
  breadboard: Breadboard,
  antenna: Antenna,
  rf_module: RfModule,
  speaker: Speaker,
  screw: Screw,
  standoff: Standoff,
  heatsink: Heatsink,
  solar_panel: SolarPanel,
};

/** Catalog defaults merged with the given params. */
export function resolveParams(model: string, params?: Record<string, number | string>): Params {
  const entry = CATALOG_BY_MODEL[model];
  const out: Params = {};
  if (entry) for (const [k, v] of Object.entries(entry.params)) out[k] = v.default;
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) if (typeof v === "number" || typeof v === "string") out[k] = v;
  }
  return out;
}

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode; resetKey: string }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    if (props.resetKey !== state.key) return { failed: false, key: props.resetKey };
    return null;
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[cad] component model failed to render", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Render a catalog component model (origin per catalog convention). */
export function ComponentModel({ model, params }: { model: string; params?: Record<string, number | string> }) {
  const key = String(model ?? "").trim().toLowerCase();
  const entry = CATALOG_BY_MODEL[key];
  const size: [number, number, number] = entry ? entry.footprint : [10, 10, 10];
  const fallback = <UnknownModel model={key || "unknown"} size={size} />;
  const Model = MODEL_COMPONENTS[key];
  if (!Model) return fallback;
  const p = resolveParams(key, params);
  return (
    <ModelBoundary fallback={fallback} resetKey={`${key}:${JSON.stringify(p)}`}>
      <Model p={p} />
    </ModelBoundary>
  );
}
