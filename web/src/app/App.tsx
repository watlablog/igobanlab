import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Controls } from "../ui/Controls";
import { GobanView } from "../ui/GobanView";
import { Header } from "../ui/Header";
import { exportMinimalSgf } from "../game/sgf";
import { createInitialState, gameReducer } from "../game/state";
import { loadActiveGame, saveActiveGame } from "../firebase/db";
import { signInWithGoogle, signOutUser, subscribeAuth } from "../firebase/auth";
import { isFirebaseConfigured } from "../firebase/firebase";

const SAVE_DEBOUNCE_MS = 300;

export const App = () => {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState(19));
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingGame, setLoadingGame] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready");

  const hasLoadedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = subscribeAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isFirebaseConfigured) {
      return;
    }

    if (!user) {
      dispatch({ type: "RESET", boardSize: 19 });
      hasLoadedForUidRef.current = null;
      setStatusMessage("Sign in to load/save your active game.");
      return;
    }

    const load = async (): Promise<void> => {
      setLoadingGame(true);
      try {
        const loaded = await loadActiveGame(user.uid);
        if (cancelled) return;

        if (loaded) {
          dispatch({ type: "LOAD", state: loaded });
          setStatusMessage("Active game loaded.");
        } else {
          dispatch({ type: "RESET", boardSize: 19 });
          setStatusMessage("No saved game. Started a new board.");
        }

        hasLoadedForUidRef.current = user.uid;
      } catch {
        if (!cancelled) {
          setStatusMessage("Failed to load saved game.");
        }
      } finally {
        if (!cancelled) {
          setLoadingGame(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      return;
    }

    if (hasLoadedForUidRef.current !== user.uid || loadingGame) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        await saveActiveGame(user.uid, state);
        setStatusMessage("Active game saved.");
      } catch {
        setStatusMessage("Failed to save game.");
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state, user, loadingGame]);

  const playEnabled = useMemo(() => {
    if (!isFirebaseConfigured) return true;
    return Boolean(user) && !loadingGame;
  }, [user, loadingGame]);

  const handlePlay = useCallback(
    (x: number, y: number) => {
      if (!playEnabled) return;
      dispatch({ type: "PLAY", move: { x, y } });
    },
    [playEnabled]
  );

  const handlePass = useCallback(() => {
    if (!playEnabled) return;
    dispatch({ type: "PASS" });
  }, [playEnabled]);

  const handleUndo = useCallback(() => {
    if (!playEnabled) return;
    dispatch({ type: "UNDO" });
  }, [playEnabled]);

  const handleRedo = useCallback(() => {
    if (!playEnabled) return;
    dispatch({ type: "REDO" });
  }, [playEnabled]);

  const handleNewGame = useCallback(() => {
    if (!playEnabled) return;
    dispatch({ type: "RESET", boardSize: state.boardSize });
  }, [playEnabled, state.boardSize]);

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

  return (
    <main className="app-shell">
      <Header
        user={user}
        authReady={authReady}
        firebaseEnabled={isFirebaseConfigured}
        onSignIn={signInWithGoogle}
        onSignOut={signOutUser}
      />

      <div className="workspace">
        <GobanView state={state} disabled={!playEnabled} onPlay={handlePlay} />

        <div className="sidebar">
          <Controls
            toPlay={state.toPlay}
            captures={state.captures}
            canUndo={state.history.length > 0}
            canRedo={state.future.length > 0}
            disabled={!playEnabled}
            onPass={handlePass}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onNewGame={handleNewGame}
            onExportSgf={handleExportSgf}
          />

          <section className="status-card">
            <strong>Status</strong>
            <p>{statusMessage}</p>
            {loadingGame && <p className="muted">Loading active game...</p>}
          </section>
        </div>
      </div>
    </main>
  );
};
