import type { ScoreAnalysisResult } from "../types/models";
import type { OwnershipSummary } from "../app/analysis";

type ControlsProps = {
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  analysisBusy: boolean;
  analysisDisabled: boolean;
  scoreAnalysis: ScoreAnalysisResult | null;
  ownershipSummary: OwnershipSummary | null;
  analysisError: string | null;
  onPass: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNewGame: () => void;
  onImportSgf: () => void;
  onExportSgf: () => void;
  onAnalyzeScore: () => void;
};

export const Controls = ({
  canUndo,
  canRedo,
  disabled,
  analysisBusy,
  analysisDisabled,
  scoreAnalysis,
  ownershipSummary,
  analysisError,
  onPass,
  onUndo,
  onRedo,
  onNewGame,
  onImportSgf,
  onExportSgf,
  onAnalyzeScore
}: ControlsProps) => (
  <section className="controls-card panel-card action-card">
    <h2 className="panel-title">操作</h2>

    <div className="button-grid controls-grid">
      <button type="button" className="subtle" onClick={onPass} disabled={disabled}>
        Pass
      </button>
      <button type="button" onClick={onUndo} disabled={disabled || !canUndo}>
        Undo
      </button>
      <button type="button" onClick={onRedo} disabled={disabled || !canRedo}>
        Redo
      </button>
      <button type="button" className="primary" onClick={onNewGame} disabled={disabled}>
        New Game
      </button>
      <button type="button" className="subtle full" onClick={onImportSgf} disabled={disabled}>
        Import SGF
      </button>
      <button type="button" className="subtle full" onClick={onExportSgf} disabled={disabled}>
        Export SGF
      </button>
    </div>

    <section className="analysis-card">
      <h3 className="analysis-title">解析</h3>
      <div className="analysis-actions single">
        <button
          type="button"
          className="primary"
          onClick={onAnalyzeScore}
          disabled={analysisDisabled || analysisBusy}
        >
          勢力表示
        </button>
      </div>

      <div className="analysis-feedback" aria-live="polite">
        {analysisBusy ? (
          <p className="muted analysis-status">解析中...</p>
        ) : analysisError ? (
          <p className="warning-text analysis-error">{analysisError}</p>
        ) : (
          <p className="muted analysis-status analysis-placeholder" aria-hidden="true">
            {"\u00A0"}
          </p>
        )}
      </div>

      <div className="analysis-result-shell">
        {scoreAnalysis ? (
          <div className="analysis-result">
            {typeof scoreAnalysis.blackScore === "number" && (
              <p className="analysis-line">blackInfluence: {scoreAnalysis.blackScore.toFixed(1)}</p>
            )}
            {typeof scoreAnalysis.whiteScore === "number" && (
              <p className="analysis-line">whiteInfluence: {scoreAnalysis.whiteScore.toFixed(1)}</p>
            )}
            <p className="analysis-line">influenceLead: {scoreAnalysis.scoreLead.toFixed(2)}</p>
            <p className="analysis-line">
              winrate: {scoreAnalysis.winrate == null ? "-" : `${(scoreAnalysis.winrate * 100).toFixed(1)}%`}
            </p>
            <p className="analysis-line">visits: {scoreAnalysis.visits == null ? "-" : scoreAnalysis.visits}</p>
            {ownershipSummary && (
              <p className="analysis-line">
                influence B/W/N: {ownershipSummary.black}/{ownershipSummary.white}/{ownershipSummary.neutral}
              </p>
            )}
            {scoreAnalysis.deadStones && (
              <p className="analysis-line">
                dead stones B/W: {scoreAnalysis.deadStones.B}/{scoreAnalysis.deadStones.W}
              </p>
            )}
            <p className="analysis-line">
              source: {scoreAnalysis.source ?? "-"} / elapsed:{" "}
              {typeof scoreAnalysis.elapsedMs === "number" ? `${scoreAnalysis.elapsedMs}ms` : "-"}
            </p>
            <p className="analysis-line muted">engine: {scoreAnalysis.engine}</p>
          </div>
        ) : (
          <p className="analysis-empty muted">勢力表示は未実行です。</p>
        )}
      </div>
    </section>
  </section>
);
