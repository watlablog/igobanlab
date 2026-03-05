import { useEffect, useMemo, useRef, useState } from "react";
import { h, render } from "preact";
import { Goban, type Map as ShudanMap, type Marker } from "@sabaki/shudan";
import type { GameState } from "../types/models";
import { computeVertexSize } from "../app/layout";

type GobanViewProps = {
  state: GameState;
  disabled?: boolean;
  compact?: boolean;
  showCoordinates?: boolean;
  onPlay: (x: number, y: number) => void;
};

const convertSign = (value: number): 0 | 1 | -1 => {
  if (value === 1) return 1;
  if (value === 2) return -1;
  return 0;
};

const createEmptyMarkerMap = (boardSize: number): ShudanMap<Marker | null> =>
  Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => null));

export const GobanView = ({
  state,
  disabled = false,
  compact = false,
  showCoordinates = true,
  onPlay
}: GobanViewProps) => {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [vertexSize, setVertexSize] = useState(30);

  const signMap = useMemo<ShudanMap<0 | 1 | -1>>(() => {
    return Array.from({ length: state.boardSize }, (_, y) =>
      Array.from({ length: state.boardSize }, (_, x) => convertSign(state.grid[y * state.boardSize + x]))
    );
  }, [state.boardSize, state.grid]);

  const markerMap = useMemo<ShudanMap<Marker | null>>(() => {
    const markers = createEmptyMarkerMap(state.boardSize);
    if (state.lastMove && !("pass" in state.lastMove)) {
      markers[state.lastMove.y][state.lastMove.x] = { type: "point", label: "last" };
    }
    return markers;
  }, [state.boardSize, state.lastMove]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const nextSize = computeVertexSize({
        containerWidth: entry.contentRect.width,
        containerHeight: entry.contentRect.height,
        boardSize: state.boardSize,
        showCoordinates
      });
      setVertexSize((prev) => (prev === nextSize ? prev : nextSize));
    });

    observer.observe(shell);
    return () => {
      observer.disconnect();
    };
  }, [showCoordinates, state.boardSize]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    render(
      h(Goban, {
        className: `igl-goban ${compact ? "compact" : ""}`,
        vertexSize,
        showCoordinates,
        signMap,
        markerMap,
        busy: disabled,
        onVertexClick: (_evt: MouseEvent, vertex: [number, number]) => {
          const [x, y] = vertex;
          onPlay(x, y);
        }
      }),
      mount
    );

    return () => {
      render(null, mount);
    };
  }, [compact, disabled, markerMap, onPlay, showCoordinates, signMap, vertexSize]);

  return (
    <div className={`goban-view ${compact ? "compact" : ""}`} ref={shellRef}>
      <div className="goban-mount" ref={mountRef} />
    </div>
  );
};
