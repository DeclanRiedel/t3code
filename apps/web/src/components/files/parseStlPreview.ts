import { msg } from "gt-react";

import { m } from "~/i18n/messages";

import type { PreviewFailure } from "./previewFailure";
import { previewFailureText } from "./previewFailureMessages";
import { readBinaryPreview } from "./readBinaryPreview";
import type { StlGeometry } from "./stlGeometry";

/** Downloads an STL file (up to the binary preview limit) and parses it in a worker. */
export async function parseStlPreview(src: string, signal: AbortSignal) {
  const worker = new Worker(new URL("./stlPreview.worker.ts", import.meta.url), {
    type: "module",
  });
  const controller = new AbortController();
  try {
    return await new Promise<StlGeometry>((resolve, reject) => {
      const fail = (message: string) => reject(new Error(message));
      const abort = () => fail(m(msg("Model loading cancelled.")));
      signal.addEventListener("abort", abort, { signal: controller.signal });
      if (signal.aborted) return abort();
      const timer = setTimeout(() => fail(m(msg("This model took too long to load."))), 30_000);
      controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      worker.addEventListener("error", () => fail(m(msg("Could not load the model reader."))));
      worker.addEventListener(
        "message",
        (event: MessageEvent<{ geometry?: StlGeometry; failure?: PreviewFailure }>) => {
          if (event.data.geometry) resolve(event.data.geometry);
          else
            fail(previewFailureText(event.data.failure ?? { code: "stl-damaged", message: "" }, m));
        },
      );
      void readBinaryPreview(src, controller.signal).then(
        (bytes) => worker.postMessage({ bytes }, [bytes]),
        reject,
      );
    });
  } finally {
    controller.abort();
    worker.terminate();
  }
}
