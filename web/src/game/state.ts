import type { GameSnapshot, GameState, Move, Player } from "../types/models";
import { applyMove, applyPass, redo as redoState, undo as undoState } from "./rules";

export type GameAction =
  | { type: "PLAY"; move: Move }
  | { type: "PASS" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; boardSize?: number }
  | { type: "LOAD"; state: GameState };

export const createInitialState = (boardSize = 19, toPlay: Player = "B"): GameState => ({
  boardSize,
  toPlay,
  grid: new Int8Array(boardSize * boardSize),
  captures: { B: 0, W: 0 },
  moves: [],
  history: [],
  future: [],
  lastMove: null
});

export const snapshotFromState = (state: GameState): GameSnapshot => ({
  toPlay: state.toPlay,
  grid: state.grid.slice(),
  captures: { ...state.captures },
  moves: state.moves.map((move) => ({ ...move })),
  lastMove: state.lastMove ? { ...state.lastMove } : null
});

export const stateFromSnapshot = (boardSize: number, snapshot: GameSnapshot): GameState => ({
  boardSize,
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
      return createInitialState(action.boardSize ?? state.boardSize);
    case "LOAD":
      return action.state;
    default:
      return state;
  }
};
