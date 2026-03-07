// Minimal goscorer-compatible scoring helpers for iGobanLab.
// API surface intentionally matches the functions used by this app.

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

const inBounds = (x, y, size) => x >= 0 && y >= 0 && x < size && y < size;

const neighborsOf = (x, y, size) => {
  const result = [];
  if (x > 0) result.push([x - 1, y]);
  if (x + 1 < size) result.push([x + 1, y]);
  if (y > 0) result.push([x, y - 1]);
  if (y + 1 < size) result.push([x, y + 1]);
  return result;
};

const makeBoolGrid = (size, value = false) =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => value));

const toDeadGrid = (markedDead, size) => {
  const dead = makeBoolGrid(size, false);
  if (!Array.isArray(markedDead)) {
    return dead;
  }

  for (let y = 0; y < size; y += 1) {
    const row = markedDead[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < size; x += 1) {
      dead[y][x] = row[x] === true;
    }
  }
  return dead;
};

const cloneStones = (stones, size) => {
  const result = Array.from({ length: size }, () => Array.from({ length: size }, () => EMPTY));
  for (let y = 0; y < size; y += 1) {
    const row = stones[y] || [];
    for (let x = 0; x < size; x += 1) {
      const value = row[x];
      result[y][x] = value === BLACK || value === WHITE ? value : EMPTY;
    }
  }
  return result;
};

const buildVirtualBoard = (stones, markedDead) => {
  const size = Array.isArray(stones) ? stones.length : 0;
  const board = cloneStones(stones, size);
  const dead = toDeadGrid(markedDead, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (dead[y][x]) {
        board[y][x] = EMPTY;
      }
    }
  }

  return { size, board, dead };
};

const analyzeRegions = (board, size) => {
  const ownerMap = Array.from({ length: size }, () => Array.from({ length: size }, () => EMPTY));
  const visited = makeBoolGrid(size, false);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (visited[y][x]) continue;

      const point = board[y][x];
      if (point === BLACK || point === WHITE) {
        ownerMap[y][x] = point;
        visited[y][x] = true;
        continue;
      }

      const stack = [[x, y]];
      const region = [];
      const borders = new Set();

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        if (!inBounds(cx, cy, size) || visited[cy][cx]) continue;
        if (board[cy][cx] !== EMPTY) continue;

        visited[cy][cx] = true;
        region.push([cx, cy]);

        for (const [nx, ny] of neighborsOf(cx, cy, size)) {
          const neighbor = board[ny][nx];
          if (neighbor === EMPTY) {
            if (!visited[ny][nx]) {
              stack.push([nx, ny]);
            }
          } else {
            borders.add(neighbor);
          }
        }
      }

      let owner = EMPTY;
      if (borders.size === 1) {
        owner = borders.has(BLACK) ? BLACK : WHITE;
      }

      for (const [rx, ry] of region) {
        ownerMap[ry][rx] = owner;
      }
    }
  }

  return ownerMap;
};

const countMarkedDead = (stones, dead, color, size) => {
  let count = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (dead[y][x] && stones[y][x] === color) {
        count += 1;
      }
    }
  }
  return count;
};

export const territoryScoring = (stones, markedDead = []) => {
  const { size, board } = buildVirtualBoard(stones, markedDead);
  const ownerMap = analyzeRegions(board, size);

  return ownerMap.map((row) =>
    row.map((owner) => ({
      isTerritoryFor: owner,
      belongsToSekiGroup: EMPTY
    }))
  );
};

export const finalTerritoryScore = (
  stones,
  markedDead = [],
  blackCaptures = 0,
  whiteCaptures = 0,
  komi = 0
) => {
  const { size, board, dead } = buildVirtualBoard(stones, markedDead);
  const scoreMap = territoryScoring(stones, markedDead);

  let blackTerritory = 0;
  let whiteTerritory = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (board[y][x] !== EMPTY) continue;
      const owner = scoreMap[y][x].isTerritoryFor;
      if (owner === BLACK) {
        blackTerritory += 1;
      } else if (owner === WHITE) {
        whiteTerritory += 1;
      }
    }
  }

  const deadBlack = countMarkedDead(stones, dead, BLACK, size);
  const deadWhite = countMarkedDead(stones, dead, WHITE, size);

  const black = blackTerritory + blackCaptures + deadWhite;
  const white = whiteTerritory + whiteCaptures + deadBlack + komi;

  return { black, white };
};
