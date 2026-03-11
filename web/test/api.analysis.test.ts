import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestMoveAnalysis,
  requestScoreAnalysis
} from "../src/api/analysis";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("analysis api client", () => {
  it("maps score analysis response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        scoreLead: 1.25,
        winrate: 0.57,
        visits: 200,
        ownership: [[1, 0], [-1, 0]],
        engine: "KataGo"
      })
    }) as unknown as typeof fetch;

    const result = await requestScoreAnalysis({
      boardSize: 19,
      komi: 6.5,
      handicap: 0,
      rules: "japanese",
      moves: [],
      maxVisits: 200,
      includeOwnership: true
    });

    expect(result.engine).toBe("KataGo");
    expect(result.scoreLead).toBe(1.25);
    expect(result.ownership).toEqual([
      [1, 0],
      [-1, 0]
    ]);
  });

  it("maps move analysis response and handles pass", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        bestMove: { pass: true },
        candidates: [{ move: { x: 3, y: 3 }, winrate: 0.6 }],
        scoreLead: -0.4,
        winrate: 0.48,
        visits: 180,
        engine: "KataGo"
      })
    }) as unknown as typeof fetch;

    const result = await requestMoveAnalysis({
      boardSize: 19,
      komi: 6.5,
      handicap: 0,
      rules: "japanese",
      moves: [],
      maxVisits: 200,
      includeOwnership: false,
      topN: 5
    });

    expect(result.bestMove).toEqual({ pass: true });
    expect(result.candidates.length).toBe(1);
  });

  it("throws AnalysisApiError on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      headers: { get: () => "application/json" },
      json: async () => ({ code: "ENGINE_TIMEOUT", message: "timeout" })
    }) as unknown as typeof fetch;

    await expect(
      requestScoreAnalysis({
        boardSize: 19,
        komi: 6.5,
        handicap: 0,
        rules: "japanese",
        moves: [],
        maxVisits: 200,
        includeOwnership: true
      })
    ).rejects.toMatchObject({
      code: "ENGINE_TIMEOUT",
      status: 504
    });
  });

  it("includes text response snippet for non-json error body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      headers: { get: () => "text/plain" },
      text: async () => "upstream request timeout"
    }) as unknown as typeof fetch;

    await expect(
      requestScoreAnalysis({
        boardSize: 19,
        komi: 6.5,
        handicap: 0,
        rules: "japanese",
        moves: [],
        maxVisits: 200,
        includeOwnership: true
      })
    ).rejects.toMatchObject({
      code: "ANALYSIS_REQUEST_FAILED",
      status: 504
    });
  });

  it("throws when API returns html", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "<!doctype html><html></html>",
      json: async () => {
        throw new Error("should not parse json");
      }
    }) as unknown as typeof fetch;

    await expect(
      requestScoreAnalysis({
        boardSize: 19,
        komi: 6.5,
        handicap: 0,
        rules: "japanese",
        moves: [],
        maxVisits: 200,
        includeOwnership: true
      })
    ).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      status: 200
    });
  });

  it("throws API_TIMEOUT when request is aborted", async () => {
    global.fetch = vi.fn(async (_input, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return await new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const abortError = new Error("Aborted");
          (abortError as Error & { name: string }).name = "AbortError";
          reject(abortError);
        });
      });
    }) as unknown as typeof fetch;

    await expect(
      requestScoreAnalysis(
        {
          boardSize: 19,
          komi: 6.5,
          handicap: 0,
          rules: "japanese",
          moves: [],
          maxVisits: 200,
          includeOwnership: true
        },
        undefined,
        { timeoutMs: 5 }
      )
    ).rejects.toMatchObject({
      code: "API_TIMEOUT",
      status: 504
    });
  });
});
