# iGobanLab

iGobanLab は、Shudan + Firebase で作る最小構成の囲碁 Web アプリです。

## 現在の実装範囲（Phase1）

- Google ログイン（Firebase Authentication）
- 19x19 盤面表示（Shudan）
- 着手、捕獲（アゲハマ反映）、Pass
- Undo / Redo / New Game
- 最小 SGF エクスポート
- Firestore への activeGame 保存・復元
  - 保存先: `users/{uid}/activeGame/state`

非対応（今後）:

- コウ判定
- 終局地計算
- AI 解析
- オンライン対局

## リポジトリ構成

```text
igobanlab/
  web/    # React + TypeScript + Vite + Shudan
  api/    # FastAPI skeleton (/healthz)
  infra/  # インフラ補助ドキュメント
```

## 前提環境

- Node.js 20+
- npm 10+
- Firebase CLI

```bash
npm i -g firebase-tools
```

## セットアップ

1. 依存インストール

```bash
cd web
npm install
cd ..
```

2. Firebase 環境変数を設定

```bash
cp web/.env.example web/.env.local
```

`web/.env.local` に以下を設定してください。

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

3. Firebase プロジェクト確認

`.firebaserc` の `default` が対象プロジェクト ID になっていることを確認します。

## 開発

リポジトリルートで実行:

```bash
npm run dev
```

## テスト

```bash
npm run test
```

## ビルド

```bash
npm run build
```

## Hosting デプロイ

```bash
firebase login
npm run build
firebase deploy --only hosting
```

または:

```bash
npm run deploy:hosting
```

## API（雛形）

`api/` には将来の AI 解析用バックエンドの土台として FastAPI 雛形があります。

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

ヘルスチェック:

```bash
curl -i http://localhost:8080/healthz
```

## セキュリティ / 機密情報

- `web/.env.local` は Git 管理対象外です（`.gitignore` 設定済み）。
- APIキー等を含む `.env.local` をコミットしないでください。
- 確認コマンド:

```bash
git check-ignore -v web/.env.local
git status --short
```
