import type { Captures, Player } from "../types/models";

type ControlsProps = {
  toPlay: Player;
  captures: Captures;
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  onPass: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNewGame: () => void;
  onExportSgf: () => void;
};

export const Controls = ({
  toPlay,
  captures,
  canUndo,
  canRedo,
  disabled,
  onPass,
  onUndo,
  onRedo,
  onNewGame,
  onExportSgf
}: ControlsProps) => (
  <section className="controls-card">
    <div className="row">
      <strong>Turn:</strong> <span>{toPlay === "B" ? "Black" : "White"}</span>
    </div>

    <div className="row">
      <strong>Captures:</strong>
      <span>Black {captures.B}</span>
      <span>White {captures.W}</span>
    </div>

    <div className="button-grid">
      <button type="button" onClick={onPass} disabled={disabled}>
        Pass
      </button>
      <button type="button" onClick={onUndo} disabled={disabled || !canUndo}>
        Undo
      </button>
      <button type="button" onClick={onRedo} disabled={disabled || !canRedo}>
        Redo
      </button>
      <button type="button" onClick={onNewGame} disabled={disabled}>
        New Game
      </button>
      <button type="button" onClick={onExportSgf} disabled={disabled}>
        Export SGF
      </button>
    </div>
  </section>
);
