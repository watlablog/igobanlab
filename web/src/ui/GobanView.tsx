import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { h, render } from "preact";
import { Goban, type Map as ShudanMap, type Marker } from "@sabaki/shudan";
import type { GameState } from "../types/models";
import { computeVertexSize } from "../app/layout";

type GobanViewProps = {
  state: GameState;
  disabled?: boolean;
  compact?: boolean;
  showCoordinates?: boolean;
  resizeKey?: number;
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
  resizeKey = 0,
  extraMarkerMap,
  selectedVertices = [],
  onPlay
}: GobanViewProps) => {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onPlayRef = useRef(onPlay);
  const [vertexSize, setVertexSize] = useState<number | null>(null);

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

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const rect = shell.getBoundingClientRect();
    const nextSize = computeVertexSize({
      containerWidth: rect.width,
      containerHeight: rect.height,
      boardSize: state.boardSize,
      showCoordinates
    });
    setVertexSize((prev) => (prev === nextSize ? prev : nextSize));
  }, [resizeKey, showCoordinates, state.boardSize]);

  const handleVertexClick = useCallback((_evt: MouseEvent, vertex: [number, number]) => {
    const [x, y] = vertex;
    onPlayRef.current(x, y);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    if (vertexSize == null) {
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
