import type { User } from "firebase/auth";

type HeaderProps = {
  user: User | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export const Header = ({
  user,
  authReady,
  firebaseEnabled,
  onSignIn,
  onSignOut
}: HeaderProps) => {
  const userLabel = user?.displayName || user?.email || user?.uid || "Unknown user";

  return (
    <header className="header-card">
      <div>
        <h1>iGobanLab</h1>
        <p className="muted">Minimal Go practice board (Phase1)</p>
      </div>

      {!firebaseEnabled && (
        <p className="warning-text">Firebase未設定のため、認証/保存は無効です（ローカル盤面のみ動作）。</p>
      )}

      {firebaseEnabled && !authReady && <p className="muted">Checking auth state...</p>}

      {firebaseEnabled && authReady && !user && (
        <button type="button" className="primary" onClick={() => void onSignIn()}>
          Sign in with Google
        </button>
      )}

      {firebaseEnabled && authReady && user && (
        <div className="header-user">
          <span>{userLabel}</span>
          <button type="button" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </div>
      )}
    </header>
  );
};
