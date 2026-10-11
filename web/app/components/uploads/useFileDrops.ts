import { type DragEvent, useRef, useState } from "react";

export interface FileDrops {
  /** True while files are dragged over the zone; the zone draws `.drop-target`. */
  over: boolean;
  /** Spread onto the zone element. */
  handlers: {
    onDragEnter: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
}

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/**
 * Lets a zone take files dropped on it. A drag that carries no files, such as
 * text, passes by untouched.
 */
export function useFileDrops(onFiles: (files: File[]) => void): FileDrops {
  const [over, setOver] = useState(false);
  // Entering a child fires dragenter before the parent's dragleave, so count.
  const depth = useRef(0);

  return {
    over,
    handlers: {
      onDragEnter(event) {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current++;
        setOver(true);
      },
      onDragOver(event) {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave(event) {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop(event) {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = [...event.dataTransfer.files];
        if (files.length) onFiles(files);
      },
    },
  };
}
