/**
 * Parametric component library. The CAD agents place these with
 *   { type: "component", model: "<model>", params: { ... } }
 * and the web viewer renders a detailed procedural 3D model for each.
 *
 * GLOBAL CONVENTION for every model (local frame, before the part's rotation is applied):
 *   - Y is up. Boards/panels lie flat in the XZ plane with their top face toward +Y.
 *   - The model's origin is the CENTRE OF ITS BOTTOM FACE (it sits on y = 0), unless `origin` says otherwise.
 *   - Motors/shafts/lenses point toward +Y.
 *   - `footprint` is the [x, y, z] bounding size (mm) at default params, so agents can lay parts out.
 */

export interface CatalogParam {
  default: number | string;
  unit?: string;
  description: string;
}

export interface CatalogEntry {
  model: string;
  label: string;
  category: "motion" | "compute" | "power" | "sensor" | "io" | "structure" | "display" | "rf" | "audio" | "passive";
  description: string;
  params: Record<string, CatalogParam>;
  /** Bounding size [x, y, z] at default params (mm) */
  footprint: [number, number, number];
  /** Orientation / origin notes beyond the global convention */
  origin?: string;
  /** Typical real-world parts this model represents */
  examples: string[];
}

export const CATALOG: CatalogEntry[] = [
  // ---------------- motion ----------------
  {
    model: "bldc_motor",
    label: "Brushless outrunner motor",
    category: "motion",
    description: "Outrunner BLDC motor: mounting base with 4 screw holes, stator windings visible through the vented bell, rotating bell, shaft, 3 phase wires.",
    params: {
      diameter: { default: 28, unit: "mm", description: "bell outer diameter" },
      height: { default: 20, unit: "mm", description: "base-to-bell-top height (excluding shaft)" },
      shaftLength: { default: 12, unit: "mm", description: "shaft protrusion above bell" },
      shaftDiameter: { default: 5, unit: "mm", description: "shaft diameter" },
      color: { default: "#c0392b", description: "bell accent colour" },
    },
    footprint: [28, 32, 28],
    origin: "Origin at centre of the mounting base underside; shaft points +Y. Shaft tip is at y = height + shaftLength.",
    examples: ["T-Motor F60 Pro 2207 1950KV", "EMAX ECO II 2306", "iFlight XING 2207", "SunnySky X2212 980KV"],
  },
  {
    model: "dc_motor",
    label: "Brushed DC motor",
    category: "motion",
    description: "Cylindrical can motor (130/N20 style) with end cap, terminals and shaft.",
    params: {
      diameter: { default: 24, unit: "mm", description: "can diameter" },
      length: { default: 30, unit: "mm", description: "can length" },
      shaftLength: { default: 8, unit: "mm", description: "shaft protrusion" },
      gearbox: { default: 0, description: "1 to add an N20-style gearbox section" },
    },
    footprint: [24, 38, 24],
    origin: "Can axis along Y, terminals at y = 0, shaft points +Y.",
    examples: ["Mabuchi FA-130", "Pololu N20 micro metal gearmotor", "TT gear motor"],
  },
  {
    model: "servo",
    label: "Hobby servo",
    category: "motion",
    description: "RC servo with mounting tabs, output spline and horn, 3-wire lead.",
    params: {
      size: { default: "micro", description: "'micro' (SG90, 23x12x29) or 'standard' (MG996R, 40x20x43)" },
      hornAngle: { default: 0, unit: "deg", description: "horn rotation" },
    },
    footprint: [32, 29, 12],
    origin: "Body sits on y = 0, long axis along X, output spline on top (+Y) offset toward +X.",
    examples: ["TowerPro SG90", "TowerPro MG996R", "Savox SC-1256TG"],
  },
  {
    model: "stepper_nema17",
    label: "NEMA 17 stepper motor",
    category: "motion",
    description: "42.3 mm square stepper with chamfered corners, pilot boss, D-shaft and connector.",
    params: {
      length: { default: 40, unit: "mm", description: "body length" },
      shaftLength: { default: 24, unit: "mm", description: "shaft protrusion" },
    },
    footprint: [42.3, 66, 42.3],
    origin: "Body axis along Y, back face at y = 0, shaft points +Y.",
    examples: ["StepperOnline 17HS4401", "LDO-42STH40"],
  },
  {
    model: "propeller",
    label: "Propeller",
    category: "motion",
    description: "Multi-blade propeller with twisted airfoil blades and hub.",
    params: {
      diameter: { default: 127, unit: "mm", description: "tip-to-tip diameter (5\" = 127 mm)" },
      blades: { default: 3, description: "blade count" },
      hubHeight: { default: 6, unit: "mm", description: "hub height" },
      color: { default: "#1e90ff", description: "blade colour" },
    },
    footprint: [127, 6, 127],
    origin: "Hub bottom at y = 0, spins about Y in the XZ plane.",
    examples: ["Gemfan 51466 Hurricane", "HQProp 5x4.3x3", "APC 10x4.7"],
  },
  {
    model: "wheel",
    label: "Wheel with tyre",
    category: "motion",
    description: "Rubber tyre with tread on a spoked hub.",
    params: {
      diameter: { default: 65, unit: "mm", description: "outer diameter" },
      width: { default: 26, unit: "mm", description: "tyre width" },
    },
    footprint: [26, 65, 65],
    origin: "Origin at the wheel centre (NOT the bottom); axle along X.",
    examples: ["Pololu 65x26mm wheel", "TT motor wheel"],
  },
  {
    model: "vibration_motor",
    label: "Haptic actuator",
    category: "motion",
    description: "Linear resonant actuator / taptic engine block or coin vibration motor.",
    params: {
      width: { default: 10, unit: "mm", description: "x size" },
      length: { default: 30, unit: "mm", description: "z size" },
      height: { default: 4, unit: "mm", description: "y size" },
    },
    footprint: [10, 4, 30],
    examples: ["Apple Taptic Engine", "TDK LRA", "10mm coin ERM"],
  },
  {
    model: "fan",
    label: "Cooling fan",
    category: "motion",
    description: "Square axial fan with frame, hub and blades.",
    params: {
      size: { default: 40, unit: "mm", description: "frame size" },
      thickness: { default: 10, unit: "mm", description: "frame thickness" },
    },
    footprint: [40, 10, 40],
    examples: ["Noctua NF-A4x10", "Sunon 40mm 5V"],
  },
  // ---------------- compute ----------------
  {
    model: "arduino_uno",
    label: "Arduino Uno R3",
    category: "compute",
    description: "Blue Uno board: ATmega328P DIP, USB-B jack, barrel jack, female headers, reset button.",
    params: {},
    footprint: [68.6, 15, 53.4],
    examples: ["Arduino Uno R3 (A000066)", "Arduino Uno R4 Minima"],
  },
  {
    model: "arduino_nano",
    label: "Arduino Nano",
    category: "compute",
    description: "Nano board with male pin headers on both long edges and mini/USB-C connector.",
    params: {},
    footprint: [45, 8, 18],
    examples: ["Arduino Nano (A000005)", "Arduino Nano Every", "Nano ESP32"],
  },
  {
    model: "esp32_devkit",
    label: "ESP32 DevKit",
    category: "compute",
    description: "ESP32-WROOM module with shield can and PCB antenna, two pin header rows, USB, BOOT/EN buttons.",
    params: {},
    footprint: [51, 9, 28],
    examples: ["ESP32-DevKitC-V4", "ESP32-S3-DevKitC-1"],
  },
  {
    model: "raspberry_pi",
    label: "Raspberry Pi 4/5",
    category: "compute",
    description: "Pi board with SoC, 40-pin GPIO header, USB and Ethernet stacks, HDMI, heatsink.",
    params: {},
    footprint: [85, 17, 56],
    examples: ["Raspberry Pi 5 4GB", "Raspberry Pi 4 Model B"],
  },
  {
    model: "pi_pico",
    label: "Raspberry Pi Pico",
    category: "compute",
    description: "RP2040/RP2350 Pico board with castellated pins and micro-USB.",
    params: {},
    footprint: [51, 4, 21],
    examples: ["Raspberry Pi Pico W", "Pico 2"],
  },
  {
    model: "flight_controller",
    label: "Flight controller",
    category: "compute",
    description: "Stack-mount FC board with STM32 MCU, IMU, solder pads, USB-C and 4 corner mounting holes with rubber grommets.",
    params: {
      mount: { default: 30.5, unit: "mm", description: "mounting hole spacing (20 or 30.5)" },
    },
    footprint: [36, 5, 36],
    examples: ["SpeedyBee F405 V4", "Matek H743-SLIM", "BetaFPV F4 1S"],
  },
  {
    model: "esc",
    label: "Electronic speed controller",
    category: "power",
    description: "4-in-1 stack ESC (square with 4 MOSFET groups and capacitor pads) or single ESC (heat-shrunk block).",
    params: {
      variant: { default: "4in1", description: "'4in1' (stack, 36x36) or 'single' (block 45x20x8)" },
      mount: { default: 30.5, unit: "mm", description: "4in1 mounting hole spacing" },
    },
    footprint: [36, 6, 36],
    examples: ["SpeedyBee BLS 50A 4-in-1", "Hobbywing XRotor 40A", "BLHeli_32 35A"],
  },
  {
    model: "motor_driver",
    label: "Motor driver board",
    category: "power",
    description: "H-bridge driver module with heatsink and screw terminals (L298N) or small carrier (TB6612/DRV8833).",
    params: {
      variant: { default: "l298n", description: "'l298n' (43x43x27) or 'tb6612' (20x20x4)" },
    },
    footprint: [43, 27, 43],
    examples: ["L298N dual H-bridge", "SparkFun TB6612FNG", "Pololu DRV8833", "A4988 stepper driver"],
  },
  {
    model: "pcb",
    label: "Custom PCB / logic board",
    category: "compute",
    description: "Generic circuit board with procedurally placed ICs, passives and connectors. Use for phone logic boards, custom controllers, sensor boards.",
    params: {
      width: { default: 50, unit: "mm", description: "x size" },
      length: { default: 30, unit: "mm", description: "z size" },
      thickness: { default: 1.6, unit: "mm", description: "board thickness" },
      color: { default: "#1f6b3a", description: "solder mask colour" },
      chips: { default: 4, description: "number of IC packages to draw" },
      seed: { default: 1, description: "layout variation seed" },
    },
    footprint: [50, 4, 30],
    examples: ["Custom 4-layer controller", "iPhone logic board (stacked)", "Sensor breakout"],
  },
  {
    model: "chip",
    label: "IC package",
    category: "compute",
    description: "QFN/BGA style chip with a die marking (SoC, modem, memory, PMIC).",
    params: {
      width: { default: 10, unit: "mm", description: "x size" },
      length: { default: 10, unit: "mm", description: "z size" },
      height: { default: 1.2, unit: "mm", description: "y size" },
      label: { default: "SoC", description: "marking text" },
    },
    footprint: [10, 1.2, 10],
    examples: ["Apple A-series SoC", "Qualcomm modem", "LPDDR5 package", "STM32F405"],
  },
  // ---------------- power ----------------
  {
    model: "battery_lipo",
    label: "LiPo battery pack",
    category: "power",
    description: "Shrink-wrapped LiPo pack with label, main power lead to an XT60/XT30 connector and balance lead.",
    params: {
      width: { default: 35, unit: "mm", description: "x size" },
      length: { default: 75, unit: "mm", description: "z size" },
      height: { default: 35, unit: "mm", description: "y size" },
      cells: { default: 4, description: "series cell count (label)" },
      capacity: { default: 1500, unit: "mAh", description: "label" },
      color: { default: "#222831", description: "wrap colour" },
    },
    footprint: [35, 35, 75],
    examples: ["CNHL 1500mAh 4S 120C", "Tattu R-Line 1300mAh 6S", "Turnigy 2200mAh 3S"],
  },
  {
    model: "battery_cell",
    label: "Cylindrical cell",
    category: "power",
    description: "Cylindrical Li-ion/AA cell with wrap and positive nub.",
    params: {
      diameter: { default: 18.5, unit: "mm", description: "18650 = 18.5, 21700 = 21, AA = 14.5" },
      length: { default: 65, unit: "mm", description: "cell length" },
      color: { default: "#2e86de", description: "wrap colour" },
    },
    footprint: [18.5, 65, 18.5],
    origin: "Axis along Y, negative end at y = 0.",
    examples: ["Samsung 30Q 18650", "Molicel P42A 21700", "Energizer AA"],
  },
  {
    model: "battery_pouch",
    label: "Pouch cell",
    category: "power",
    description: "Thin foil pouch battery with protection PCB and flex connector (phones, wearables, tablets).",
    params: {
      width: { default: 40, unit: "mm", description: "x size" },
      length: { default: 90, unit: "mm", description: "z size" },
      thickness: { default: 4.5, unit: "mm", description: "y size" },
    },
    footprint: [40, 4.5, 90],
    examples: ["iPhone 3349 mAh L-shaped cell", "LP503562 1200mAh"],
  },
  {
    model: "power_module",
    label: "Power module / regulator",
    category: "power",
    description: "Buck/boost/BMS module board with inductor, capacitors and terminals.",
    params: {
      width: { default: 22, unit: "mm", description: "x size" },
      length: { default: 43, unit: "mm", description: "z size" },
    },
    footprint: [22, 10, 43],
    examples: ["LM2596 buck converter", "MP1584 buck", "TP4056 charger", "3S BMS"],
  },
  {
    model: "connector",
    label: "Connector",
    category: "io",
    description: "Power/data connector: XT60, XT30, JST-PH, USB-C receptacle, barrel jack, Lightning-style port.",
    params: {
      variant: { default: "xt60", description: "'xt60' | 'xt30' | 'jst' | 'usb_c' | 'barrel' | 'lightning'" },
    },
    footprint: [16, 8, 16],
    examples: ["Amass XT60", "JST-PH 2.0", "USB-C 16-pin receptacle"],
  },
  // ---------------- sensors ----------------
  {
    model: "camera_module",
    label: "Camera module",
    category: "sensor",
    description: "Image sensor module: square housing, lens barrel with glass element pointing +Y, flex cable. Use for FPV cams, Pi cams and phone cameras.",
    params: {
      size: { default: 19, unit: "mm", description: "housing width/depth" },
      lensDiameter: { default: 12, unit: "mm", description: "lens barrel diameter" },
      lensHeight: { default: 8, unit: "mm", description: "lens barrel height" },
      height: { default: 19, unit: "mm", description: "housing height" },
    },
    footprint: [19, 27, 19],
    examples: ["Caddx Ratel 2", "Raspberry Pi Camera Module 3", "Sony IMX-series phone camera"],
  },
  {
    model: "lens",
    label: "Camera lens / window",
    category: "sensor",
    description: "Lens stack seen from outside a product: metal trim ring, dark glass, inner aperture rings. For phone camera bumps.",
    params: {
      diameter: { default: 12, unit: "mm", description: "outer ring diameter" },
      height: { default: 2, unit: "mm", description: "protrusion" },
    },
    footprint: [12, 2, 12],
    examples: ["Phone wide/ultra-wide/telephoto lens window", "LiDAR window"],
  },
  {
    model: "sensor_module",
    label: "Sensor breakout",
    category: "sensor",
    description: "Small breakout board with a sensor IC and a pin header row (IMU, barometer, ToF, temperature, etc.).",
    params: {
      width: { default: 20, unit: "mm", description: "x size" },
      length: { default: 16, unit: "mm", description: "z size" },
      label: { default: "IMU", description: "marking" },
      color: { default: "#6a1b9a", description: "board colour" },
      pins: { default: 6, description: "header pin count" },
    },
    footprint: [20, 6, 16],
    examples: ["MPU-6050 GY-521", "BME280", "VL53L0X", "BNO055"],
  },
  {
    model: "ultrasonic_sensor",
    label: "Ultrasonic rangefinder",
    category: "sensor",
    description: "HC-SR04 board with two transducer cans facing +Y and a 4-pin header.",
    params: {},
    footprint: [45, 15, 20],
    origin: "Board lies in XZ plane; the transducers face +Y. Rotate -90° about X to face +Z (forward).",
    examples: ["HC-SR04", "US-100"],
  },
  {
    model: "gps_module",
    label: "GPS module",
    category: "rf",
    description: "GNSS module with ceramic patch antenna on top.",
    params: { size: { default: 25, unit: "mm", description: "square size" } },
    footprint: [25, 8, 25],
    examples: ["u-blox NEO-M8N", "BN-880", "Matek M10Q"],
  },
  {
    model: "microphone",
    label: "Microphone",
    category: "audio",
    description: "MEMS microphone or electret capsule.",
    params: { diameter: { default: 6, unit: "mm", description: "capsule diameter" } },
    footprint: [6, 3, 6],
    examples: ["INMP441 I2S MEMS", "Knowles SPH0645"],
  },
  // ---------------- io / display ----------------
  {
    model: "display",
    label: "Display panel",
    category: "display",
    description: "Flat display (OLED/LCD) with glass, active area glowing, bezel and flex tail. Use for phone screens, TFTs and monitors.",
    params: {
      width: { default: 71, unit: "mm", description: "x size" },
      length: { default: 147, unit: "mm", description: "z size" },
      thickness: { default: 1.2, unit: "mm", description: "y size" },
      bezel: { default: 1.5, unit: "mm", description: "black border" },
      cornerRadius: { default: 8, unit: "mm", description: "corner radius" },
      notch: { default: "island", description: "'none' | 'island' (pill cut-out) | 'notch'" },
    },
    footprint: [71, 1.2, 147],
    examples: ["Samsung 6.1\" LTPO OLED", "ILI9341 2.8\" TFT", "Waveshare 7\" HDMI"],
  },
  {
    model: "oled_module",
    label: "OLED display module",
    category: "display",
    description: "0.96\"/1.3\" I2C OLED breakout with 4-pin header.",
    params: {},
    footprint: [27, 4, 27],
    examples: ["SSD1306 0.96\" 128x64 I2C", "SH1106 1.3\""],
  },
  {
    model: "led",
    label: "LED",
    category: "io",
    description: "5 mm through-hole LED (dome + legs) or SMD LED.",
    params: {
      color: { default: "#ff3b30", description: "emitted colour" },
      diameter: { default: 5, unit: "mm", description: "lens diameter" },
    },
    footprint: [5, 9, 5],
    examples: ["5mm red LED", "WS2812B NeoPixel"],
  },
  {
    model: "button",
    label: "Push button",
    category: "io",
    description: "Tactile switch (6x6/12x12) with cap.",
    params: { size: { default: 12, unit: "mm", description: "body size" } },
    footprint: [12, 8, 12],
    examples: ["Omron B3F 12mm", "6x6 tactile switch"],
  },
  {
    model: "switch_toggle",
    label: "Toggle/rocker switch",
    category: "io",
    description: "Panel-mount power switch.",
    params: {},
    footprint: [13, 20, 8],
    examples: ["SPDT mini toggle", "KCD1 rocker"],
  },
  {
    model: "breadboard",
    label: "Solderless breadboard",
    category: "structure",
    description: "White breadboard with terminal strips, centre channel and red/blue power rails.",
    params: { size: { default: "full", description: "'full' (165x55, 830 tie points) or 'half' (82x55, 400)" } },
    footprint: [165, 9, 55],
    examples: ["BusBoard BB830", "Half-size 400 tie-point"],
  },
  // ---------------- rf / audio ----------------
  {
    model: "antenna",
    label: "Antenna",
    category: "rf",
    description: "Whip/dipole antenna with SMA base, or flat FPC antenna.",
    params: {
      length: { default: 50, unit: "mm", description: "whip length" },
      variant: { default: "whip", description: "'whip' | 'fpc' | 'lollipop'" },
    },
    footprint: [8, 50, 8],
    examples: ["Foxeer Lollipop 5.8GHz", "ExpressLRS T-antenna", "2.4GHz FPC antenna"],
  },
  {
    model: "rf_module",
    label: "Radio module",
    category: "rf",
    description: "Small RF receiver/transceiver/VTX board with shield can (ELRS RX, nRF24, LoRa, VTX).",
    params: {
      width: { default: 20, unit: "mm", description: "x size" },
      length: { default: 25, unit: "mm", description: "z size" },
      label: { default: "RX", description: "marking" },
    },
    footprint: [20, 5, 25],
    examples: ["BetaFPV ELRS Nano RX", "nRF24L01+", "RFM95 LoRa", "Rush Tank VTX"],
  },
  {
    model: "speaker",
    label: "Speaker",
    category: "audio",
    description: "Round speaker driver with cone and frame, or rectangular micro speaker box.",
    params: {
      diameter: { default: 28, unit: "mm", description: "frame diameter (round)" },
      height: { default: 5, unit: "mm", description: "depth" },
      variant: { default: "round", description: "'round' | 'box'" },
    },
    footprint: [28, 5, 28],
    examples: ["Adafruit 3W 4Ω", "Phone bottom speaker module"],
  },
  // ---------------- structure / hardware ----------------
  {
    model: "screw",
    label: "Screw",
    category: "structure",
    description: "Socket head cap screw with hex recess and thread.",
    params: {
      diameter: { default: 3, unit: "mm", description: "M size" },
      length: { default: 8, unit: "mm", description: "thread length" },
    },
    footprint: [5.5, 11, 5.5],
    origin: "Under-head bearing face at y = 0; head extends +Y, thread extends -Y down to y = -length.",
    examples: ["M3x8 ISO 4762", "M2x6"],
  },
  {
    model: "standoff",
    label: "Hex standoff",
    category: "structure",
    description: "Aluminium or nylon hex spacer.",
    params: {
      diameter: { default: 5, unit: "mm", description: "across flats" },
      length: { default: 20, unit: "mm", description: "length (Y)" },
      color: { default: "#8e44ad", description: "anodize colour" },
    },
    footprint: [5, 20, 5],
    examples: ["M3x20 aluminium standoff", "M2 nylon spacer"],
  },
  {
    model: "heatsink",
    label: "Heatsink",
    category: "structure",
    description: "Finned aluminium heatsink.",
    params: {
      width: { default: 20, unit: "mm", description: "x size" },
      length: { default: 20, unit: "mm", description: "z size" },
      height: { default: 10, unit: "mm", description: "y size" },
    },
    footprint: [20, 10, 20],
    examples: ["Pi 5 active cooler", "TO-220 heatsink"],
  },
  {
    model: "solar_panel",
    label: "Solar panel",
    category: "power",
    description: "Small PV panel with cell grid.",
    params: {
      width: { default: 110, unit: "mm", description: "x size" },
      length: { default: 60, unit: "mm", description: "z size" },
    },
    footprint: [110, 3, 60],
    examples: ["6V 1W mini solar panel", "Voltaic 2W"],
  },
];

export const CATALOG_BY_MODEL: Record<string, CatalogEntry> = Object.fromEntries(CATALOG.map((c) => [c.model, c]));

/** Compact text description of the catalog for agent prompts. */
export function catalogForPrompt(): string {
  return CATALOG.map((c) => {
    const params = Object.entries(c.params)
      .map(([k, p]) => `${k}=${JSON.stringify(p.default)}${p.unit ? p.unit : ""} (${p.description})`)
      .join("; ");
    return `- ${c.model}: ${c.description} Footprint at defaults [x,y,z]=${JSON.stringify(c.footprint)}mm.${c.origin ? " " + c.origin : ""}${params ? " Params: " + params + "." : ""} e.g. ${c.examples.slice(0, 3).join(", ")}`;
  }).join("\n");
}
