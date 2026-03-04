import type { Move, Player } from "./models";

export type ActiveGameDoc = {
  boardSize: number;
  komi: number;
  handicap: number;
  toPlay: Player;
  captures: { B: number; W: number };
  grid: number[];
  moves: Move[];
  updatedAt: unknown;
};
