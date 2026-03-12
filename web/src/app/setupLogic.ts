import type { GameSetup } from "../types/models";

export type HandicapSelection =
  | "even"
  | "teisen"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "h7"
  | "h8"
  | "h9";

export type SetupDraft = {
  boardSize: number;
  komi: number;
  handicapSelection: HandicapSelection;
};

export const BOARD_SIZE_OPTIONS = [9, 13, 19] as const;
export const DEFAULT_HANDICAP_SELECTION: HandicapSelection = "even";

export const HANDICAP_SELECTION_OPTIONS: Array<{ value: HandicapSelection; label: string }> = [
  { value: "even", label: "互先" },
  { value: "teisen", label: "定先" },
  { value: "h2", label: "置き石 2子" },
  { value: "h3", label: "置き石 3子" },
  { value: "h4", label: "置き石 4子" },
  { value: "h5", label: "置き石 5子" },
  { value: "h6", label: "置き石 6子" },
  { value: "h7", label: "置き石 7子" },
  { value: "h8", label: "置き石 8子" },
  { value: "h9", label: "置き石 9子" }
];

export const isHandicapSelection = (value: string): value is HandicapSelection =>
  HANDICAP_SELECTION_OPTIONS.some((option) => option.value === value);

export const normalizeBoardSize = (value: number): number =>
  BOARD_SIZE_OPTIONS.includes(value as (typeof BOARD_SIZE_OPTIONS)[number]) ? value : 19;

export const normalizeKomi = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(value * 2) / 2;
};

export const selectionToHandicap = (selection: HandicapSelection): number => {
  if (!selection.startsWith("h")) {
    return 0;
  }
  return Number(selection.slice(1));
};

export const setupToHandicapSelection = (setup: Pick<GameSetup, "handicap" | "komi">): HandicapSelection => {
  const handicap = Math.trunc(setup.handicap);
  if (handicap >= 2 && handicap <= 9) {
    return `h${handicap}` as HandicapSelection;
  }
  if (handicap === 0 && setup.komi === 0) {
    return "teisen";
  }
  return "even";
};

export const setupFromDraft = (draft: SetupDraft, fallbackEvenKomi: number): GameSetup => {
  const boardSize = normalizeBoardSize(draft.boardSize);
  const fallbackKomi = draft.handicapSelection === "even" ? fallbackEvenKomi : 0;
  const komi = normalizeKomi(draft.komi, fallbackKomi);
  const handicap = selectionToHandicap(draft.handicapSelection);
  return { boardSize, komi, handicap };
};

export const handicapSummaryLabel = (selection: HandicapSelection): string => {
  const option = HANDICAP_SELECTION_OPTIONS.find((candidate) => candidate.value === selection);
  return option ? option.label : "互先";
};

export const applyKomiChange = (
  previous: SetupDraft,
  komi: number,
  evenKomiMemory: number
): { draft: SetupDraft; evenKomiMemory: number } => {
  const draft = { ...previous, komi };

  if (previous.handicapSelection === "even") {
    return { draft, evenKomiMemory: komi };
  }

  return { draft, evenKomiMemory };
};

export const applyHandicapChange = (
  previous: SetupDraft,
  nextSelection: HandicapSelection,
  evenKomiMemory: number
): { draft: SetupDraft; evenKomiMemory: number } => {
  if (previous.handicapSelection === nextSelection) {
    return { draft: previous, evenKomiMemory };
  }

  if (nextSelection === "even") {
    return {
      draft: {
        ...previous,
        handicapSelection: nextSelection,
        komi: evenKomiMemory
      },
      evenKomiMemory
    };
  }

  const nextEvenKomiMemory = previous.handicapSelection === "even" ? previous.komi : evenKomiMemory;

  return {
    draft: {
      ...previous,
      handicapSelection: nextSelection,
      komi: 0
    },
    evenKomiMemory: nextEvenKomiMemory
  };
};
