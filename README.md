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
- API 経由の手動解析（KataGo連携準備）
  - `勢力表示`（ローカル優先 + APIフォールバック）
  - `候補手評価（スコアレート）`（KataGo API）
  - 重複送信抑止（in-flight中は分析ボタン無効）
  - 低遅延モード（既定: low visits）

非対応（今後）:

- コウ判定
- 終局地計算
- AI 自動対局（ジョブ方式は雛形のみ）
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
VITE_API_BASE_URL=http://localhost:8080
```

`VITE_API_BASE_URL` は `候補手評価`（KataGo API）で必須です。  
`勢力表示` は通常ローカル計算で動作しますが、ローカル失敗時のAPIフォールバックを使う場合は `VITE_API_BASE_URL` が必要です。

## 勢力図 v2 仕様

- `勢力表示` は以下の順序で実行されます。
  1. ブラウザ内ローカル推定（高速）
  2. ローカル失敗時のみ `POST /v1/analyze/score` にフォールバック（`maxVisits=8`, `includeOwnership=true`）
- 盤面表示は交点スクエアで、空点のみを対象にオーバーレイします（石の上には描画しません）。
- 勢力値 `v` は 3 段階に量子化して表示します。
  - `|v| < 0.15`: 非表示
  - `0.15 <= |v| < 0.33`: 弱
  - `0.33 <= |v| < 0.66`: 中
  - `|v| >= 0.66`: 強
- 解析結果カードには `source`（`local` / `api-fallback`）と `elapsed`（ms）を表示します。
- `influence B/W/N` は石数ではなく、上記閾値で分類した勢力マス数の集計です。

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
`api/` は FastAPI + KataGo 連携用です。

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

分析API:

```bash
curl -i http://localhost:8080/v1/analyze/score \
  -H "Content-Type: application/json" \
  -d '{
    "boardSize": 19,
    "komi": 6.5,
    "handicap": 0,
    "rules": "japanese",
    "moves": [],
    "maxVisits": 200,
    "includeOwnership": true
  }'
```

`KATAGO_ENABLED=false` の場合、分析系は `503` になります。

## Cloud Run (KataGo) デプロイ基準値

```bash
cp api/cloudrun.env.example api/cloudrun.env
# 必要に応じて api/cloudrun.env を編集

gcloud run deploy igobanlab-api \
  --source api \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --cpu 2 \
  --memory 2Gi \
  --timeout 20 \
  --min-instances 0 \
  --max-instances 1 \
  --env-vars-file api/cloudrun.env
```

`api/katago/` に以下を配置してからデプロイしてください:

- `katago`（Linux実行バイナリ）
- `analysis.cfg`
- `model.bin.gz`

Cloud Runではファイルシステム制約を避けるため、`api/cloudrun.env` に以下を含めてください:

```bash
KATAGO_OVERRIDE_CONFIG=logToStderr=true,logFile=/tmp/katago.log
KATAGO_APPIMAGE_EXTRACT_AND_RUN=true
```

## コスト前提（2026-03-07時点）

- Spark単体ではCloud Runが使えないため、KataGoをクラウド運用する場合はBlaze必須。
- Cloud Run CPUはfree tier内なら課金0〜小額で運用可能。
- Cloud Run GPUはfree tier対象外のため有料化しやすい。
- Firestore free quota (`20,000 writes/day`) を超えないよう、解析結果は永続化しない前提で運用。

## 予算アラート（必須）

1. Google Cloud Consoleで `Billing > Budgets & alerts` を開く  
2. `Create budget` で月額上限（例: 1,000円）を設定  
3. Alert thresholdを `50% / 90% / 100%` に設定  
4. 通知先メールをプロジェクト運用者に設定  

## 解析エラーのよくある原因

- エラー: `Unexpected token '<', "<!doctype "... is not valid JSON`
- 原因: `候補手評価` または `勢力表示` のAPIフォールバックが分析APIではなくHTMLを受け取っている（`VITE_API_BASE_URL` 未設定 or 誤設定）
- 対処:
  - 開発: `web/.env.local` に `VITE_API_BASE_URL=http://localhost:8080`
  - 本番: `VITE_API_BASE_URL=https://<your-cloud-run-service-url>`
  - 反映後に `npm run build` して再デプロイ

- エラー: `Failed to fetch`
- 主な原因:
  - `候補手評価` / `勢力表示` APIフォールバックの Cloud Run APIに到達できないURLを指定している
  - `候補手評価` / `勢力表示` APIフォールバックの CORS未設定でブラウザが遮断している
  - `候補手評価` / `勢力表示` APIフォールバックで `http://` のAPI URLを `https://` ページから呼んでいる（Mixed Content）
- 対処:
  - `VITE_API_BASE_URL` が `https://...run.app` か確認
  - Cloud Run側に `CORS_ALLOW_ORIGINS` を設定して再デプロイ

## セキュリティ / 機密情報

- `web/.env.local` は Git 管理対象外です（`.gitignore` 設定済み）。
- APIキー等を含む `.env.local` をコミットしないでください。
- 確認コマンド:

```bash
git check-ignore -v web/.env.local
git status --short
```
