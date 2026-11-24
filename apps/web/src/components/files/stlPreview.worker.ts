import { previewFailure } from "./previewFailure";
import { buildStlGeometry } from "./stlGeometry";

self.addEventListener("message", (event: MessageEvent<{ bytes: ArrayBuffer }>) => {
  try {
    const geometry = buildStlGeometry(event.data.bytes);
    self.postMessage(
      { geometry },
      { transfer: [geometry.positions.buffer, geometry.normals.buffer] },
    );
  } catch (cause) {
    self.postMessage({ failure: previewFailure(cause, "stl-damaged") }, { transfer: [] });
  }
});
