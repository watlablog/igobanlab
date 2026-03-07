import type {
  AnalysisRequest,
  Move,
  MoveAnalysisRequest,
  MoveAnalysisResult,
  MoveCandidate,
  ScoreAnalysisResult
} from "../types/models";
import { clampInfluence } from "../app/influence";

type ApiErrorPayload = {
  code?: string;
  message?: string;
};

type MoveResponsePayload = {
  x?: number;
  y?: number;
  pass?: boolean;
};

type MoveCandidatePayload = {
  move?: MoveResponsePayload;
  winrate?: number | null;
  scoreLead?: number | null;
  visits?: number | null;
};

type ScoreResponsePayload = {
  scoreLead: number;
  winrate: number;
  visits: number;
  ownership?: number[][] | null;
  engine: string;
};

type MoveResponsePayloadBody = {
  bestMove?: MoveResponsePayload | null;
  candidates?: MoveCandidatePayload[];
  scoreLead: number;
  winrate: number;
  visits: number;
  engine: string;
};

export class AnalysisApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AnalysisApiError";
    this.code = code;
    this.status = status;
  }
}

const API_BASE = (() => {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (raw.length > 0) {
    return raw.replace(/\/+$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://localhost:8080";
  }
  return "";
})();

const toMove = (value: MoveResponsePayload | null | undefined): Move | null => {
  if (!value) return null;
  if (value.pass === true) return { pass: true };
  if (typeof value.x === "number" && typeof value.y === "number") {
    return { x: value.x, y: value.y };
  }
  return null;
};

const toMoveCandidate = (value: MoveCandidatePayload): MoveCandidate | null => {
  const move = toMove(value.move);
  if (!move) return null;
  return {
    move,
    winrate: typeof value.winrate === "number" ? value.winrate : null,
    scoreLead: typeof value.scoreLead === "number" ? value.scoreLead : null,
    visits: typeof value.visits === "number" ? value.visits : null
  };
};

const buildUrl = (path: string): string => {
  if (!API_BASE) {
    throw new AnalysisApiError(
      "API_BASE_NOT_CONFIGURED",
      "分析APIのURLが未設定です。VITE_API_BASE_URLを設定してください。",
      500
    );
  }
  return `${API_BASE}${path}`;
};

const toOwnershipGrid = (value: unknown): ScoreAnalysisResult["ownership"] => {
  if (!Array.isArray(value)) return null;
  const rows: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    const parsedRow: number[] = [];
    for (const cell of row) {
      if (typeof cell !== "number" || !Number.isFinite(cell)) return null;
      parsedRow.push(clampInfluence(cell));
    }
    rows.push(parsedRow);
  }
  return rows;
};

const requestJson = async <TResponse, TPayload extends object>(
  path: string,
  payload: TPayload,
  userId?: string
): Promise<TResponse> => {
  const url = buildUrl(path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "X-User-Id": userId } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let parsed: ApiErrorPayload | null = null;
    try {
      parsed = (await response.json()) as ApiErrorPayload;
    } catch {
      parsed = null;
    }

    throw new AnalysisApiError(
      parsed?.code ?? "ANALYSIS_REQUEST_FAILED",
      parsed?.message ?? `Analysis request failed with status ${response.status}`,
      response.status
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const bodyText = await response.text();
    throw new AnalysisApiError(
      "INVALID_API_RESPONSE",
      `分析APIがJSON以外を返しました。API URL=${url} / Content-Type=${contentType || "unknown"} / Body=${bodyText.slice(0, 80)}`,
      response.status
    );
  }

  return (await response.json()) as TResponse;
};

export const requestScoreAnalysis = async (
  request: AnalysisRequest,
  userId?: string
): Promise<ScoreAnalysisResult> => {
  const response = await requestJson<ScoreResponsePayload, AnalysisRequest>(
    "/v1/analyze/score",
    request,
    userId
  );

  return {
    scoreLead: response.scoreLead,
    winrate: response.winrate,
    visits: response.visits,
    ownership: toOwnershipGrid(response.ownership),
    engine: response.engine
  };
};

export const requestMoveAnalysis = async (
  request: MoveAnalysisRequest,
  userId?: string
): Promise<MoveAnalysisResult> => {
  const response = await requestJson<MoveResponsePayloadBody, MoveAnalysisRequest>(
    "/v1/analyze/move",
    request,
    userId
  );

  const candidates = (response.candidates ?? [])
    .map(toMoveCandidate)
    .filter((candidate): candidate is MoveCandidate => candidate !== null);

  return {
    bestMove: toMove(response.bestMove),
    candidates,
    scoreLead: response.scoreLead,
    winrate: response.winrate,
    visits: response.visits,
    engine: response.engine
  };
};
