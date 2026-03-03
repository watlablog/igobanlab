import { useEffect, useMemo, useRef } from "react";
import { h, render } from "preact";
import { Goban, type Map as ShudanMap, type Marker } from "@sabaki/shudan";
import type { GameState } from "../types/models";

type GobanViewProps = {
  state: GameState;
  disabled?: boolean;
  onPlay: (x: number, y: number) => void;
};

const convertSign = (value: number): 0 | 1 | -1 => {
  if (value === 1) return 1;
  if (value === 2) return -1;
  return 0;
};

const createEmptyMarkerMap = (boardSize: number): ShudanMap<Marker | null> =>
  Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => null));

export const GobanView = ({ state, disabled = false, onPlay }: GobanViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    const container = containerRef.current;
    if (!container) {
      return;
    }

    render(
      h(Goban, {
        className: "igl-goban",
        vertexSize: 30,
        showCoordinates: true,
        signMap,
        markerMap,
        busy: disabled,
        onVertexClick: (_evt: MouseEvent, vertex: [number, number]) => {
          const [x, y] = vertex;
          onPlay(x, y);
        }
      }),
      container
    );

    return () => {
      render(null, container);
    };
  }, [disabled, markerMap, onPlay, signMap]);

  return (
    <section className="goban-card">
      <div ref={containerRef} />
    </section>
  );
};
