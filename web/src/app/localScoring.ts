import type { GameState } from "../types/models";

export type DeadMarksByPly = Record<number, boolean[][]>;

const createMatrix = (boardSize: number, value: boolean): boolean[][] =>
  Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => value));

const cloneBooleanGrid = (source: boolean[][], boardSize: number): boolean[][] => {
  const result = createMatrix(boardSize, false);
  for (let y = 0; y < boardSize; y += 1) {
    const row = source[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < boardSize; x += 1) {
      result[y][x] = row[x] === true;
    }
  }
  return result;
};

export const createDeadMarkGrid = (boardSize: number): boolean[][] =>
  createMatrix(boardSize, false);

export const getDeadMarkGrid = (
  marksByPly: DeadMarksByPly,
  ply: number,
  boardSize: number
): boolean[][] => {
  const existing = marksByPly[ply];
  if (!existing) {
    return createDeadMarkGrid(boardSize);
  }
  return cloneBooleanGrid(existing, boardSize);
};

const stoneAt = (state: GameState, x: number, y: number): number => {
  if (x < 0 || y < 0 || x >= state.boardSize || y >= state.boardSize) return 0;
  return state.grid[y * state.boardSize + x];
};

export const toggleDeadMarkAt = (
  state: GameState,
  deadGrid: boolean[][],
  x: number,
  y: number
): boolean[][] => {
  const stone = stoneAt(state, x, y);
  if (stone !== 1 && stone !== 2) {
    return deadGrid;
  }

  const next = cloneBooleanGrid(deadGrid, state.boardSize);
  next[y][x] = !next[y][x];
  return next;
};

export const countDeadStones = (
  state: GameState,
  deadGrid: boolean[][]
): { B: number; W: number } => {
  let black = 0;
  let white = 0;

  for (let y = 0; y < state.boardSize; y += 1) {
    for (let x = 0; x < state.boardSize; x += 1) {
      if (!deadGrid[y]?.[x]) continue;
      const stone = stoneAt(state, x, y);
      if (stone === 1) {
        black += 1;
      } else if (stone === 2) {
        white += 1;
      }
    }
  }

  return { B: black, W: white };
};
