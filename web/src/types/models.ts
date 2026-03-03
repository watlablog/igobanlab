export type Player = "B" | "W";

export type PlaceMove = {
  x: number;
  y: number;
};

export type PassMove = {
  pass: true;
};

export type Move = PlaceMove | PassMove;

export type Captures = {
  B: number;
  W: number;
};

export type GameSnapshot = {
  toPlay: Player;
  grid: Int8Array;
  captures: Captures;
  moves: Move[];
  lastMove: Move | null;
};

export type GameState = {
  boardSize: number;
  toPlay: Player;
  grid: Int8Array;
  captures: Captures;
  moves: Move[];
  history: GameSnapshot[];
  future: GameSnapshot[];
  lastMove: Move | null;
};

export type InvalidMoveCode =
  | "OUT_OF_BOUNDS"
  | "POINT_OCCUPIED"
  | "SUICIDE"
  | "NOT_A_PLACE_MOVE";

export class InvalidMoveError extends Error {
  readonly code: InvalidMoveCode;

  constructor(code: InvalidMoveCode, message: string) {
    super(message);
    this.code = code;
    this.name = "InvalidMoveError";
  }
}

export type PlayerStone = 0 | 1 | 2;
