import { describe, expect, it } from "vitest";
import {
  countDeadStones,
  createDeadMarkGrid,
  getDeadMarkGrid,
  toggleDeadMarkAt,
  type DeadMarksByPly
} from "../src/app/localScoring";
import type { GameState } from "../src/types/models";

const createState = (
  boardSize: number,
  placements: Array<{ x: number; y: number; color: 1 | 2 }>
): GameState => {
  const grid = new Int8Array(boardSize * boardSize);
  for (const stone of placements) {
    grid[stone.y * boardSize + stone.x] = stone.color;
  }

  return {
    boardSize,
    komi: 6.5,
    handicap: 0,
    toPlay: "B",
    grid,
    captures: { B: 0, W: 0 },
    moves: [],
    history: [],
    future: [],
    lastMove: null
  };
};

describe("local dead-mark helpers", () => {
  it("creates empty dead-mark grid", () => {
    const grid = createDeadMarkGrid(5);
    expect(grid.length).toBe(5);
    expect(grid.every((row) => row.every((cell) => cell === false))).toBe(true);
  });

  it("restores dead-mark grid by ply", () => {
    const marks: DeadMarksByPly = {
      3: [
        [false, false],
        [true, false]
      ]
    };
    const restored = getDeadMarkGrid(marks, 3, 2);
    expect(restored).toEqual([
      [false, false],
      [true, false]
    ]);
    restored[1][0] = false;
    expect(marks[3][1][0]).toBe(true);
  });

  it("toggles only points with stones", () => {
    const state = createState(3, [{ x: 1, y: 1, color: 1 }]);
    const base = createDeadMarkGrid(3);

    const unchanged = toggleDeadMarkAt(state, base, 0, 0);
    expect(unchanged).toBe(base);

    const toggled = toggleDeadMarkAt(state, base, 1, 1);
    expect(toggled).not.toBe(base);
    expect(toggled[1][1]).toBe(true);
  });

  it("counts dead stones by color", () => {
    const state = createState(3, [
      { x: 0, y: 0, color: 1 },
      { x: 1, y: 1, color: 2 }
    ]);
    const dead = createDeadMarkGrid(3);
    dead[0][0] = true;
    dead[1][1] = true;
    expect(countDeadStones(state, dead)).toEqual({ B: 1, W: 1 });
  });
});
