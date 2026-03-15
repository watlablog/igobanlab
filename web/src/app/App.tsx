import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { User } from "firebase/auth";
import { Controls } from "../ui/Controls";
import { GobanView } from "../ui/GobanView";
import { exportMinimalSgf, importSgf, SgfImportError } from "../game/sgf";
import { createStateFromSetup, gameReducer, stateFromSnapshot } from "../game/state";
import { saveActiveGame } from "../firebase/db";
import { signInWithGoogle, signOutUser, subscribeAuth } from "../firebase/auth";
import { isFirebaseConfigured } from "../firebase/firebase";
import type {
  GameSetup,
  ScoreAnalysisResult
} from "../types/models";
import {
  summarizeOwnership
} from "./analysis";
import { markerLabelFromInfluence } from "./influence";
import {
  analyzeInfluence,
  warmupInfluenceRuntime
} from "./influenceRuntime";
import {
  BOARD_SIZE_OPTIONS,
  DEFAULT_HANDICAP_SELECTION,
  HANDICAP_SELECTION_OPTIONS,
  applyHandicapChange,
  applyKomiChange,
  handicapSummaryLabel,
  isHandicapSelection,
  normalizeBoardSize,
  setupToHandicapSelection,
  setupFromDraft,
  type HandicapSelection,
  type SetupDraft
} from "./setupLogic";
import {
  isCompactLayout,
  resolveLayoutPreset,
  type LayoutPreset
} from "./layout";

type AppScreen = "login" | "menu" | "setup" | "board";

type GameInfo = {
  gameDate: string;
  blackName: string;
  whiteName: string;
  blackRank: string;
  whiteRank: string;
  location: string;
};

const SAVE_DEBOUNCE_MS = 300;

const DEFAULT_SETUP_DRAFT: SetupDraft = {
  boardSize: 19,
  komi: 6.5,
  handicapSelection: DEFAULT_HANDICAP_SELECTION
};

const DEFAULT_SETUP: GameSetup = {
  boardSize: 19,
  komi: 6.5,
  handicap: 0
};

const DEFAULT_GAME_INFO: GameInfo = {
  gameDate: "",
  blackName: "",
  whiteName: "",
  blackRank: "",
  whiteRank: "",
  location: ""
};

const CLEAR_CONFIRM_MESSAGE = "現在の対局情報がクリアになりますがよろしいですか？";
const DEFAULT_ANALYSIS_ERROR_MESSAGE = "解析に失敗しました。しばらくして再度お試しください。";

export const App = () => {
  const initialPreset =
    typeof window === "undefined"
      ? "desktop"
      : resolveLayoutPreset(window.innerWidth, window.innerHeight);

  const [state, dispatch] = useReducer(gameReducer, undefined, () => createStateFromSetup(DEFAULT_SETUP));
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState<AppScreen>("login");
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>(initialPreset);
  const [resizeKey, setResizeKey] = useState(0);

  const [activeSetup, setActiveSetup] = useState<GameSetup>(DEFAULT_SETUP);
  const [activeHandicapSelection, setActiveHandicapSelection] =
    useState<HandicapSelection>(DEFAULT_HANDICAP_SELECTION);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(DEFAULT_SETUP_DRAFT);
  const [evenKomiMemory, setEvenKomiMemory] = useState(DEFAULT_SETUP.komi);
  const [statusMessage, setStatusMessage] = useState("準備完了");

  const [gameInfo, setGameInfo] = useState<GameInfo>(DEFAULT_GAME_INFO);
  const [moveNotes, setMoveNotes] = useState<Record<number, string>>({});
  const [reviewPly, setReviewPly] = useState(0);
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
  const moveCountRef = useRef(0);
  const sgfInputRef = useRef<HTMLInputElement | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [scoreAnalysis, setScoreAnalysis] = useState<ScoreAnalysisResult | null>(null);
  const [showDeadStoneOverlay, setShowDeadStoneOverlay] = useState(true);
  const analysisRequestIdRef = useRef(0);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(true);
      setScreen("login");
      return;
    }

    const unsubscribe = subscribeAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setScreen(nextUser ? "menu" : "login");
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let rafId: number | null = null;
    const handleResize = () => {
      rafId = null;
      setLayoutPreset(resolveLayoutPreset(window.innerWidth, window.innerHeight));
      setResizeKey((prev) => prev + 1);
    };

    const scheduleResize = () => {
      if (rafId != null) {
        return;
      }
      rafId = window.requestAnimationFrame(handleResize);
    };

    handleResize();
    window.addEventListener("resize", scheduleResize);
    window.addEventListener("orientationchange", scheduleResize);
    return () => {
      window.removeEventListener("resize", scheduleResize);
      window.removeEventListener("orientationchange", scheduleResize);
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || screen !== "board") {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        await saveActiveGame(user.uid, state);
      } catch {
        setStatusMessage("Failed to save game.");
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [screen, state, user]);

  useEffect(() => {
    const previousMoveCount = moveCountRef.current;
    if (state.moves.length > previousMoveCount) {
      setReviewPly(state.moves.length);
    } else {
      setReviewPly((prev) => Math.min(prev, state.moves.length));
    }
    moveCountRef.current = state.moves.length;
  }, [state.moves.length]);

  useEffect(() => {
    if (screen !== "board") return;
    void warmupInfluenceRuntime().catch(() => {
      // Warmup failure is non-fatal. analyzeInfluence handles runtime errors.
    });
  }, [screen]);

  const playEnabled = useMemo(() => {
    if (screen !== "board") return false;
    if (!isFirebaseConfigured) return false;
    return Boolean(user);
  }, [screen, user]);

  const isReviewingPast = reviewPly < state.moves.length;
  const interactionDisabled = !playEnabled || isReviewingPast;
  const compactLayout = isCompactLayout(layoutPreset);
  const showCoordinates = layoutPreset === "desktop";
  const noteTitle = reviewPly === 0 ? "開始局面メモ" : `${reviewPly}手目メモ`;

  const displayState = useMemo(() => {
    if (reviewPly === state.moves.length) {
      return state;
    }

    const snapshot = state.history[reviewPly];
    if (!snapshot) {
      return state;
    }

    return stateFromSnapshot(snapshot);
  }, [reviewPly, state]);

  const hasDeadStoneOverlay = useMemo(() => {
    const deadStoneMap = scoreAnalysis?.deadStoneMap;
    if (!deadStoneMap) return false;
    for (const row of deadStoneMap) {
      for (const cell of row) {
        if (cell !== 0) {
          return true;
        }
      }
    }
    return false;
  }, [scoreAnalysis?.deadStoneMap]);

  const overlayMarkerMap = useMemo(() => {
    const ownership = scoreAnalysis?.ownership;
    const deadStoneMap = scoreAnalysis?.deadStoneMap;
    if (!ownership && !(showDeadStoneOverlay && deadStoneMap)) return undefined;
    return Array.from({ length: displayState.boardSize }, (_, y) =>
      Array.from({ length: displayState.boardSize }, (_, x) => {
        const deadStone = showDeadStoneOverlay ? deadStoneMap?.[y]?.[x] ?? 0 : 0;
        if (deadStone === 1) {
          return { type: "cross" as const, label: "deadstone-black" };
        }
        if (deadStone === -1) {
          return { type: "cross" as const, label: "deadstone-white" };
        }

        if (!ownership) return null;
        const ownershipValue = ownership[y]?.[x];
        if (typeof ownershipValue !== "number") return null;
        if (displayState.grid[y * displayState.boardSize + x] !== 0) return null;
        const label = markerLabelFromInfluence(ownershipValue);
        return label ? { type: "square" as const, label } : null;
      })
    );
  }, [displayState.boardSize, displayState.grid, scoreAnalysis?.deadStoneMap, scoreAnalysis?.ownership, showDeadStoneOverlay]);

  const selectedVertices = useMemo<[number, number][]>(() => {
    const lastMove = displayState.lastMove;
    if (!lastMove || "pass" in lastMove) return [];
    return [[lastMove.x, lastMove.y]];
  }, [displayState.lastMove]);

  const clearAnalysisState = useCallback(() => {
    analysisRequestIdRef.current += 1;
    setAnalysisBusy(false);
    setScoreAnalysis(null);
    setAnalysisError(null);
  }, []);

  const toggleDeadStoneOverlay = useCallback(() => {
    setShowDeadStoneOverlay((prev) => !prev);
  }, []);

  const ownershipSummary = useMemo(
    () => summarizeOwnership(scoreAnalysis?.ownership ?? null),
    [scoreAnalysis]
  );

  useEffect(() => {
    clearAnalysisState();
  }, [
    clearAnalysisState,
    reviewPly,
    displayState.toPlay,
    displayState.captures.B,
    displayState.captures.W,
    displayState.moves.length
  ]);

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch {
      setStatusMessage("ログインに失敗しました。再度お試しください。");
    }
  }, []);

  const formatAnalysisError = useCallback((error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return DEFAULT_ANALYSIS_ERROR_MESSAGE;
  }, []);

  const handleAnalyzeScore = useCallback(async () => {
    if (!playEnabled || analysisBusy) return;

    const requestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = requestId;
    setAnalysisBusy(true);
    setAnalysisError(null);

    try {
      const result = await analyzeInfluence({
        state: displayState
      });
      if (analysisRequestIdRef.current !== requestId) return;
      setScoreAnalysis(result);
      setStatusMessage("勢力表示（Sabaki）を更新しました。");
    } catch (error) {
      if (analysisRequestIdRef.current !== requestId) return;
      const message = formatAnalysisError(error);
      setAnalysisError(message);
      setStatusMessage("勢力表示に失敗しました。");
    } finally {
      if (analysisRequestIdRef.current === requestId) {
        setAnalysisBusy(false);
      }
    }
  }, [analysisBusy, displayState, formatAnalysisError, playEnabled]);

  const handlePlay = useCallback(
    (x: number, y: number) => {
      if (interactionDisabled) return;
      clearAnalysisState();
      dispatch({ type: "PLAY", move: { x, y } });
    },
    [clearAnalysisState, interactionDisabled]
  );

  const handlePass = useCallback(() => {
    if (interactionDisabled) return;
    clearAnalysisState();
    dispatch({ type: "PASS" });
  }, [clearAnalysisState, interactionDisabled]);

  const handleUndo = useCallback(() => {
    if (interactionDisabled) return;
    clearAnalysisState();
    dispatch({ type: "UNDO" });
  }, [clearAnalysisState, interactionDisabled]);

  const handleRedo = useCallback(() => {
    if (interactionDisabled) return;
    clearAnalysisState();
    dispatch({ type: "REDO" });
  }, [clearAnalysisState, interactionDisabled]);

  const handleNewGame = useCallback(() => {
    if (interactionDisabled) return;
    clearAnalysisState();
    dispatch({ type: "LOAD", state: createStateFromSetup(activeSetup) });
    setMoveNotes({});
    setStatusMessage("新しい盤面を開始しました。");
  }, [activeSetup, clearAnalysisState, interactionDisabled]);

  const handleExportSgf = useCallback(() => {
    const sgf = exportMinimalSgf(state.boardSize, state.moves);
    const blob = new Blob([sgf], { type: "application/x-go-sgf" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "igobanlab-game.sgf";
    anchor.click();

    URL.revokeObjectURL(url);
  }, [state.boardSize, state.moves]);

  const openImportSgfPicker = useCallback(() => {
    if (interactionDisabled) return;
    sgfInputRef.current?.click();
  }, [interactionDisabled]);

  const openSetup = useCallback(() => {
    setSetupDraft({
      boardSize: activeSetup.boardSize,
      komi: activeSetup.komi,
      handicapSelection: activeHandicapSelection
    });
    setScreen("setup");
  }, [activeHandicapSelection, activeSetup]);

  const applySetup = useCallback(() => {
    const normalizedSelection = isHandicapSelection(setupDraft.handicapSelection)
      ? setupDraft.handicapSelection
      : DEFAULT_HANDICAP_SELECTION;

    const normalizedDraft: SetupDraft = {
      boardSize: normalizeBoardSize(setupDraft.boardSize),
      komi: setupDraft.komi,
      handicapSelection: normalizedSelection
    };

    const normalizedSetup = setupFromDraft(normalizedDraft, evenKomiMemory);

    if (normalizedSelection === "even") {
      setEvenKomiMemory(normalizedSetup.komi);
    }

    setActiveSetup(normalizedSetup);
    setActiveHandicapSelection(normalizedSelection);
    setMoveNotes({});
    setReviewPly(0);
    setIsNoteExpanded(false);
    clearAnalysisState();
    setAnalysisBusy(false);
    moveCountRef.current = 0;
    dispatch({ type: "LOAD", state: createStateFromSetup(normalizedSetup) });
    setStatusMessage("盤面を開始しました。");
    setScreen("board");
  }, [clearAnalysisState, evenKomiMemory, setupDraft]);

  const clearBoardSession = useCallback(() => {
    setActiveSetup(DEFAULT_SETUP);
    setActiveHandicapSelection(DEFAULT_HANDICAP_SELECTION);
    setSetupDraft(DEFAULT_SETUP_DRAFT);
    setEvenKomiMemory(DEFAULT_SETUP.komi);
    setGameInfo(DEFAULT_GAME_INFO);
    setMoveNotes({});
    setReviewPly(0);
    setIsNoteExpanded(false);
    clearAnalysisState();
    setAnalysisBusy(false);
    moveCountRef.current = 0;
    dispatch({ type: "LOAD", state: createStateFromSetup(DEFAULT_SETUP) });
    setStatusMessage("準備完了");
  }, [clearAnalysisState]);

  const hasGameInfoInput = useMemo(
    () => Object.values(gameInfo).some((value) => value.trim().length > 0),
    [gameInfo]
  );
  const hasMoveNotesInput = useMemo(
    () => Object.values(moveNotes).some((value) => value.trim().length > 0),
    [moveNotes]
  );
  const needsClearConfirm = state.moves.length > 0 || hasGameInfoInput || hasMoveNotesInput;

  const confirmBoardClear = useCallback((): boolean => {
    if (!needsClearConfirm) {
      return true;
    }
    return window.confirm(CLEAR_CONFIRM_MESSAGE);
  }, [needsClearConfirm]);

  const applyImportedSgf = useCallback(
    (sgfText: string, fileName: string) => {
      const imported = importSgf(sgfText);
      const importedSelection = setupToHandicapSelection(imported.setup);

      setActiveSetup(imported.setup);
      setActiveHandicapSelection(importedSelection);
      setSetupDraft({
        boardSize: imported.setup.boardSize,
        komi: imported.setup.komi,
        handicapSelection: importedSelection
      });
      if (importedSelection === "even") {
        setEvenKomiMemory(imported.setup.komi);
      }

      setGameInfo({
        gameDate: imported.metadata.gameDate,
        blackName: imported.metadata.blackName,
        whiteName: imported.metadata.whiteName,
        blackRank: imported.metadata.blackRank,
        whiteRank: imported.metadata.whiteRank,
        location: imported.metadata.location
      });

      setMoveNotes({});
      setReviewPly(imported.state.moves.length);
      setIsNoteExpanded(false);
      clearAnalysisState();
      setAnalysisBusy(false);
      moveCountRef.current = imported.state.moves.length;
      dispatch({ type: "LOAD", state: imported.state });
      setStatusMessage(`SGFを読み込みました: ${fileName}`);
      setScreen("board");
    },
    [clearAnalysisState]
  );

  const handleImportSgfFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      if (!confirmBoardClear()) {
        input.value = "";
        return;
      }

      try {
        const sgfText = await file.text();
        applyImportedSgf(sgfText, file.name);
      } catch (error) {
        const message =
          error instanceof SgfImportError
            ? error.message
            : error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "SGFの読み込みに失敗しました。";
        setStatusMessage(`SGF読み込み失敗: ${message}`);
      } finally {
        input.value = "";
      }
    },
    [applyImportedSgf, confirmBoardClear]
  );

  const backToMenuFromBoard = useCallback(() => {
    if (!confirmBoardClear()) {
      return;
    }
    clearBoardSession();
    setScreen("menu");
  }, [clearBoardSession, confirmBoardClear]);

  const handleLogOut = useCallback(async () => {
    if (screen === "board") {
      if (!confirmBoardClear()) {
        return;
      }
      clearBoardSession();
    }

    try {
      await signOutUser();
    } catch {
      setStatusMessage("ログオフに失敗しました。再度お試しください。");
    }
  }, [clearBoardSession, confirmBoardClear, screen]);

  const updateInfoField = useCallback((key: keyof GameInfo, value: string) => {
    setGameInfo((prev) => ({ ...prev, [key]: value }));
  }, []);

  const currentMoveNote = reviewPly > 0 ? moveNotes[reviewPly] ?? "" : "";
  const notePreview =
    reviewPly === 0
      ? "1手目以降でメモできます"
      : currentMoveNote.trim().length > 0
        ? currentMoveNote
        : "この手のメモは未入力です";

  const stepBackward = useCallback(() => {
    setReviewPly((prev) => Math.max(0, prev - 1));
  }, []);

  const stepForward = useCallback(() => {
    setReviewPly((prev) => Math.min(state.moves.length, prev + 1));
  }, [state.moves.length]);

  const stepBackward10 = useCallback(() => {
    setReviewPly((prev) => Math.max(0, prev - 10));
  }, []);

  const stepForward10 = useCallback(() => {
    setReviewPly((prev) => Math.min(state.moves.length, prev + 10));
  }, [state.moves.length]);

  const handleKomiChange = useCallback((value: number) => {
    setSetupDraft((prev) => {
      const result = applyKomiChange(prev, value, evenKomiMemory);
      if (result.evenKomiMemory !== evenKomiMemory) {
        setEvenKomiMemory(result.evenKomiMemory);
      }
      return result.draft;
    });
  }, [evenKomiMemory]);

  const handleHandicapChange = useCallback(
    (selection: HandicapSelection) => {
      setSetupDraft((prev) => {
        const result = applyHandicapChange(prev, selection, evenKomiMemory);
        if (result.evenKomiMemory !== evenKomiMemory) {
          setEvenKomiMemory(result.evenKomiMemory);
        }
        return result.draft;
      });
    },
    [evenKomiMemory]
  );

  if (!authReady) {
    return (
      <main className="app-shell screen-center">
        <section className="screen-card narrow">
          <p className="muted">認証状態を確認中...</p>
        </section>
      </main>
    );
  }

  if (screen === "login") {
    return (
      <main className="app-shell screen-center">
        <section className="screen-card narrow">
          <h1>iGobanLab</h1>
          <button
            type="button"
            className="primary large"
            onClick={() => void handleSignIn()}
            disabled={!isFirebaseConfigured}
          >
            Googleでログイン
          </button>
          {!isFirebaseConfigured && (
            <p className="warning-text">Firebaseが未設定のためログインできません。</p>
          )}
        </section>
      </main>
    );
  }

  if (screen === "menu") {
    return (
      <main className="app-shell screen-center">
        <section className="screen-card narrow">
          <h1>メニュー</h1>
          <button type="button" className="primary large" onClick={openSetup}>
            棋譜並べ
          </button>
          <button type="button" className="large" onClick={() => void handleLogOut()}>
            ログオフ
          </button>
        </section>
      </main>
    );
  }

  if (screen === "setup") {
    return (
      <main className="app-shell screen-center">
        <section className="screen-card setup-card">
          <h1>棋譜並べ設定</h1>

          <label className="form-row">
            <span>碁盤サイズ</span>
            <select
              value={setupDraft.boardSize}
              onChange={(event) =>
                setSetupDraft((prev) => ({ ...prev, boardSize: Number(event.target.value) }))
              }
            >
              {BOARD_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}路盤
                </option>
              ))}
            </select>
          </label>

          <label className="form-row">
            <span>コミ</span>
            <input
              type="number"
              step="0.5"
              value={setupDraft.komi}
              onChange={(event) => handleKomiChange(Number(event.target.value))}
            />
          </label>

          <label className="form-row">
            <span>ハンディキャップ</span>
            <select
              value={setupDraft.handicapSelection}
              onChange={(event) => {
                const value = event.target.value;
                if (isHandicapSelection(value)) {
                  handleHandicapChange(value);
                }
              }}
            >
              {HANDICAP_SELECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="setup-actions">
            <button type="button" onClick={() => setScreen("menu")}>
              戻る
            </button>
            <button type="button" className="primary" onClick={applySetup}>
              OK
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell board-screen layout-${layoutPreset}`}>
      <header className="header-card">
        <p className="muted header-summary">
          {activeSetup.boardSize}路盤 / コミ {activeSetup.komi} / ハンディキャップ {handicapSummaryLabel(activeHandicapSelection)}
        </p>
        <div className="header-actions">
          <button type="button" onClick={backToMenuFromBoard}>
            戻る
          </button>
          <button type="button" onClick={() => void handleLogOut()}>
            ログオフ
          </button>
        </div>
      </header>

      <input
        ref={sgfInputRef}
        className="file-input-hidden"
        type="file"
        accept=".sgf,application/x-go-sgf,text/plain"
        onChange={(event) => void handleImportSgfFile(event)}
      />

      <div className="workspace">
        <div className="board-panel">
          <section className="goban-card board-frame">
            <div className="board-frame-top">
              <div className="board-inline-state" aria-label="局面状態">
                <span className="board-state-chip">手番: {displayState.toPlay === "B" ? "黒" : "白"}</span>
                <span className="board-state-chip">黒アゲハマ: {displayState.captures.B}</span>
                <span className="board-state-chip">白アゲハマ: {displayState.captures.W}</span>
              </div>
              <span className="ply-badge">
                {reviewPly} / {state.moves.length}手
              </span>
            </div>

            <div className="board-surface">
              <GobanView
                state={displayState}
                disabled={interactionDisabled}
                onPlay={handlePlay}
                compact={compactLayout}
                showCoordinates={showCoordinates}
                resizeKey={resizeKey}
                extraMarkerMap={overlayMarkerMap}
                selectedVertices={selectedVertices}
              />
            </div>

            <div className="move-nav-actions">
              <button type="button" onClick={stepBackward10} disabled={reviewPly === 0} aria-label="10手戻る">
                {"<<"}
              </button>
              <button type="button" onClick={stepBackward} disabled={reviewPly === 0} aria-label="1手戻る">
                {"<"}
              </button>
              <button
                type="button"
                onClick={stepForward}
                disabled={reviewPly >= state.moves.length}
                aria-label="1手進む"
              >
                {">"}
              </button>
              <button
                type="button"
                onClick={stepForward10}
                disabled={reviewPly >= state.moves.length}
                aria-label="10手進む"
              >
                {">>"}
              </button>
            </div>

            <section className={`note-shell ${isNoteExpanded ? "expanded" : "collapsed"}`}>
              <button
                type="button"
                className="note-toggle"
                onClick={() => setIsNoteExpanded((prev) => !prev)}
                aria-expanded={isNoteExpanded}
              >
                {noteTitle}
              </button>

              {isNoteExpanded ? (
                <textarea
                  className="note-input"
                  value={currentMoveNote}
                  onChange={(event) => {
                    if (reviewPly === 0) return;
                    setMoveNotes((prev) => ({ ...prev, [reviewPly]: event.target.value }));
                  }}
                  placeholder={reviewPly === 0 ? "1手目以降でメモできます" : `${reviewPly}手目のメモ`}
                  disabled={reviewPly === 0}
                />
              ) : (
                <p className="note-preview">{notePreview}</p>
              )}
            </section>

            <p className={`muted review-warning ${isReviewingPast ? "visible" : "hidden"}`} aria-live="polite">
              {isReviewingPast ? "過去局面の確認中です。着手するには最後の手まで進めてください。" : "\u00A0"}
            </p>
          </section>
        </div>

        <div className="sidebar">
          <section className="status-card panel-card info-card">
            <h2 className="panel-title">対局情報</h2>

            <div className="panel-scroll">
              <label className="form-row compact">
                <span>対局日</span>
                <input
                  type="date"
                  value={gameInfo.gameDate}
                  onChange={(event) => updateInfoField("gameDate", event.target.value)}
                />
              </label>

              <label className="form-row compact">
                <span>黒番 対局者</span>
                <input
                  type="text"
                  value={gameInfo.blackName}
                  onChange={(event) => updateInfoField("blackName", event.target.value)}
                  placeholder="例: 黒 太郎"
                />
              </label>

              <label className="form-row compact">
                <span>黒番 段級位</span>
                <input
                  type="text"
                  value={gameInfo.blackRank}
                  onChange={(event) => updateInfoField("blackRank", event.target.value)}
                  placeholder="例: 3段"
                />
              </label>

              <label className="form-row compact">
                <span>白番 対局者</span>
                <input
                  type="text"
                  value={gameInfo.whiteName}
                  onChange={(event) => updateInfoField("whiteName", event.target.value)}
                  placeholder="例: 白 花子"
                />
              </label>

              <label className="form-row compact">
                <span>白番 段級位</span>
                <input
                  type="text"
                  value={gameInfo.whiteRank}
                  onChange={(event) => updateInfoField("whiteRank", event.target.value)}
                  placeholder="例: 2段"
                />
              </label>

              <label className="form-row compact">
                <span>対局場所</span>
                <input
                  type="text"
                  value={gameInfo.location}
                  onChange={(event) => updateInfoField("location", event.target.value)}
                  placeholder="例: 自宅 / 碁会所"
                />
              </label>
            </div>

            <p className="panel-status">{statusMessage}</p>
          </section>

          <Controls
            canUndo={state.history.length > 0}
            canRedo={state.future.length > 0}
            disabled={interactionDisabled}
            analysisBusy={analysisBusy}
            analysisDisabled={!playEnabled}
            scoreAnalysis={scoreAnalysis}
            ownershipSummary={ownershipSummary}
            analysisError={analysisError}
            showDeadStoneOverlay={showDeadStoneOverlay}
            hasDeadStoneOverlay={hasDeadStoneOverlay}
            onPass={handlePass}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onNewGame={handleNewGame}
            onImportSgf={openImportSgfPicker}
            onExportSgf={handleExportSgf}
            onToggleDeadStoneOverlay={toggleDeadStoneOverlay}
            onAnalyzeScore={() => void handleAnalyzeScore()}
          />
        </div>
      </div>
    </main>
  );
};
