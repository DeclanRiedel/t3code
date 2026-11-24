import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import { PreviewError } from "./previewFailure";

/** Above this the view would hold too much geometry; the byte cap already bounds binary files near 1M. */
const STL_MAX_TRIANGLES = 2_000_000;

/** Geometry ready to draw: Y-up and centered on the origin, with one flat normal per triangle. */
export interface StlGeometry {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** The model's extent along its own X, Y and Z axes, in file units (usually millimetres). */
  readonly size: readonly [number, number, number];
  readonly triangles: number;
}

/**
 * Parses a binary or ASCII STL file. Runs in a worker, so a large file never blocks the page.
 * Throws a `PreviewError` for files that are damaged, empty, or too large to draw.
 */
export function buildStlGeometry(
  bytes: ArrayBuffer,
  maxTriangles: number = STL_MAX_TRIANGLES,
): StlGeometry {
  let source: Float32Array;
  try {
    source = new STLLoader().parse(bytes).getAttribute("position").array as Float32Array;
  } catch {
    throw new PreviewError({ code: "stl-damaged" });
  }
  const triangles = Math.floor(source.length / 9);
  if (triangles < 1) throw new PreviewError({ code: "stl-empty" });
  if (triangles > maxTriangles) throw new PreviewError({ code: "stl-too-many-triangles" });

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < triangles * 9; index++) {
    const value = source[index]!;
    if (!Number.isFinite(value)) throw new PreviewError({ code: "stl-damaged" });
    const axis = index % 3;
    if (value < min[axis]!) min[axis] = value;
    if (value > max[axis]!) max[axis] = value;
  }
  const center = min.map((low, axis) => (low + max[axis]!) / 2);

  // STL is Z-up and three.js is Y-up: (x, y, z) becomes (x, z, -y), centered on the origin.
  const positions = new Float32Array(triangles * 9);
  for (let index = 0; index < triangles * 9; index += 3) {
    positions[index] = source[index]! - center[0]!;
    positions[index + 1] = source[index + 2]! - center[2]!;
    positions[index + 2] = -(source[index + 1]! - center[1]!);
  }

  // Many exporters write zero facet normals, which light as solid black, so compute them.
  const normals = new Float32Array(triangles * 9);
  for (let index = 0; index < triangles * 9; index += 9) {
    const ax = positions[index + 3]! - positions[index]!;
    const ay = positions[index + 4]! - positions[index + 1]!;
    const az = positions[index + 5]! - positions[index + 2]!;
    const bx = positions[index + 6]! - positions[index]!;
    const by = positions[index + 7]! - positions[index + 1]!;
    const bz = positions[index + 8]! - positions[index + 2]!;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz) || 1;
    for (let corner = 0; corner < 9; corner += 3) {
      normals[index + corner] = nx / length;
      normals[index + corner + 1] = ny / length;
      normals[index + corner + 2] = nz / length;
    }
  }

  return {
    positions,
    normals,
    size: [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!],
    triangles,
  };
}
