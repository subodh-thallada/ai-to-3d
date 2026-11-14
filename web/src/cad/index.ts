/**
 * Protoforge CAD viewer module.
 *
 * Conventions (match shared/src/types.ts + catalog.ts):
 *  - Units are millimetres; Y is up; right-handed. Part rotations are XYZ Euler in DEGREES.
 *  - CadPart.position is the world position of the part's local origin. Primitives are centred on
 *    their origin (extrude: plan profile [x,z] extruded along +Y, centred; torus in XZ; cylinder/cone/capsule on Y).
 *  - CadPart.cuts are boolean subtractions whose transforms are in the parent part's local frame.
 *  - Catalog components ({ type: "component", model }) have their origin at the centre of the bottom
 *    face (unless the catalog entry's `origin` says otherwise, e.g. wheel = centre, screw = under-head).
 *  - Exploded view offsets a part by `explode * (part.explode ?? radial direction from the assembly centre)`.
 *  - Exports: STL in mm; GLB in metres (glTF convention) with one node per part.
 */
export { CadViewer, JOINT_COLORS } from "./CadViewer";
export type { CadViewerProps, CadViewerApi } from "./CadViewer";
export { CadWorkspace } from "./CadWorkspace";
export type { CadWorkspaceProps } from "./CadWorkspace";
export { ComponentLibraryPage } from "./ComponentLibraryPage";
export { ComponentModel, MODEL_COMPONENTS, resolveParams } from "./library";
