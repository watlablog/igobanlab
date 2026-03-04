import type { GameSetup, GameSnapshot, GameState, Move, Player } from "../types/models";
import { applyMove, applyPass, redo as redoState, undo as undoState } from "./rules";

export type GameAction =
  | { type: "PLAY"; move: Move }
  | { type: "PASS" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; boardSize?: number }
  | { type: "LOAD"; state: GameState };

export const DEFAULT_KOMI = 6.5;
const MAX_HANDICAP = 9;

const toBoardIndex = (x: number, y: number, boardSize: number): number => y * boardSize + x;

const clampHandicap = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_HANDICAP, Math.trunc(value)));
};

const normalizeKomi = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_KOMI;
  return Math.round(value * 2) / 2;
};

const getStarLine = (boardSize: number): number => {
  if (boardSize === 9) return 2;
  return 3;
};

const getHandicapVertices = (boardSize: number): Array<[number, number]> => {
  const s = getStarLine(boardSize);
  const m = Math.floor(boardSize / 2);
  const e = boardSize - 1 - s;

  const points = {
    upperRight: [e, s] as [number, number],
    lowerLeft: [s, e] as [number, number],
    lowerRight: [e, e] as [number, number],
    upperLeft: [s, s] as [number, number],
    rightMiddle: [e, m] as [number, number],
    leftMiddle: [s, m] as [number, number],
    topMiddle: [m, s] as [number, number],
    bottomMiddle: [m, e] as [number, number],
    center: [m, m] as [number, number]
  };

  return [
    points.upperRight,
    points.lowerLeft,
    points.lowerRight,
    points.upperLeft,
    points.rightMiddle,
    points.leftMiddle,
    points.topMiddle,
    points.bottomMiddle,
    points.center
  ];
};

const getHandicapVerticesByCount = (boardSize: number, handicap: number): Array<[number, number]> => {
  const points = getHandicapVertices(boardSize);

  if (handicap <= 0) return [];
  if (handicap === 1) return [points[0]];
  if (handicap === 2) return [points[0], points[1]];
  if (handicap === 3) return [points[0], points[1], points[2]];
  if (handicap === 4) return [points[0], points[1], points[2], points[3]];
  if (handicap === 5) return [points[0], points[1], points[2], points[3], points[8]];
  if (handicap === 6) return [points[0], points[1], points[2], points[3], points[4], points[5]];
  if (handicap === 7) return [points[0], points[1], points[2], points[3], points[4], points[5], points[8]];
  if (handicap === 8) {
    return [points[0], points[1], points[2], points[3], points[4], points[5], points[6], points[7]];
  }

  return [...points];
};

export const createInitialState = (
  boardSize = 19,
  toPlay: Player = "B",
  setup: Partial<GameSetup> = {}
): GameState => ({
  boardSize,
  komi: setup.komi ?? DEFAULT_KOMI,
  handicap: setup.handicap ?? 0,
  toPlay,
  grid: new Int8Array(boardSize * boardSize),
  captures: { B: 0, W: 0 },
  moves: [],
  history: [],
  future: [],
  lastMove: null
});

export const createStateFromSetup = (setup: GameSetup): GameState => {
  const boardSize = setup.boardSize;
  const handicap = clampHandicap(setup.handicap);
  const komi = normalizeKomi(setup.komi);

  const grid = new Int8Array(boardSize * boardSize);
  const handicapVertices = getHandicapVerticesByCount(boardSize, handicap);

  for (const [x, y] of handicapVertices) {
    grid[toBoardIndex(x, y, boardSize)] = 1;
  }

  return {
    boardSize,
    komi,
    handicap,
    toPlay: handicap > 0 ? "W" : "B",
    grid,
    captures: { B: 0, W: 0 },
    moves: [],
    history: [],
    future: [],
    lastMove: null
  };
};

export const snapshotFromState = (state: GameState): GameSnapshot => ({
  boardSize: state.boardSize,
  komi: state.komi,
  handicap: state.handicap,
  toPlay: state.toPlay,
  grid: state.grid.slice(),
  captures: { ...state.captures },
  moves: state.moves.map((move) => ({ ...move })),
  lastMove: state.lastMove ? { ...state.lastMove } : null
});

export const stateFromSnapshot = (snapshot: GameSnapshot): GameState => ({
  boardSize: snapshot.boardSize,
  komi: snapshot.komi,
  handicap: snapshot.handicap,
  toPlay: snapshot.toPlay,
  grid: snapshot.grid.slice(),
  captures: { ...snapshot.captures },
  moves: snapshot.moves.map((move) => ({ ...move })),
  history: [],
  future: [],
  lastMove: snapshot.lastMove ? { ...snapshot.lastMove } : null
});

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case "PLAY": {
      if ("pass" in action.move) {
        return applyPass(state);
      }
      const result = applyMove(state, action.move);
      return result instanceof Error ? state : result;
    }
    case "PASS":
      return applyPass(state);
    case "UNDO":
      return undoState(state);
    case "REDO":
      return redoState(state);
    case "RESET":
      return createInitialState(action.boardSize ?? state.boardSize, "B", {
        komi: state.komi,
        handicap: state.handicap
      });
    case "LOAD":
      return action.state;
    default:
      return state;
  }
};
