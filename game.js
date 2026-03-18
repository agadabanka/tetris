/**
 * Tetris — TypeScript IL game spec using @engine SDK.
 *
 * Standard Tetris with 7 tetrominoes, wall kicks, ghost piece,
 * next-piece preview, line clearing, scoring, and level progression.
 *
 * To run:  game.start(canvas)
 * To bundle:  bundleGame(thisFileSource) → standalone JS
 */

import { defineGame } from '@engine/core';
import { consumeAction } from '@engine/input';
import {
  rotateShape, getAbsCells, collides, lockCells, clearLines, ghostY,
} from '@engine/grid';
import {
  clearCanvas, drawBorder, drawGridBoard, drawPieceCells,
  drawPreview, drawHUD, drawGameOver,
} from '@engine/render';
import { drawTouchOverlay } from '@engine/touch';

// ── Constants ───────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 20;
const CELL_SIZE = 30;

// Standard 7 tetrominoes (SRS-like offsets centered around origin)
const PIECES = {
  I: { shape: [[-1,0],[0,0],[1,0],[2,0]], color: '#00FFFF' },
  O: { shape: [[0,0],[1,0],[0,1],[1,1]], color: '#FFFF00' },
  T: { shape: [[-1,0],[0,0],[1,0],[0,-1]], color: '#AA00FF' },
  S: { shape: [[-1,0],[0,0],[0,-1],[1,-1]], color: '#00FF00' },
  Z: { shape: [[-1,-1],[0,-1],[0,0],[1,0]], color: '#FF0000' },
  L: { shape: [[-1,0],[0,0],[1,0],[1,-1]], color: '#FF8800' },
  J: { shape: [[-1,-1],[-1,0],[0,0],[1,0]], color: '#0044FF' },
};

const PIECE_NAMES = Object.keys(PIECES);
const LINE_SCORES = [0, 100, 300, 500, 800]; // 0,1,2,3,4 lines

// ── Game Definition ─────────────────────────────────────────────────

const game = defineGame({
  display: {
    type: 'grid',
    width: COLS,
    height: ROWS,
    cellSize: CELL_SIZE,
    background: '#0a0a0a',
  },
  input: {
    left:     { keys: ['ArrowLeft', 'a'] },
    right:    { keys: ['ArrowRight', 'd'] },
    down:     { keys: ['ArrowDown', 's'] },
    rotate:   { keys: ['ArrowUp', 'w'] },
    hardDrop: { keys: [' '] },
    restart:  { keys: ['r', 'R'] },
  },
  timing: {
    tickRate: 1000,
  },
});

// ── Components ──────────────────────────────────────────────────────

game.component('ActivePiece', {
  shape: [],
  color: '#fff',
  type: '',
  rotation: 0,
});

game.component('Position', { x: 0, y: 0 });

// ── Resources ───────────────────────────────────────────────────────

game.resource('state', {
  score: 0,
  level: 1,
  lines: 0,
  gameOver: false,
});

game.resource('nextPiece', { type: '' });
game.resource('_gravity', { elapsed: 0 });

// ── Helper: pick random piece ───────────────────────────────────────

function randomPieceType() {
  return PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
}

function getTickInterval(level) {
  return Math.max(100, 1000 - (level - 1) * 80);
}

// ── Spawn System ────────────────────────────────────────────────────

game.system('spawn', function spawnSystem(world, _dt) {
  // Check if there's already an active piece
  const active = world.query('ActivePiece', 'Position');
  if (active.length > 0) return;

  const state = world.getResource('state');
  if (state.gameOver) return;

  // Determine piece type
  let nextRes = world.getResource('nextPiece');
  let pieceType;
  if (!nextRes.type) {
    // First spawn: pick both current and next
    pieceType = randomPieceType();
    nextRes.type = randomPieceType();
  } else {
    pieceType = nextRes.type;
    nextRes.type = randomPieceType();
  }

  const piece = PIECES[pieceType];
  const spawnX = Math.floor(COLS / 2);
  const spawnY = 0;

  // Check for game over (collision at spawn)
  const board = world.getResource('_board');
  const cells = getAbsCells(piece.shape, { x: spawnX, y: spawnY });
  if (collides(board.grid, cells, COLS, ROWS)) {
    state.gameOver = true;
    return;
  }

  const eid = world.createEntity();
  world.addComponent(eid, 'Position', { x: spawnX, y: spawnY });
  world.addComponent(eid, 'ActivePiece', {
    shape: piece.shape.map(c => [...c]),
    color: piece.color,
    type: pieceType,
    rotation: 0,
  });

  // Reset gravity timer
  const gravity = world.getResource('_gravity');
  gravity.elapsed = 0;
});

// ── Input System ────────────────────────────────────────────────────

game.system('input', function inputSystem(world, _dt) {
  const state = world.getResource('state');
  if (state.gameOver) return;

  const input = world.getResource('input');
  const active = world.query('ActivePiece', 'Position');
  if (active.length === 0) return;

  const eid = active[0];
  const pos = world.getComponent(eid, 'Position');
  const piece = world.getComponent(eid, 'ActivePiece');
  const board = world.getResource('_board');

  // Move left
  if (consumeAction(input, 'left')) {
    const cells = getAbsCells(piece.shape, { x: pos.x - 1, y: pos.y });
    if (!collides(board.grid, cells, COLS, ROWS)) {
      pos.x -= 1;
    }
  }

  // Move right
  if (consumeAction(input, 'right')) {
    const cells = getAbsCells(piece.shape, { x: pos.x + 1, y: pos.y });
    if (!collides(board.grid, cells, COLS, ROWS)) {
      pos.x += 1;
    }
  }

  // Soft drop
  if (consumeAction(input, 'down')) {
    const cells = getAbsCells(piece.shape, { x: pos.x, y: pos.y + 1 });
    if (!collides(board.grid, cells, COLS, ROWS)) {
      pos.y += 1;
    }
  }

  // Rotate (with basic wall kick)
  if (consumeAction(input, 'rotate')) {
    const rotated = rotateShape(piece.shape, 1);
    const kicks = [0, -1, 1, -2, 2]; // Try offsets
    let kicked = false;
    for (const dx of kicks) {
      const cells = getAbsCells(rotated, { x: pos.x + dx, y: pos.y });
      if (!collides(board.grid, cells, COLS, ROWS)) {
        piece.shape = rotated;
        pos.x += dx;
        piece.rotation = (piece.rotation + 1) % 4;
        kicked = true;
        break;
      }
    }
  }

  // Hard drop
  if (consumeAction(input, 'hardDrop')) {
    const dropY = ghostY(piece.shape, pos, board.grid, COLS, ROWS);
    state.score += (dropY - pos.y) * 2; // Bonus for hard drop distance
    pos.y = dropY;
    // Lock immediately
    lockPiece(world, eid);
  }
});

// ── Gravity System ──────────────────────────────────────────────────

game.system('gravity', function gravitySystem(world, dt) {
  const state = world.getResource('state');
  if (state.gameOver) return;

  const active = world.query('ActivePiece', 'Position');
  if (active.length === 0) return;

  const gravity = world.getResource('_gravity');
  gravity.elapsed += dt;

  const interval = getTickInterval(state.level);
  if (gravity.elapsed < interval) return;
  gravity.elapsed -= interval;

  const eid = active[0];
  const pos = world.getComponent(eid, 'Position');
  const piece = world.getComponent(eid, 'ActivePiece');
  const board = world.getResource('_board');

  // Try to move down
  const cells = getAbsCells(piece.shape, { x: pos.x, y: pos.y + 1 });
  if (!collides(board.grid, cells, COLS, ROWS)) {
    pos.y += 1;
  } else {
    // Can't move down — lock piece
    lockPiece(world, eid);
  }
});

// ── Lock Piece Helper ───────────────────────────────────────────────

function lockPiece(world, eid) {
  const pos = world.getComponent(eid, 'Position');
  const piece = world.getComponent(eid, 'ActivePiece');
  const board = world.getResource('_board');
  const state = world.getResource('state');

  // Lock cells into grid
  const cells = getAbsCells(piece.shape, pos);
  lockCells(board.grid, cells, piece.color);

  // Destroy active piece entity
  world.destroyEntity(eid);

  // Clear completed lines
  const linesCleared = clearLines(board.grid, COLS);
  if (linesCleared > 0) {
    state.lines += linesCleared;
    state.score += LINE_SCORES[Math.min(linesCleared, 4)] * state.level;
    world.emit('linesCleared', { count: linesCleared });

    // Level up every 10 lines
    const newLevel = Math.floor(state.lines / 10) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      world.emit('levelUp', { level: newLevel });
    }
  }

  world.emit('pieceLocked');
}

// ── Render System ───────────────────────────────────────────────────

game.system('render', function renderSystem(world, _dt) {
  const renderer = world.getResource('renderer');
  if (!renderer) return;

  const { ctx, cellSize, offsetX, offsetY } = renderer;
  const state = world.getResource('state');
  const board = world.getResource('_board');
  const W = COLS * cellSize;
  const H = ROWS * cellSize;

  // Clear
  clearCanvas(ctx, '#0a0a0a');

  // Draw locked grid
  drawGridBoard(ctx, board.grid, offsetX, offsetY, cellSize);

  // Draw border
  drawBorder(ctx, offsetX, offsetY, W, H, '#333');

  // Draw active piece + ghost
  const active = world.query('ActivePiece', 'Position');
  if (active.length > 0) {
    const eid = active[0];
    const pos = world.getComponent(eid, 'Position');
    const piece = world.getComponent(eid, 'ActivePiece');

    // Ghost piece
    const gy = ghostY(piece.shape, pos, board.grid, COLS, ROWS);
    if (gy !== pos.y) {
      const ghostCells = getAbsCells(piece.shape, { x: pos.x, y: gy });
      drawPieceCells(ctx, ghostCells, piece.color, offsetX, offsetY, cellSize, 0.25);
    }

    // Active piece
    const activeCells = getAbsCells(piece.shape, pos);
    drawPieceCells(ctx, activeCells, piece.color, offsetX, offsetY, cellSize, 1);
  }

  // HUD
  drawHUD(ctx, state, offsetX, W, offsetY, {
    fields: ['score', 'level', 'lines'],
    fontSize: 18,
    labels: { lines: 'Lines' },
  });

  // Next piece preview
  const nextRes = world.getResource('nextPiece');
  if (nextRes && nextRes.type) {
    const nextPiece = PIECES[nextRes.type];
    if (nextPiece) {
      const hudX = offsetX + W + 15;
      const hudY = offsetY + 120;
      drawPreview(ctx, nextPiece.shape, nextPiece.color, hudX, hudY, 20, 'Next');
    }
  }

  // Game over overlay
  if (state && state.gameOver) {
    drawGameOver(ctx, offsetX, offsetY, W, H, {
      title: 'GAME OVER',
      titleColor: '#ff4444',
      subtitle: `Score: ${state.score} | Press R to restart`,
    });
  }

  // Touch overlay (mobile)
  drawTouchOverlay(ctx, ctx.canvas.width, ctx.canvas.height, { tapLabel: 'ROT' });
});

export default game;
