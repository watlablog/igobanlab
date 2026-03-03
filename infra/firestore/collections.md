# Firestore Collections (Phase1)

## users/{uid}/activeGame/state

- `boardSize`: number (19)
- `toPlay`: "B" | "W"
- `captures`: `{ B: number, W: number }`
- `moves`: array of move objects
- `updatedAt`: server timestamp

This document stores the active game for each signed-in user.
