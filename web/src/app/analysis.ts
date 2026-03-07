import type {
  AnalysisRequest,
  GameState,
  MoveAnalysisRequest,
  OwnershipValue
} from "../types/models";
import { quantizeInfluence } from "./influence";

export const ANALYSIS_DEFAULT_RULES = "japanese" as const;
export const ANALYSIS_DEFAULT_MAX_VISITS = 12;
export const ANALYSIS_DEFAULT_TOP_N = 3;

type ScoreRequestOptions = {
  includeOwnership?: boolean;
  maxVisits?: number;
};

export const buildScoreAnalysisRequest = (
  state: GameState,
  options?: ScoreRequestOptions
): AnalysisRequest => ({
  boardSize: state.boardSize,
  komi: state.komi,
  handicap: state.handicap,
  rules: ANALYSIS_DEFAULT_RULES,
  moves: state.moves.map((move) => ({ ...move })),
  maxVisits: options?.maxVisits ?? ANALYSIS_DEFAULT_MAX_VISITS,
  includeOwnership: options?.includeOwnership ?? false
});

export const buildMoveAnalysisRequest = (state: GameState): MoveAnalysisRequest => ({
  ...buildScoreAnalysisRequest(state),
  includeOwnership: false,
  topN: ANALYSIS_DEFAULT_TOP_N
});

export type OwnershipSummary = {
  black: number;
  white: number;
  neutral: number;
};

export const summarizeOwnership = (ownership: OwnershipValue[][] | null): OwnershipSummary | null => {
  if (!ownership || ownership.length === 0) return null;

  let black = 0;
  let white = 0;
  let neutral = 0;

  for (const row of ownership) {
    for (const cell of row) {
      const bucket = quantizeInfluence(cell);
      if (bucket > 0) {
        black += 1;
      } else if (bucket < 0) {
        white += 1;
      } else {
        neutral += 1;
      }
    }
  }

  return { black, white, neutral };
};
