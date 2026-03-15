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

export type GameSetup = {
  boardSize: number;
  komi: number;
  handicap: number;
};

export type GameSnapshot = {
  boardSize: number;
  komi: number;
  handicap: number;
  toPlay: Player;
  grid: Int8Array;
  captures: Captures;
  moves: Move[];
  lastMove: Move | null;
};

export type GameState = {
  boardSize: number;
  komi: number;
  handicap: number;
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

export type AnalysisRules = "japanese" | "chinese" | "aga" | "korean";
export type OwnershipValue = number;
export type DeadStoneCell = -1 | 0 | 1;

export type AnalysisRequest = {
  boardSize: number;
  komi: number;
  handicap: number;
  rules: AnalysisRules;
  moves: Move[];
  maxVisits: number;
  includeOwnership: boolean;
};

export type MoveAnalysisRequest = AnalysisRequest & {
  topN: number;
};

export type MoveCandidate = {
  move: Move;
  winrate: number | null;
  scoreLead: number | null;
  visits: number | null;
};

export type ScoreAnalysisResult = {
  scoreLead: number;
  winrate: number | null;
  visits: number | null;
  ownership: OwnershipValue[][] | null;
  deadStoneMap?: DeadStoneCell[][] | null;
  engine: string;
  blackScore?: number;
  whiteScore?: number;
  deadStones?: { B: number; W: number };
  source?:
    | "api-primary"
    | "local-estimator"
    | "sabaki-local"
    | "local"
    | "api-fallback"
    | "local-fallback";
  elapsedMs?: number;
  quality?: "quick" | "fallback";
};

export type MoveAnalysisResult = {
  bestMove: Move | null;
  candidates: MoveCandidate[];
  scoreLead: number;
  winrate: number;
  visits: number;
  engine: string;
};
