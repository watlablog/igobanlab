import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { h, render } from "preact";
import { Goban, type Map as ShudanMap, type Marker } from "@sabaki/shudan";
import type { GameState } from "../types/models";
import { computeVertexSize } from "../app/layout";

type GobanViewProps = {
  state: GameState;
  disabled?: boolean;
  compact?: boolean;
  showCoordinates?: boolean;
  extraMarkerMap?: ShudanMap<Marker | null>;
  selectedVertices?: [number, number][];
  onPlay: (x: number, y: number) => void;
};

const convertSign = (value: number): 0 | 1 | -1 => {
  if (value === 1) return 1;
  if (value === 2) return -1;
  return 0;
};

export const GobanView = ({
  state,
  disabled = false,
  compact = false,
  showCoordinates = true,
  extraMarkerMap,
  selectedVertices = [],
  onPlay
}: GobanViewProps) => {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onPlayRef = useRef(onPlay);
  const [vertexSize, setVertexSize] = useState(30);

  useEffect(() => {
    onPlayRef.current = onPlay;
  }, [onPlay]);

  const signMap = useMemo<ShudanMap<0 | 1 | -1>>(() => {
    return Array.from({ length: state.boardSize }, (_, y) =>
      Array.from({ length: state.boardSize }, (_, x) => convertSign(state.grid[y * state.boardSize + x]))
    );
  }, [state.boardSize, state.grid]);

  const markerMap = useMemo<ShudanMap<Marker | null> | undefined>(
    () => extraMarkerMap,
    [extraMarkerMap]
  );

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

  const handleVertexClick = useCallback((_evt: MouseEvent, vertex: [number, number]) => {
    const [x, y] = vertex;
    onPlayRef.current(x, y);
  }, []);

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
        selectedVertices,
        busy: disabled,
        animateStonePlacement: false,
        fuzzyStonePlacement: false,
        onVertexClick: handleVertexClick
      }),
      mount
    );
  }, [compact, disabled, handleVertexClick, markerMap, selectedVertices, showCoordinates, signMap, vertexSize]);

  useEffect(() => {
    return () => {
      const mount = mountRef.current;
      if (mount) {
        render(null, mount);
      }
    };
  }, []);

  return (
    <div className={`goban-view ${compact ? "compact" : ""}`} ref={shellRef}>
      <div className="goban-mount" ref={mountRef} />
    </div>
  );
};
