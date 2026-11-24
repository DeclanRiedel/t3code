import { describe, expect, it } from "vite-plus/test";

import { isPreviewError } from "./previewFailure";
import { buildStlGeometry } from "./stlGeometry";

/** A binary STL whose facet normals are all zero, as many exporters write them. */
function binaryStl(triangles: ReadonlyArray<ReadonlyArray<number>>) {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((corners, triangle) => {
    corners.forEach((value, index) =>
      view.setFloat32(84 + triangle * 50 + 12 + index * 4, value, true),
    );
  });
  return buffer;
}

const failureCode = (run: () => unknown) => {
  try {
    run();
  } catch (cause) {
    return isPreviewError(cause) ? cause.code : "other";
  }
  return null;
};

describe("buildStlGeometry", () => {
  it("centers a Z-up binary model as Y-up and lights it despite zero facet normals", () => {
    // A right triangle on the XZ plane of the file: 10 wide, 20 tall, at height Y = 5.
    const geometry = buildStlGeometry(binaryStl([[0, 5, 0, 10, 5, 0, 0, 5, 20]]));
    expect(geometry.triangles).toBe(1);
    expect(geometry.size).toEqual([10, 0, 20]);
    expect([...geometry.positions]).toEqual([-5, -10, -0, 5, -10, -0, -5, 10, -0]);
    expect(Math.hypot(...geometry.normals.subarray(0, 3))).toBeCloseTo(1);
  });

  it("reads ASCII files", () => {
    const text = `solid part
facet normal 0 0 0
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 1 0
 endloop
endfacet
endsolid part
`;
    expect(buildStlGeometry(new TextEncoder().encode(text).buffer).triangles).toBe(1);
  });

  it("rejects empty, damaged, and oversized models", () => {
    expect(failureCode(() => buildStlGeometry(binaryStl([])))).toBe("stl-empty");
    expect(
      failureCode(() => buildStlGeometry(new TextEncoder().encode("not a model").buffer)),
    ).toBe("stl-damaged");
    expect(
      failureCode(() => buildStlGeometry(binaryStl([[0, 0, 0, Infinity, 0, 0, 0, 1, 0]]))),
    ).toBe("stl-damaged");
    const two = binaryStl([
      [0, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 1, 1, 0, 1, 0, 1, 1],
    ]);
    expect(failureCode(() => buildStlGeometry(two, 1))).toBe("stl-too-many-triangles");
  });
});
