// engine-ecs:../ecs/index.js
var World = class {
  constructor() {
    this.nextEntityId = 0;
    this.entities = /* @__PURE__ */ new Set();
    this.components = /* @__PURE__ */ new Map();
    this.systems = [];
    this.resources = /* @__PURE__ */ new Map();
    this.events = [];
    this.running = true;
  }
  // --- Entities ---
  createEntity() {
    const id = this.nextEntityId++;
    this.entities.add(id);
    return id;
  }
  destroyEntity(id) {
    this.entities.delete(id);
    for (const store of this.components.values()) {
      store.delete(id);
    }
  }
  // --- Components ---
  registerComponent(name) {
    if (!this.components.has(name)) {
      this.components.set(name, /* @__PURE__ */ new Map());
    }
  }
  addComponent(entityId, name, data = {}) {
    if (!this.components.has(name)) {
      this.registerComponent(name);
    }
    this.components.get(name).set(entityId, data);
    return this;
  }
  getComponent(entityId, name) {
    const store = this.components.get(name);
    return store ? store.get(entityId) : void 0;
  }
  hasComponent(entityId, name) {
    const store = this.components.get(name);
    return store ? store.has(entityId) : false;
  }
  removeComponent(entityId, name) {
    const store = this.components.get(name);
    if (store) store.delete(entityId);
  }
  // --- Queries ---
  query(...componentNames) {
    const results = [];
    for (const entityId of this.entities) {
      let match = true;
      for (const name of componentNames) {
        if (!this.hasComponent(entityId, name)) {
          match = false;
          break;
        }
      }
      if (match) results.push(entityId);
    }
    return results;
  }
  // --- Resources (global singletons) ---
  setResource(name, data) {
    this.resources.set(name, data);
  }
  getResource(name) {
    return this.resources.get(name);
  }
  // --- Events ---
  emit(type, data = {}) {
    this.events.push({ type, data });
  }
  getEvents(type) {
    return this.events.filter((e) => e.type === type);
  }
  clearEvents() {
    this.events.length = 0;
  }
  // --- Systems ---
  addSystem(name, fn, priority = 0) {
    this.systems.push({ name, fn, priority });
    this.systems.sort((a, b) => a.priority - b.priority);
  }
  tick(dt) {
    for (const system of this.systems) {
      system.fn(this, dt);
    }
    this.clearEvents();
  }
};

// engine:@engine/core
function defineGame(config) {
  const components = {};
  const entities = [];
  const resources = {};
  const systems = [];
  const builder = {
    /** Register a component type with default values. */
    component(name, defaults = {}) {
      components[name] = defaults;
      return builder;
    },
    /** Spawn an entity with the given components. */
    spawn(name, componentData) {
      entities.push({ name, components: componentData });
      return builder;
    },
    /** Register a global resource. */
    resource(name, data) {
      resources[name] = data;
      return builder;
    },
    /** Add a system function. Systems run in registration order. */
    system(name, fn) {
      systems.push({ name, fn });
      return builder;
    },
    /** Compile into a running ECS World with canvas. */
    compile(canvas) {
      const world = new World();
      const display = config.display;
      if (display.type === "grid") {
        const grid = [];
        for (let r = 0; r < display.height; r++) {
          grid.push(new Array(display.width).fill(null));
        }
        world.setResource("_board", {
          cols: display.width,
          rows: display.height,
          grid
        });
      }
      for (const [name, data] of Object.entries(resources)) {
        world.setResource(name, JSON.parse(JSON.stringify(data)));
      }
      if (config.input) {
        const input = {};
        for (const action of Object.keys(config.input)) {
          input[action] = false;
        }
        world.setResource("input", input);
      }
      if (config.timing) {
        world.setResource("_tickRate", config.timing.tickRate);
      }
      if (canvas) {
        const cellSize = display.cellSize || 30;
        const ctx = canvas.getContext("2d");
        canvas.width = display.width * cellSize + 180;
        canvas.height = display.height * cellSize + 20;
        world.setResource("renderer", { ctx, cellSize, offsetX: 10, offsetY: 10 });
      }
      for (const name of Object.keys(components)) {
        world.registerComponent(name);
      }
      for (const entity of entities) {
        const eid = world.createEntity();
        for (const [compName, compData] of Object.entries(entity.components)) {
          world.addComponent(eid, compName, JSON.parse(JSON.stringify(compData)));
        }
      }
      for (let i = 0; i < systems.length; i++) {
        world.addSystem(systems[i].name, systems[i].fn, i);
      }
      world.setResource("_config", config);
      world.setResource("_components", components);
      return world;
    },
    /** Compile and start the game loop with keyboard wiring. */
    start(canvas) {
      const world = builder.compile(canvas);
      if (config.input) {
        const input = world.getResource("input");
        const keyToAction = {};
        for (const [action, keys] of Object.entries(config.input)) {
          const keyList = Array.isArray(keys) ? keys : keys.keys || [keys];
          for (const key of keyList) {
            keyToAction[key] = action;
          }
        }
        document.addEventListener("keydown", (e) => {
          const action = keyToAction[e.key];
          if (action) {
            e.preventDefault();
            if (action === "restart") {
              const board = world.getResource("_board");
              if (board) {
                for (let r = 0; r < board.rows; r++) board.grid[r].fill(null);
              }
              const state = world.getResource("state");
              if (state && resources.state) {
                Object.assign(state, JSON.parse(JSON.stringify(resources.state)));
              }
              return;
            }
            input[action] = true;
          }
        });
      }
      let last = performance.now();
      function loop(now) {
        const dt = now - last;
        last = now;
        world.tick(dt);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
      return world;
    },
    /** Expose config for introspection. */
    getConfig() {
      return config;
    },
    getSystems() {
      return systems;
    },
    getResources() {
      return resources;
    },
    getComponents() {
      return components;
    },
    getEntities() {
      return entities;
    }
  };
  return builder;
}

// engine:@engine/input
function consumeAction(input, action) {
  if (input[action]) {
    input[action] = false;
    return true;
  }
  return false;
}

// engine:@engine/grid
function rotateShape(shape, times = 1) {
  let s = shape;
  for (let i = 0; i < times % 4; i++) {
    s = s.map(([x, y]) => [-y, x]);
  }
  return s;
}
function getAbsCells(shape, pos) {
  return shape.map(([sx, sy]) => [pos.x + sx, pos.y + sy]);
}
function collides(grid, cells, cols, rows) {
  for (const [x, y] of cells) {
    if (x < 0 || x >= cols || y >= rows) return true;
    if (y < 0) continue;
    if (grid[y][x] !== null) return true;
  }
  return false;
}
function lockCells(grid, cells, color) {
  for (const [x, y] of cells) {
    if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
      grid[y][x] = color;
    }
  }
}
function clearLines(grid, cols) {
  let cleared = 0;
  for (let r = grid.length - 1; r >= 0; r--) {
    if (grid[r].every((cell) => cell !== null)) {
      grid.splice(r, 1);
      grid.unshift(new Array(cols).fill(null));
      cleared++;
      r++;
    }
  }
  return cleared;
}
function ghostY(shape, pos, grid, cols, rows) {
  let y = pos.y;
  while (!collides(grid, getAbsCells(shape, { x: pos.x, y: y + 1 }), cols, rows)) {
    y++;
  }
  return y;
}

// engine:@engine/render
function drawHUD(ctx, state, offsetX, gridWidth, offsetY, opts = {}) {
  const {
    fields = ["score"],
    fontSize = 18,
    labels = {},
    color = "#fff"
  } = opts;
  const hudX = offsetX + gridWidth + 15;
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  let y = offsetY + 30;
  for (const field of fields) {
    const label = labels[field] || field.charAt(0).toUpperCase() + field.slice(1);
    const value = state[field] !== void 0 ? state[field] : "\u2014";
    ctx.fillText(`${label}: ${value}`, hudX, y);
    y += fontSize + 8;
  }
}
function drawGameOver(ctx, offsetX, offsetY, W, H, opts = {}) {
  const {
    title = "GAME OVER",
    titleColor = "#ff4444",
    subtitle
  } = opts;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(offsetX, offsetY, W, H);
  ctx.fillStyle = titleColor;
  ctx.font = "bold 36px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, offsetX + W / 2, offsetY + H / 2 - 20);
  if (subtitle) {
    ctx.fillStyle = "#fff";
    ctx.font = "18px monospace";
    ctx.fillText(subtitle, offsetX + W / 2, offsetY + H / 2 + 20);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
function clearCanvas(ctx, bgColor = "#111") {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function drawBorder(ctx, offsetX, offsetY, W, H, color = "#444") {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, W, H);
}
function drawCell(ctx, offsetX, offsetY, cellSize, gx, gy, color, borderColor = null) {
  const px = offsetX + gx * cellSize;
  const py = offsetY + gy * cellSize;
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
  }
}
function drawGridBoard(ctx, grid, offsetX, offsetY, cellSize, opts = {}) {
  const { emptyColor = "#111", gridLineColor = "#222" } = opts;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const color = grid[r][c];
      const px = offsetX + c * cellSize;
      const py = offsetY + r * cellSize;
      ctx.fillStyle = color || emptyColor;
      ctx.fillRect(px, py, cellSize, cellSize);
      if (gridLineColor) {
        ctx.strokeStyle = gridLineColor;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, cellSize, cellSize);
      }
    }
  }
}
function drawPieceCells(ctx, cells, color, offsetX, offsetY, cellSize, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (const [x, y] of cells) {
    if (y < 0) continue;
    drawCell(ctx, offsetX, offsetY, cellSize, x, y, color, "rgba(255,255,255,0.2)");
  }
  ctx.globalAlpha = 1;
}
function drawPreview(ctx, shape, color, hudX, hudY, previewCellSize, label = "Next") {
  ctx.fillStyle = "#fff";
  ctx.font = "16px monospace";
  ctx.textAlign = "left";
  ctx.fillText(label, hudX, hudY);
  const minX = Math.min(...shape.map(([x]) => x));
  const maxX = Math.max(...shape.map(([x]) => x));
  const minY = Math.min(...shape.map(([, y]) => y));
  const maxY = Math.max(...shape.map(([, y]) => y));
  const shapeW = maxX - minX + 1;
  const shapeH = maxY - minY + 1;
  const bx = hudX + (4 * previewCellSize - shapeW * previewCellSize) / 2;
  const by = hudY + 10 + (4 * previewCellSize - shapeH * previewCellSize) / 2;
  for (const [x, y] of shape) {
    const cx = bx + (x - minX) * previewCellSize;
    const cy = by + (y - minY) * previewCellSize;
    ctx.fillStyle = color;
    ctx.fillRect(cx + 1, cy + 1, previewCellSize - 2, previewCellSize - 2);
  }
}

// ../../../virtual/game.js
var COLS = 10;
var ROWS = 20;
var CELL_SIZE = 30;
var PIECES = {
  I: { shape: [[-1, 0], [0, 0], [1, 0], [2, 0]], color: "#00FFFF" },
  O: { shape: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#FFFF00" },
  T: { shape: [[-1, 0], [0, 0], [1, 0], [0, -1]], color: "#AA00FF" },
  S: { shape: [[-1, 0], [0, 0], [0, -1], [1, -1]], color: "#00FF00" },
  Z: { shape: [[-1, -1], [0, -1], [0, 0], [1, 0]], color: "#FF0000" },
  L: { shape: [[-1, 0], [0, 0], [1, 0], [1, -1]], color: "#FF8800" },
  J: { shape: [[-1, -1], [-1, 0], [0, 0], [1, 0]], color: "#0044FF" }
};
var PIECE_NAMES = Object.keys(PIECES);
var LINE_SCORES = [0, 100, 300, 500, 800];
var game = defineGame({
  display: {
    type: "grid",
    width: COLS,
    height: ROWS,
    cellSize: CELL_SIZE,
    background: "#0a0a0a"
  },
  input: {
    left: { keys: ["ArrowLeft", "a"] },
    right: { keys: ["ArrowRight", "d"] },
    down: { keys: ["ArrowDown", "s"] },
    rotate: { keys: ["ArrowUp", "w"] },
    hardDrop: { keys: [" "] },
    restart: { keys: ["r", "R"] }
  },
  timing: {
    tickRate: 1e3
  }
});
game.component("ActivePiece", {
  shape: [],
  color: "#fff",
  type: "",
  rotation: 0
});
game.component("Position", { x: 0, y: 0 });
game.resource("state", {
  score: 0,
  level: 1,
  lines: 0,
  gameOver: false
});
game.resource("nextPiece", { type: "" });
game.resource("_gravity", { elapsed: 0 });
function randomPieceType() {
  return PIECE_NAMES[Math.floor(Math.random() * PIECE_NAMES.length)];
}
function getTickInterval(level) {
  return Math.max(100, 1e3 - (level - 1) * 80);
}
game.system("spawn", function spawnSystem(world, _dt) {
  const active = world.query("ActivePiece", "Position");
  if (active.length > 0) return;
  const state = world.getResource("state");
  if (state.gameOver) return;
  let nextRes = world.getResource("nextPiece");
  let pieceType;
  if (!nextRes.type) {
    pieceType = randomPieceType();
    nextRes.type = randomPieceType();
  } else {
    pieceType = nextRes.type;
    nextRes.type = randomPieceType();
  }
  const piece = PIECES[pieceType];
  const spawnX = Math.floor(COLS / 2);
  const spawnY = 0;
  const board = world.getResource("_board");
  const cells = getAbsCells(piece.shape, { x: spawnX, y: spawnY });
  if (collides(board.grid, cells, COLS, ROWS)) {
    state.gameOver = true;
    return;
  }
  const eid = world.createEntity();
  world.addComponent(eid, "Position", { x: spawnX, y: spawnY });
  world.addComponent(eid, "ActivePiece", {
    shape: piece.shape.map((c) => [...c]),
    color: piece.color,
    type: pieceType,
    rotation: 0
  });
  const gravity = world.getResource("_gravity");
  gravity.elapsed = 0;
});
game.system("input", function inputSystem(world, _dt) {
  const state = world.getResource("state");
  if (state.gameOver) return;
  const input = world.getResource("input");
  const active = world.query("ActivePiece", "Position");
  if (active.length === 0) return;
  const eid = active[0];
  const pos = world.getComponent(eid, "Position");
  const piece = world.getComponent(eid, "ActivePiece");
  const board = world.getResource("_board");
  if (consumeAction(input, "left")) {
    const cells = getAbsCells(piece.shape, { x: pos.x - 1, y: pos.y });
    if (!collides(board.grid, cells, COLS, ROWS)) {
      pos.x -= 1;
    }
  }
  if (consumeAction(input, "right")) {
    const cells = getAbsCells(piece.shape, { x: pos.x + 1, y: pos.y });
    if (!collides(board.grid, cells, COLS, ROWS)) {
      pos.x += 1;
    }
  }
  if (consumeAction(input, "down")) {
    const cells = getAbsCells(piece.shape, { x: pos.x, y: pos.y + 1 });
    if (!collides(board.grid, cells, COLS, ROWS)) {
      pos.y += 1;
    }
  }
  if (consumeAction(input, "rotate")) {
    const rotated = rotateShape(piece.shape, 1);
    const kicks = [0, -1, 1, -2, 2];
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
  if (consumeAction(input, "hardDrop")) {
    const dropY = ghostY(piece.shape, pos, board.grid, COLS, ROWS);
    state.score += (dropY - pos.y) * 2;
    pos.y = dropY;
    lockPiece(world, eid);
  }
});
game.system("gravity", function gravitySystem(world, dt) {
  const state = world.getResource("state");
  if (state.gameOver) return;
  const active = world.query("ActivePiece", "Position");
  if (active.length === 0) return;
  const gravity = world.getResource("_gravity");
  gravity.elapsed += dt;
  const interval = getTickInterval(state.level);
  if (gravity.elapsed < interval) return;
  gravity.elapsed -= interval;
  const eid = active[0];
  const pos = world.getComponent(eid, "Position");
  const piece = world.getComponent(eid, "ActivePiece");
  const board = world.getResource("_board");
  const cells = getAbsCells(piece.shape, { x: pos.x, y: pos.y + 1 });
  if (!collides(board.grid, cells, COLS, ROWS)) {
    pos.y += 1;
  } else {
    lockPiece(world, eid);
  }
});
function lockPiece(world, eid) {
  const pos = world.getComponent(eid, "Position");
  const piece = world.getComponent(eid, "ActivePiece");
  const board = world.getResource("_board");
  const state = world.getResource("state");
  const cells = getAbsCells(piece.shape, pos);
  lockCells(board.grid, cells, piece.color);
  world.destroyEntity(eid);
  const linesCleared = clearLines(board.grid, COLS);
  if (linesCleared > 0) {
    state.lines += linesCleared;
    state.score += LINE_SCORES[Math.min(linesCleared, 4)] * state.level;
    world.emit("linesCleared", { count: linesCleared });
    const newLevel = Math.floor(state.lines / 10) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      world.emit("levelUp", { level: newLevel });
    }
  }
  world.emit("pieceLocked");
}
game.system("render", function renderSystem(world, _dt) {
  const renderer = world.getResource("renderer");
  if (!renderer) return;
  const { ctx, cellSize, offsetX, offsetY } = renderer;
  const state = world.getResource("state");
  const board = world.getResource("_board");
  const W = COLS * cellSize;
  const H = ROWS * cellSize;
  clearCanvas(ctx, "#0a0a0a");
  drawGridBoard(ctx, board.grid, offsetX, offsetY, cellSize);
  drawBorder(ctx, offsetX, offsetY, W, H, "#333");
  const active = world.query("ActivePiece", "Position");
  if (active.length > 0) {
    const eid = active[0];
    const pos = world.getComponent(eid, "Position");
    const piece = world.getComponent(eid, "ActivePiece");
    const gy = ghostY(piece.shape, pos, board.grid, COLS, ROWS);
    if (gy !== pos.y) {
      const ghostCells = getAbsCells(piece.shape, { x: pos.x, y: gy });
      drawPieceCells(ctx, ghostCells, piece.color, offsetX, offsetY, cellSize, 0.25);
    }
    const activeCells = getAbsCells(piece.shape, pos);
    drawPieceCells(ctx, activeCells, piece.color, offsetX, offsetY, cellSize, 1);
  }
  drawHUD(ctx, state, offsetX, W, offsetY, {
    fields: ["score", "level", "lines"],
    fontSize: 18,
    labels: { lines: "Lines" }
  });
  const nextRes = world.getResource("nextPiece");
  if (nextRes && nextRes.type) {
    const nextPiece = PIECES[nextRes.type];
    if (nextPiece) {
      const hudX = offsetX + W + 15;
      const hudY = offsetY + 120;
      drawPreview(ctx, nextPiece.shape, nextPiece.color, hudX, hudY, 20, "Next");
    }
  }
  if (state && state.gameOver) {
    drawGameOver(ctx, offsetX, offsetY, W, H, {
      title: "GAME OVER",
      titleColor: "#ff4444",
      subtitle: `Score: ${state.score} | Press R to restart`
    });
  }
});
var game_default = game;
export {
  game_default as default
};
