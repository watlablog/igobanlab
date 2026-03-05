type ControlsProps = {
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
  canUndo,
  canRedo,
  disabled,
  onPass,
  onUndo,
  onRedo,
  onNewGame,
  onExportSgf
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
      <button type="button" className="subtle full" onClick={onExportSgf} disabled={disabled}>
        Export SGF
      </button>
    </div>
  </section>
);
