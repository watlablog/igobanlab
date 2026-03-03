# iGobanLab – DESIGN.md

> Goal: **Ship a “works-now” minimal Go (囲碁) web app** using **Shudan + Firebase**, then grow it into **kifu (棋譜) management** and **AI analysis** later.

---

## 1. Product vision

### 1.1 MVP (Phase 1: “すぐ動く”)
**Must-have**
- User login (Firebase Auth: Google)
- 19x19 goban UI (Shudan)
- Place stones alternately (Black/White)
- Captures work (囲ったら取れる) + **agehama** (captured stones count)
- **No ko rule yet** (コウ判定なし)
- Basic game actions: pass, undo/redo, new game

**Nice-to-have (still Phase 1 if easy)**
- Save/load current game to Firestore (single “active game” per user)
- Export simple SGF (no variations)

### 1.2 Phase 2+ (Roadmap)
- Kifu list per user, SGF import/export
- Game tree / variations (検討用の分岐)
- Review features (tags, comments, marks, winrate graph placeholder)
- AI analysis integration (KataGo etc.) via Cloud Run (Python) or other backend
- OGS-like features (rooms, online play) later

---

## 2. Architecture (MoraCollect-like)

### 2.1 High-level
- **Frontend**: Vite + TypeScript (+ Preact/React wrapper if needed) + Shudan
- **Auth**: Firebase Authentication (Google)
- **DB**: Cloud Firestore (game state, kifu metadata)
- **Hosting**: Firebase Hosting
- (Later) **Backend**: Cloud Run (Python) for AI analysis / heavy processing

**Why this stack**
- Fast MVP iteration
- Simple login + DB + hosting “one console”
- Easy to extend with Cloud Run when AI arrives

---

## 3. Repository layout (recommended)

```
igobanlab/
  README.md
  DESIGN.md
  firebase.json
  .firebaserc
  .gitignore
  package.json
  vite.config.ts
  tsconfig.json
  src/
    main.ts
    style.css
    app/
      App.tsx                # UI root
    ui/
      GobanView.tsx          # Shudan-based board view
      Controls.tsx           # pass/undo/new, info panels
    game/
      rules.ts               # capture logic (no ko), helpers
      state.ts               # GameState model + reducers
      sgf.ts                 # (optional Phase 1) minimal SGF export
    firebase/
      firebase.ts            # init app + auth + db
      auth.ts                # signIn/signOut + subscribe
      db.ts                  # save/load game
    types/
      models.ts              # type definitions
  public/
    favicon.ico
```

> Note: If you prefer Vanilla TS (no JSX), you can still use Shudan, but **UI state management becomes harder**.  
> For “quick MVP + future features”, **React/Preact** is recommended.

---

## 4. Core data model

### 4.1 In-memory (frontend) `GameState`
Minimal model (Phase 1):

- `boardSize`: 19
- `toPlay`: `"B" | "W"`
- `grid`: `Int8Array` length = 19*19  
  - `0 = empty`, `1 = black`, `2 = white`
- `captures`: `{ B: number; W: number }` (agehama)
- `history`: stack of previous states for undo/redo
- `moves`: list of moves (x,y or pass) for SGF export

### 4.2 Firestore documents (Phase 1 optional)
Keep it very simple first:

**Collection**
- `users/{uid}/games/{gameId}`

**Document fields (minimal)**
- `createdAt`, `updatedAt`
- `name`: string (e.g. “Practice 2026-03-03”)
- `boardSize`: 19
- `moves`: array (compact encoding recommended)
- `result`: optional
- `active`: boolean (or store latest active gameId in `users/{uid}`)

> Phase 1 can skip game list and only store the active game:
- `users/{uid}/activeGame` doc (single)

---

## 5. Rules engine (Phase 1)

### 5.1 Requirements
- Alternating turns B/W
- When placing a stone:
  - Merge into group
  - Check adjacent opponent groups → if any have **0 liberties**, capture them
  - Remove captured stones and increment `captures[toPlay]`
- Allow suicide?  
  - Recommended: **disallow suicide** (simple and intuitive)
- **Ko rule**: **not implemented** in Phase 1

### 5.2 Implementation notes
Implement these helpers in `src/game/rules.ts`:

- `neighbors(i): number[]` (4-neighborhood)
- `groupAt(i, grid): Set<number>` (BFS/DFS)
- `libertiesOf(group, grid): number`
- `applyMove(state, move): nextState`
  - validate empty
  - place stone
  - capture opponent groups with 0 liberties
  - then check own group liberties (suicide check)
  - update `toPlay`, history, moves, captures

Complexity is fine for 19x19 in the browser.

---

## 6. UI (Shudan) integration

### 6.1 Responsibilities split
- **Shudan**: rendering (stones, markers, overlays), pointer interaction
- **Our code**: authoritative `GameState` + rules

Flow:
1. user clicks intersection
2. `GobanView` emits `(x,y)`
3. `applyMove()` returns new state
4. re-render Shudan with new grid

### 6.2 UI components
- `GobanView`
  - renders board
  - handles click/tap
  - optional hover / last-move marker
- `Controls`
  - New Game / Pass / Undo / Redo
  - Captures display (B/W agehama)
- `Header`
  - Login state + Sign in/out

---

## 7. Firebase setup

### 7.1 Create project
1. Firebase Console → Create project `igobanlab`
2. Enable:
   - Authentication → Google
   - Firestore (test mode during dev; tighten rules later)
   - Hosting

### 7.2 Local config
- Put Firebase web config into `src/firebase/firebase.ts`
- Prefer `.env` for keys (Vite uses `VITE_` prefix):
  - `.env.local` (gitignored)
  - `VITE_FIREBASE_API_KEY=...` etc.

### 7.3 Firestore security rules (Phase 1)
Minimum safe rules:
- Only authenticated user can read/write their own docs:
  - `match /users/{uid}/{document=**} { allow read, write: if request.auth.uid == uid; }`

> Tighten later if you add public sharing, rooms, etc.

---

## 8. Development workflow

### 8.1 Local dev
- `npm i`
- `npm run dev`
- (optional) Firebase emulators for Auth/Firestore:
  - `firebase emulators:start`

### 8.2 Build & deploy
- `npm run build`
- `firebase deploy`

### 8.3 CI (optional but recommended)
GitHub Actions:
- on push to main:
  - run `npm ci && npm run build`
  - deploy to Firebase Hosting (preview channels for PRs)

---

## 9. Step-by-step implementation plan (beginner-friendly)

### Step 0: Bootstrap
- Create Vite TS project (React or Preact)
- Add Firebase SDK
- Add Shudan

### Step 1: Login
- Google sign-in button
- Show user avatar/name
- Sign-out button

### Step 2: Board render (no rules)
- Render empty 19x19 board
- Click to place stone (just place, no validation)
- Alternate B/W

### Step 3: Captures (no ko)
- Add group/liberty logic
- Implement capture removal
- Display agehama (captures B/W)

### Step 4: Undo/redo + pass
- History stack
- Pass = toggle player + record move

### Step 5 (optional): Save active game
- Save `moves` to Firestore
- Load on login (resume)

### Step 6 (optional): Export SGF
- Minimal SGF export: board size, moves, result blank

> Stop here. This is already a useful practice board.

---

## 10. Future extensions (how MVP evolves cleanly)

### 10.1 Kifu management
- Introduce `games` collection and metadata list
- Add SGF import
- Add tags, notes, positions bookmarks

### 10.2 AI analysis (recommended approach)
- Frontend requests analysis for a position (SGF or board snapshot)
- Backend (Cloud Run Python):
  - runs KataGo (or other)
  - returns top moves, winrate, score lead
- Frontend overlays:
  - candidate moves heatmap
  - arrows + labels
  - timeline graph

### 10.3 Online play
- Firestore-based “room” for casual (low frequency)
- WebSocket server if you need strict realtime, clocks, or scalability

---

## 11. Non-goals (Phase 1)
- Ko rule
- Territory/score finalization
- Matchmaking / ranked ladder
- AI analysis

Keep Phase 1 brutally small.

---

## 12. Naming & branding
- App name: **iGobanLab**
- Repo name suggestion: `igobanlab` or `igo-ban-lab` (choose one and keep consistent)
- One-liner (GitHub description):
  - “A minimal Go (囲碁) web app built with Shudan + Firebase—practice, save kifu, and extend to AI analysis.”

