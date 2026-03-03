import type { Move, Player } from "./models";

export type ActiveGameDoc = {
  boardSize: number;
  toPlay: Player;
  captures: { B: number; W: number };
  moves: Move[];
  updatedAt: unknown;
};
