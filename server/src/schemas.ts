/**
 * JSON Schemas for each agent's tool input. Deliberately PERMISSIVE (few required fields, no oneOf):
 * everything is repaired and validated afterwards in normalize.ts.
 */

type Schema = Record<string, unknown>;

const num: Schema = { type: "number" };
const str: Schema = { type: "string" };
const strArr: Schema = { type: "array", items: str };
const vec3: Schema = { type: "array", items: num, minItems: 3, maxItems: 3, description: "[x, y, z] mm" };
const vec2: Schema = { type: "array", items: num, minItems: 2, maxItems: 2 };
const strMap: Schema = { type: "object", additionalProperties: { type: "string" } };

export const MATERIAL_PRESETS = [
  "aluminum", "anodized_black", "steel", "stainless", "titanium", "brass", "copper", "gold", "carbon_fiber",
  "abs_plastic", "pla", "petg", "nylon", "rubber", "silicone", "glass", "lens", "screen", "pcb_green",
  "pcb_black", "pcb_blue", "ceramic", "wood", "fabric", "foam",
] as const;

export const GEOMETRY_TYPES = ["box", "cylinder", "cone", "sphere", "torus", "capsule", "extrude", "lathe", "tube", "component"] as const;

export const JOINT_TYPES = [
  "fastened", "threaded", "revolute", "prismatic", "press_fit", "snap_fit", "adhesive", "soldered", "wired", "magnetic", "clamped",
] as const;

export const BOM_CATEGORIES = [
  "electronics", "mechanical", "fastener", "fabricated", "power", "propulsion", "sensor", "display", "enclosure", "cable", "other",
] as const;

export const PIN_TYPES = [
  "power_in", "power_out", "ground", "digital", "analog", "pwm", "i2c_sda", "i2c_scl", "spi_mosi", "spi_miso", "spi_sck",
  "spi_cs", "uart_tx", "uart_rx", "usb", "motor", "signal", "nc",
] as const;

export const COMPONENT_KINDS = [
  "mcu", "sensor", "actuator", "driver", "power", "passive", "connector", "module", "display", "communication", "other",
] as const;

export const NET_TYPES = ["power", "ground", "signal", "bus", "motor", "data"] as const;

export const FIRMWARE_LANGS = ["cpp", "c", "python", "rust", "javascript", "typescript", "swift", "kotlin"] as const;

export const REVIEW_CATEGORIES = ["mechanical", "electrical", "firmware", "sourcing", "assembly", "safety", "consistency"] as const;

/** One flat geometry object; fields used depend on `type`. */
const geometry: Schema = {
  type: "object",
  description:
    "Geometry. box: size,radius | cylinder: radius,height,radiusTop | cone: radius,height | sphere: radius | torus: radius,tube | capsule: radius,length | extrude: profile,holes,depth,bevel | lathe: profile ([radius,y] points) | tube: path,radius | component: model,params",
  properties: {
    type: { type: "string", enum: [...GEOMETRY_TYPES] },
    size: vec3,
    radius: num,
    height: num,
    radiusTop: num,
    tube: num,
    length: num,
    profile: { type: "array", items: vec2 },
    holes: { type: "array", items: { type: "array", items: vec2 } },
    depth: num,
    bevel: num,
    path: { type: "array", items: vec3 },
    segments: num,
    model: { type: "string", description: "catalog model id (component only)" },
    params: { type: "object", additionalProperties: { type: ["number", "string"] } },
  },
  required: ["type"],
};

const material: Schema = {
  type: "object",
  properties: {
    preset: { type: "string", enum: [...MATERIAL_PRESETS] },
    color: { type: "string", description: "#rrggbb" },
    metalness: num,
    roughness: num,
    opacity: num,
    emissive: { type: "string", description: "#rrggbb glow colour" },
  },
};

const cut: Schema = {
  type: "object",
  properties: { geometry, position: vec3, rotation: vec3 },
  required: ["geometry", "position"],
};

const joint: Schema = {
  type: "object",
  properties: {
    id: str,
    type: { type: "string", enum: [...JOINT_TYPES] },
    partA: { type: "string", description: "part id" },
    partB: { type: "string", description: "part id" },
    fastener: str,
    description: str,
    anchor: vec3,
  },
  required: ["type", "partA", "partB"],
};

/* ------------------------------------------------------------------ */

export const briefSchema: Schema = {
  type: "object",
  properties: {
    name: str,
    tagline: str,
    category: str,
    description: str,
    requirements: {
      type: "object",
      properties: {
        functional: strArr,
        performance: strMap,
        constraints: strArr,
      },
    },
    envelope: { ...vec3, description: "overall bounding size [x, y, z] mm" },
    coordinateNotes: str,
    subsystems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "short kebab-case id, e.g. 'frame'" },
          name: str,
          description: str,
          envelope: {
            type: "object",
            properties: { center: vec3, size: vec3 },
            required: ["center", "size"],
          },
          keyParts: strArr,
          interfaces: strArr,
        },
        required: ["id", "name", "envelope", "keyParts", "interfaces"],
      },
    },
    keyComponents: {
      type: "array",
      items: {
        type: "object",
        properties: { name: str, partNumber: str, role: str, qty: num },
        required: ["name", "role"],
      },
    },
    hasElectronics: { type: "boolean" },
    hasFirmware: { type: "boolean" },
    firmwarePlatform: str,
    risks: strArr,
  },
  required: ["name", "envelope", "subsystems", "hasElectronics", "hasFirmware"],
};

export const cadSchema: Schema = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "short unique id within this subsystem, e.g. 'top-plate'" },
          name: str,
          geometry,
          position: { ...vec3, description: "WORLD position of the part origin (mm)" },
          rotation: { ...vec3, description: "XYZ Euler degrees" },
          material,
          cuts: { type: "array", items: cut },
          description: str,
          fabrication: str,
          massG: num,
          partNumber: { type: "string", description: "real manufacturer part number for purchased parts" },
        },
        required: ["id", "name", "geometry", "position"],
      },
    },
    joints: { type: "array", items: joint },
    notes: str,
  },
  required: ["parts", "joints"],
};

export const bomSchema: Schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str,
          name: str,
          category: { type: "string", enum: [...BOM_CATEGORIES] },
          manufacturer: str,
          partNumber: str,
          supplier: str,
          url: { type: "string", description: "supplier SEARCH url only; never a guessed product page" },
          qty: num,
          unitPrice: { type: "number", description: "USD" },
          specs: strMap,
          massG: num,
          notes: str,
          fabrication: str,
          alternatives: strArr,
          electronicsIds: { type: "array", items: str, description: "netlist component ids this line supplies (e.g. ['R1','R2'])" },
        },
        required: ["id", "name", "category", "qty", "unitPrice"],
      },
    },
  },
  required: ["items"],
};

export const electronicsSchema: Schema = {
  type: "object",
  properties: {
    summary: str,
    supplyVoltage: num,
    logicVoltage: num,
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "reference designator style id, e.g. 'U1', 'M1', 'R3', 'BAT1'" },
          name: str,
          partNumber: str,
          kind: { type: "string", enum: [...COMPONENT_KINDS] },
          pins: {
            type: "array",
            items: {
              type: "object",
              properties: { id: str, label: str, type: { type: "string", enum: [...PIN_TYPES] } },
              required: ["id", "type"],
            },
          },
          mount: { type: "string", enum: ["breadboard", "offboard", "pcb"] },
          value: str,
          description: str,
        },
        required: ["id", "name", "kind", "pins", "mount"],
      },
    },
    nets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str,
          name: str,
          type: { type: "string", enum: [...NET_TYPES] },
          voltage: num,
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: { component: { type: "string", description: "component id" }, pin: { type: "string", description: "pin id" } },
              required: ["component", "pin"],
            },
          },
          color: str,
          wireGauge: str,
          notes: str,
        },
        required: ["id", "name", "type", "nodes"],
      },
    },
    powerBudget: {
      type: "array",
      items: {
        type: "object",
        properties: { component: str, voltage: num, currentMa: num, notes: str },
        required: ["component", "voltage", "currentMa"],
      },
    },
    wiringSteps: strArr,
    safetyNotes: strArr,
  },
  required: ["components", "nets", "powerBudget", "wiringSteps"],
};

export const firmwareSchema: Schema = {
  type: "object",
  properties: {
    platform: str,
    language: { type: "string", enum: [...FIRMWARE_LANGS] },
    target: str,
    files: {
      type: "array",
      items: {
        type: "object",
        properties: { path: str, content: str, description: str },
        required: ["path", "content"],
      },
    },
    libraries: {
      type: "array",
      items: { type: "object", properties: { name: str, version: str, purpose: str }, required: ["name"] },
    },
    build: strArr,
    pinMap: {
      type: "array",
      items: {
        type: "object",
        properties: { pin: str, component: str, function: str },
        required: ["pin", "component", "function"],
      },
    },
    notes: strArr,
  },
  required: ["platform", "language", "target", "files", "build", "pinMap"],
};

export const integrationSchema: Schema = {
  type: "object",
  properties: {
    joints: { type: "array", items: joint },
    positionFixes: {
      type: "array",
      items: {
        type: "object",
        properties: { partId: str, position: vec3, reason: str },
        required: ["partId", "position"],
      },
    },
    links: {
      type: "array",
      items: {
        type: "object",
        properties: { partId: str, bomId: str, electronicsId: str },
        required: ["partId"],
      },
    },
    notes: strArr,
  },
  required: ["joints", "positionFixes", "links"],
};

export const assemblySchema: Schema = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: num,
          title: str,
          description: str,
          partIds: strArr,
          tools: strArr,
          durationMin: num,
          caution: str,
        },
        required: ["step", "title", "description", "partIds"],
      },
    },
  },
  required: ["steps"],
};

export const reviewSchema: Schema = {
  type: "object",
  properties: {
    score: { type: "number", description: "0-100 overall engineering quality" },
    summary: str,
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str,
          category: { type: "string", enum: [...REVIEW_CATEGORIES] },
          name: str,
          status: { type: "string", enum: ["pass", "warn", "fail"] },
          detail: str,
        },
        required: ["category", "name", "status", "detail"],
      },
    },
    suggestions: strArr,
  },
  required: ["score", "summary", "checks", "suggestions"],
};
