# Tetris

Classic Tetris with 7 standard tetrominoes, wall kicks, ghost piece, next-piece preview, line clearing, scoring, and level progression.

Built with [ECS Game Factory](https://github.com/agadabanka/game-factory) using the **TypeScript Intermediate Language** pipeline.

## Architecture

```
game.js (TypeScript IL)  →  esbuild-wasm  →  dist/game.bundle.js (standalone)
```

- `game.js` — Game spec using the `@engine` SDK (10KB source)
- `dist/game.bundle.js` — Standalone bundle (~19KB) with zero external dependencies
- `spec.json` — Original JSON spec (backward compatibility)

## Controls

| Key | Action |
|-----|--------|
| Arrow Left / A | Move piece left |
| Arrow Right / D | Move piece right |
| Arrow Down / S | Soft drop |
| Arrow Up / W | Rotate |
| Space | Hard drop |
| R | Restart |

## Features

- 7 standard tetrominoes (I, O, T, S, Z, L, J)
- Ghost piece projection (see where piece will land)
- Next piece preview
- Wall kick rotation
- Line clearing with row collapse
- Scoring: 100/300/500/800 for 1/2/3/4 lines (multiplied by level)
- Hard drop bonus (2 points per cell dropped)
- Level progression every 10 lines cleared
- Speed acceleration per level (1000ms down to 100ms)
