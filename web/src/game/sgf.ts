import type { Move } from "../types/models";

const SGF_COORDS = "abcdefghijklmnopqrstuvwxyz";

const moveColorAt = (index: number): "B" | "W" => (index % 2 === 0 ? "B" : "W");

const vertexToSgf = (x: number, y: number): string => {
  const sx = SGF_COORDS[x];
  const sy = SGF_COORDS[y];
  if (!sx || !sy) {
    throw new Error("Board size exceeds SGF coordinate range");
  }
  return `${sx}${sy}`;
};

export const exportMinimalSgf = (boardSize: number, moves: Move[]): string => {
  const nodes = moves
    .map((move, index) => {
      const color = moveColorAt(index);
      if ("pass" in move) {
        return `;${color}[]`;
      }
      return `;${color}[${vertexToSgf(move.x, move.y)}]`;
    })
    .join("");

  return `(;GM[1]FF[4]SZ[${boardSize}]${nodes})`;
};
