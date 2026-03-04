import { describe, expect, it } from "vitest";
import { createStateFromSetup } from "../src/game/state";

describe("createStateFromSetup", () => {
  it("places 2 handicap stones at upper-right and lower-left (not tengen)", () => {
    const state = createStateFromSetup({ boardSize: 19, komi: 6.5, handicap: 2 });

    const toIndex = (x: number, y: number): number => y * 19 + x;

    expect(state.grid[toIndex(15, 3)]).toBe(1);
    expect(state.grid[toIndex(3, 15)]).toBe(1);
    expect(state.grid[toIndex(9, 9)]).toBe(0);
    expect(state.toPlay).toBe("W");
  });

  it("uses side star points for 6 handicap stones", () => {
    const state = createStateFromSetup({ boardSize: 19, komi: 6.5, handicap: 6 });
    const toIndex = (x: number, y: number): number => y * 19 + x;

    expect(state.grid[toIndex(15, 3)]).toBe(1); // upper-right
    expect(state.grid[toIndex(3, 15)]).toBe(1); // lower-left
    expect(state.grid[toIndex(15, 15)]).toBe(1); // lower-right
    expect(state.grid[toIndex(3, 3)]).toBe(1); // upper-left
    expect(state.grid[toIndex(15, 9)]).toBe(1); // right side middle
    expect(state.grid[toIndex(3, 9)]).toBe(1); // left side middle
    expect(state.grid[toIndex(9, 9)]).toBe(0); // center not used for 6 stones
  });
});
