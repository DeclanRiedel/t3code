import { useGT } from "gt-react";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BufferAttribute, BufferGeometry } from "three";

import { FileSurfaceAction, FileSurfaceFailure, FileSurfaceLoading } from "./fileSurfaceChrome";
import { mountModelScene } from "./modelScene";
import { parseStlPreview } from "./parseStlPreview";
import { previewErrorText } from "./previewFailureMessages";

interface Model {
  readonly geometry: BufferGeometry;
  readonly size: readonly [number, number, number];
  readonly triangles: number;
}

const formatLength = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 2 : 1 });

/** Interactive view of an STL file; the file is parsed in a worker, so large models never freeze the page. */
export default function ModelViewer(props: { readonly src: string; readonly name: string }) {
  const gt = useGT();
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Fetch and parse the model from its URL, aborting the request and freeing the geometry when the source changes or unmounts.
  useEffect(() => {
    const controller = new AbortController();
    let geometry: BufferGeometry | null = null;
    void parseStlPreview(props.src, controller.signal)
      .then((parsed) => {
        if (controller.signal.aborted) return;
        geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(parsed.positions, 3));
        geometry.setAttribute("normal", new BufferAttribute(parsed.normals, 3));
        geometry.computeBoundingSphere();
        setModel({ geometry, size: parsed.size, triangles: parsed.triangles });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(previewErrorText(cause, gt("The model could not be loaded.")));
      });
    return () => {
      controller.abort();
      geometry?.dispose();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `gt` only words the fallback error; a language switch should not reload the model.
  }, [props.src]);
  const geometry = model?.geometry ?? null;
  const mountScene = (host: HTMLDivElement) => {
    if (!geometry) return;
    let scene: ReturnType<typeof mountModelScene>;
    try {
      scene = mountModelScene(host, geometry);
    } catch {
      setError(gt("3D previews need WebGL, which is unavailable here."));
      return;
    }
    resetRef.current = scene.reset;
    return () => {
      resetRef.current = null;
      scene.dispose();
    };
  };
  if (error) return <FileSurfaceFailure message={error} />;
  if (!model) return <FileSurfaceLoading />;
  const [x, y, z] = model.size;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={mountScene}
        role="img"
        aria-label={gt("3D model of {name}", { name: props.name })}
        className="relative min-h-0 flex-1 cursor-grab touch-none active:cursor-grabbing"
      />
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border/60 px-3 text-xs text-muted-foreground tabular-nums">
        <span className="min-w-0 flex-1 truncate">
          {gt(
            "{x} × {y} × {z} mm · {count, plural, one {{triangles} triangle} other {{triangles} triangles}}",
            {
              x: formatLength(x),
              y: formatLength(y),
              z: formatLength(z),
              count: model.triangles,
              triangles: model.triangles.toLocaleString(),
            },
          )}
        </span>
        <FileSurfaceAction label={gt("Reset view")} onPress={() => resetRef.current?.()}>
          <RotateCcwIcon className="size-3.5" />
        </FileSurfaceAction>
      </div>
    </div>
  );
}
