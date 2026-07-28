// --- FREEPANG GAME LOGIC ---

// Configuration
const BOARD_ROWS = 8;
const BOARD_COLS = 8;
let TILE_SIZE = 56;
let GRID_GAP = 6;
const PADDING = 8;

function updateTileSizeConfig() {
  const width = window.innerWidth;
  if (width < 400) {
    TILE_SIZE = 34;
    GRID_GAP = 3;
  } else if (width < 560) {
    TILE_SIZE = 42;
    GRID_GAP = 4;
  } else {
    TILE_SIZE = 56;
    GRID_GAP = 6;
  }
}

const ANIMALS = [
  { char: '🐰', color: '#ff4081', name: '토끼' },
  { char: '🐱', color: '#ffb74d', name: '고양이' },
  { char: '🐶', color: '#81c784', name: '강아지' },
  { char: '🐵', color: '#ba68c8', name: '원숭이' },
  { char: '🐸', color: '#26a69a', name: '개구리' },
  { char: '🐼', color: '#cfd8dc', name: '판다' },
  { char: '🐷', color: '#ff8a80', name: '돼지' }
];

// Sound System (Web Audio API Synthesizer)
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playSound(type, combo = 0) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;

  try {
    const t = audioCtx.currentTime;
    if (type === 'click') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(t + 0.08);
    } else if (type === 'match') {
      // Scale frequency up based on combo
      const baseFreq = 261.63; // C4
      const semitones = combo * 2;
      const freq = baseFreq * Math.pow(1.059463, semitones);
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.setValueAtTime(freq * 1.5, t + 0.05); // Play a quick fifth
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(t + 0.3);
    } else if (type === 'ice') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1000, t);
      osc.frequency.exponentialRampToValueAtTime(3000, t + 0.15);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(t + 0.15);
    } else if (type === 'shuffle') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.linearRampToValueAtTime(400, t + 0.4);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(t + 0.4);
    } else if (type === 'win') {
      // Quick arpeggio
      const notes = [261.63, 329.63, 392.00, 523.25]; // C E G C
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);
        gain.gain.setValueAtTime(0.15, t + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t + idx * 0.08);
        osc.stop(t + idx * 0.08 + 0.25);
      });
    }
  } catch (error) {
    console.error("Audio Synthesis Error:", error);
  }
}

// Game State
let progress = {
  currentStage: 1,
  completedStages: {} // stageIdx: stars
};

let boardState = []; // 2D grid containing tile objects
let cellState = []; // 2D grid containing cell Div elements
let selectedTile = null;
let isAnimating = false;
let currentScore = 0;
let movesCount = 0;
let comboCount = 0;
let iceRemaining = 0;
let lastInputTime = Date.now();
let hintTimer = null;
let currentStageConfig = {};

// Load Save Data
function loadProgress() {
  const saved = localStorage.getItem('freepang_progress');
  if (saved) {
    try {
      progress = JSON.parse(saved);
      if (!progress.completedStages) progress.completedStages = {};
    } catch (e) {
      console.error(e);
    }
  }
}

function saveProgress() {
  localStorage.setItem('freepang_progress', JSON.stringify(progress));
}

// Procedural Stage Generator
function getStageConfig(stage) {
  // 1. Animal count progression:
  // Lv 1-10: 4 animals
  // Lv 11-30: 5 animals
  // Lv 31-100: 6 animals
  // Lv 101+: 7 animals
  let animalTypes = 4;
  if (stage > 10) animalTypes = 5;
  if (stage > 30) animalTypes = 6;
  if (stage > 100) animalTypes = 7;

  // 2. Goal score scales up smoothly
  const targetScore = 1000 + (stage - 1) * 300;

  // 3. Ice tiles progression (cells that must be cleared)
  let iceCount = 0;
  if (stage > 10) {
    if (stage <= 30) {
      iceCount = Math.min(10, stage - 10);
    } else if (stage <= 100) {
      iceCount = Math.min(24, 10 + Math.floor((stage - 30) * 0.2));
    } else {
      iceCount = Math.min(44, 24 + Math.floor((stage - 100) * 0.035));
    }
  }

  // 4. Stars threshold moves limits (zen rating guide)
  const movesFor3Stars = 12 + Math.floor(targetScore / 350);
  const movesFor2Stars = 22 + Math.floor(targetScore / 250);

  return {
    stage,
    animalTypes,
    targetScore,
    iceCount,
    movesFor3Stars,
    movesFor2Stars
  };
}

// Map Rendering coordinates
function getPosPx(index) {
  return index * (TILE_SIZE + GRID_GAP) + PADDING;
}

// Initialize Board (Avoiding matches on start)
function initBoard(config) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  boardState = [];

  // Generate target ice cell set
  const iceCells = new Set();
  if (config.iceCount > 0) {
    // Pick random cells, avoiding borders on early stages to be friendly
    const candidates = [];
    for (let r = 1; r < BOARD_ROWS - 1; r++) {
      for (let c = 1; c < BOARD_COLS - 1; c++) {
        candidates.push(`${r},${c}`);
      }
    }
    // Fallback if we need more cells
    if (candidates.length < config.iceCount) {
      for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
          if (!candidates.includes(`${r},${c}`)) candidates.push(`${r},${c}`);
        }
      }
    }
    // Shuffle candidates
    candidates.sort(() => Math.random() - 0.5);
    for (let i = 0; i < config.iceCount; i++) {
      iceCells.add(candidates[i]);
    }
  }

  iceRemaining = iceCells.size;

  // Create grid cells
  cellState = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    boardState[r] = [];
    cellState[r] = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      // Cell container
      const cellDiv = document.createElement('div');
      cellDiv.className = 'cell';
      cellDiv.style.position = 'absolute';
      cellDiv.style.width = `${TILE_SIZE}px`;
      cellDiv.style.height = `${TILE_SIZE}px`;
      cellDiv.style.left = `${getPosPx(c)}px`;
      cellDiv.style.top = `${getPosPx(r)}px`;

      // Ice layer if designated
      let hasIce = false;
      if (iceCells.has(`${r},${c}`)) {
        hasIce = true;
        const iceDiv = document.createElement('div');
        iceDiv.className = 'ice-overlay';
        cellDiv.appendChild(iceDiv);
      }

      boardEl.appendChild(cellDiv);
      cellState[r][c] = cellDiv;

      // Procedural generation of animals preventing immediate 3-match matches
      let animalIdx;
      do {
        animalIdx = Math.floor(Math.random() * config.animalTypes);
      } while (
        (c >= 2 && boardState[r][c-1].animalIdx === animalIdx && boardState[r][c-2].animalIdx === animalIdx) ||
        (r >= 2 && boardState[r-1][c].animalIdx === animalIdx && boardState[r-2][c].animalIdx === animalIdx)
      );

      // Create Animal Tile element
      const tileDiv = document.createElement('div');
      tileDiv.className = 'tile';
      tileDiv.innerText = ANIMALS[animalIdx].char;
      tileDiv.style.left = `${getPosPx(c)}px`;
      tileDiv.style.top = `${getPosPx(r)}px`;
      
      // Event bindings
      tileDiv.dataset.row = r;
      tileDiv.dataset.col = c;
      tileDiv.addEventListener('mousedown', onTileClick);

      boardEl.appendChild(tileDiv);

      boardState[r][c] = {
        r,
        c,
        animalIdx,
        hasIce,
        cellDiv,
        tileDiv
      };
    }
  }

  // Ensure there are possible moves initially
  if (!hasPossibleMoves()) {
    shuffleBoard(false);
  }
}

// Click and Swap Handler
function onTileClick(e) {
  if (isAnimating) return;
  initAudio();
  resetHintTimer();
  clearHints();

  const tileEl = e.currentTarget;
  const r = parseInt(tileEl.dataset.row);
  const c = parseInt(tileEl.dataset.col);
  const tile = boardState[r][c];

  playSound('click');

  if (!selectedTile) {
    // Select first tile
    selectedTile = tile;
    tile.tileDiv.classList.add('selected');
  } else {
    // Select second tile
    if (selectedTile === tile) {
      // Click same tile to deselect
      selectedTile.tileDiv.classList.remove('selected');
      selectedTile = null;
      return;
    }

    // Check adjacency
    const dist = Math.abs(selectedTile.r - tile.r) + Math.abs(selectedTile.c - tile.c);
    if (dist === 1) {
      // Swap tiles
      swapTiles(selectedTile, tile, true);
    } else {
      // Re-select another tile
      selectedTile.tileDiv.classList.remove('selected');
      selectedTile = tile;
      tile.tileDiv.classList.add('selected');
    }
  }
}

// Visual and Logical Swap
function swapTiles(tile1, tile2, revertOnNoMatch = true) {
  isAnimating = true;
  tile1.tileDiv.classList.remove('selected');
  selectedTile = null;

  // Swap position values in DOM
  const t1Left = tile1.tileDiv.style.left;
  const t1Top = tile1.tileDiv.style.top;
  
  tile1.tileDiv.style.left = tile2.tileDiv.style.left;
  tile1.tileDiv.style.top = tile2.tileDiv.style.top;
  
  tile2.tileDiv.style.left = t1Left;
  tile2.tileDiv.style.top = t1Top;

  // Swap logical rows/cols in elements
  tile1.tileDiv.dataset.row = tile2.r;
  tile1.tileDiv.dataset.col = tile2.c;
  
  tile2.tileDiv.dataset.row = tile1.r;
  tile2.tileDiv.dataset.col = tile1.c;

  // Swap grid array mapping
  const r1 = tile1.r, c1 = tile1.c;
  const r2 = tile2.r, c2 = tile2.c;

  boardState[r1][c1] = tile2;
  boardState[r2][c2] = tile1;

  tile1.r = r2; tile1.c = c2;
  tile2.r = r1; tile2.c = c1;

  setTimeout(() => {
    // Validate match
    const matches = findMatches();
    if (matches.size > 0) {
      // Match found! Commit move and pop
      movesCount++;
      comboCount = 0;
      updateHUD();
      processMatchList(matches);
    } else {
      if (revertOnNoMatch) {
        // No match: swap back
        swapTiles(tile1, tile2, false);
      } else {
        isAnimating = false;
      }
    }
  }, 200);
}

// Match-3 Scanner (Finds all matched coordinates)
function findMatches() {
  const matchedCoords = new Set();

  // 1. Horizontal check
  for (let r = 0; r < BOARD_ROWS; r++) {
    let matchLen = 1;
    for (let c = 0; c < BOARD_COLS; c++) {
      let isMatch = false;
      if (c < BOARD_COLS - 1) {
        if (boardState[r][c].animalIdx === boardState[r][c+1].animalIdx) {
          matchLen++;
          isMatch = true;
        }
      }
      if (!isMatch || c === BOARD_COLS - 1) {
        if (matchLen >= 3) {
          for (let colIdx = c - matchLen + 1; colIdx <= c; colIdx++) {
            matchedCoords.add(`${r},${colIdx}`);
          }
        }
        matchLen = 1;
      }
    }
  }

  // 2. Vertical check
  for (let c = 0; c < BOARD_COLS; c++) {
    let matchLen = 1;
    for (let r = 0; r < BOARD_ROWS; r++) {
      let isMatch = false;
      if (r < BOARD_ROWS - 1) {
        if (boardState[r][c].animalIdx === boardState[r+1][c].animalIdx) {
          matchLen++;
          isMatch = true;
        }
      }
      if (!isMatch || r === BOARD_ROWS - 1) {
        if (matchLen >= 3) {
          for (let rowIdx = r - matchLen + 1; rowIdx <= r; rowIdx++) {
            matchedCoords.add(`${rowIdx},${c}`);
          }
        }
        matchLen = 1;
      }
    }
  }

  return matchedCoords;
}

// Process popped tiles
function processMatchList(matchedSet) {
  playSound('match', comboCount);

  let poppedScore = 0;

  // Render combo pop
  if (comboCount > 0) {
    // Find approximate center of pops to spawn combo popup
    let sumX = 0, sumY = 0;
    matchedSet.forEach(coord => {
      const [r, c] = coord.split(',').map(Number);
      sumX += getPosPx(c) + TILE_SIZE / 2;
      sumY += getPosPx(r) + TILE_SIZE / 2;
    });
    spawnComboText(sumX / matchedSet.size, sumY / matchedSet.size, `${comboCount} 콤보!`);
  }

  matchedSet.forEach(coord => {
    const [r, c] = coord.split(',').map(Number);
    const tile = boardState[r][c];

    poppedScore += 100 * (1 + comboCount * 0.5);

    // Spawn cute particles
    spawnParticles(getPosPx(c) + TILE_SIZE/2, getPosPx(r) + TILE_SIZE/2, ANIMALS[tile.animalIdx].color);

    // Crack ice if it sits on ice
    if (tile.hasIce) {
      tile.hasIce = false;
      playSound('ice');
      const iceEl = tile.cellDiv.querySelector('.ice-overlay');
      if (iceEl) {
        spawnIceParticles(getPosPx(c) + TILE_SIZE/2, getPosPx(r) + TILE_SIZE/2);
        iceEl.style.transform = 'scale(1.2)';
        iceEl.style.opacity = '0';
        setTimeout(() => iceEl.remove(), 300);
      }
      iceRemaining--;
    }

    // Delete tile animation
    tile.tileDiv.classList.add('matched');
    tile.tileDiv.style.transform = 'scale(0)';
    setTimeout(() => {
      tile.tileDiv.remove();
    }, 200);

    boardState[r][c] = null;
  });

  currentScore += Math.floor(poppedScore);
  updateHUD();

  setTimeout(() => {
    dropTilesAndFill();
  }, 220);
}

// Falling & Respawn Logic
function dropTilesAndFill() {
  const boardEl = document.getElementById('board');
  const dropDurations = [];

  // Drop existing tiles column by column
  for (let c = 0; c < BOARD_COLS; c++) {
    let emptySpaces = 0;
    for (let r = BOARD_ROWS - 1; r >= 0; r--) {
      if (boardState[r][c] === null) {
        emptySpaces++;
      } else if (emptySpaces > 0) {
        // Slide tile down logically and visually
        const tile = boardState[r][c];
        const newR = r + emptySpaces;

        boardState[newR][c] = tile;
        boardState[r][c] = null;

        tile.r = newR;
        tile.tileDiv.dataset.row = newR;
        tile.tileDiv.style.top = `${getPosPx(newR)}px`;

        dropDurations.push(200);
      }
    }

    // Spawn new tiles at the top
    for (let i = 0; i < emptySpaces; i++) {
      const animalIdx = Math.floor(Math.random() * currentStageConfig.animalTypes);
      const spawnR = -1 - i; // start off-screen
      const targetR = emptySpaces - 1 - i;

      const tileDiv = document.createElement('div');
      tileDiv.className = 'tile';
      tileDiv.innerText = ANIMALS[animalIdx].char;
      tileDiv.style.left = `${getPosPx(c)}px`;
      tileDiv.style.top = `${getPosPx(spawnR)}px`;
      tileDiv.dataset.row = targetR;
      tileDiv.dataset.col = c;
      tileDiv.addEventListener('mousedown', onTileClick);

      boardEl.appendChild(tileDiv);

      const tile = {
        r: targetR,
        c,
        animalIdx,
        hasIce: false,
        cellDiv: cellState[targetR][c],
        tileDiv
      };

      boardState[targetR][c] = tile;

      // Animate sliding down
      setTimeout(() => {
        tileDiv.style.top = `${getPosPx(targetR)}px`;
      }, 20);

      dropDurations.push(220);
    }
  }

  const maxWait = dropDurations.length > 0 ? Math.max(...dropDurations) : 100;

  setTimeout(() => {
    // Check cascade matches
    const newMatches = findMatches();
    if (newMatches.size > 0) {
      comboCount++;
      processMatchList(newMatches);
    } else {
      // Loop finished: verify next state
      isAnimating = false;
      checkStageComplete();
      
      // Auto-shuffle deadlock check
      if (!hasPossibleMoves() && !isStageCleared()) {
        setTimeout(() => shuffleBoard(true), 300);
      }

      resetHintTimer();
    }
  }, maxWait + 20);
}

// Deadlock Detector
function hasPossibleMoves() {
  // Test all swaps (horizontal & vertical)
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const tile = boardState[r][c];
      if (!tile) continue;

      // Test Right Swap
      if (c < BOARD_COLS - 1) {
        const rightTile = boardState[r][c+1];
        if (rightTile) {
          if (testSwapCreatesMatch(tile, rightTile)) return true;
        }
      }
      // Test Down Swap
      if (r < BOARD_ROWS - 1) {
        const downTile = boardState[r+1][c];
        if (downTile) {
          if (testSwapCreatesMatch(tile, downTile)) return true;
        }
      }
    }
  }
  return false;
}

// Helper to simulate match check
function testSwapCreatesMatch(tile1, tile2) {
  const r1 = tile1.r, c1 = tile1.c;
  const r2 = tile2.r, c2 = tile2.c;

  // Logical Swap
  boardState[r1][c1] = tile2;
  boardState[r2][c2] = tile1;

  const matches = findMatches();

  // Swap Back
  boardState[r1][c1] = tile1;
  boardState[r2][c2] = tile2;

  return matches.size > 0;
}

// Auto-shuffle board
function shuffleBoard(animated = true) {
  if (isAnimating) return;
  isAnimating = true;
  clearHints();

  if (animated) {
    playSound('shuffle');
    addSystemLog("더 이상 이동할 수 없어 퍼즐판을 섞습니다!");
  }

  const boardEl = document.getElementById('board');
  const allTiles = [];

  // Collect all animal indices
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      allTiles.push(boardState[r][c].animalIdx);
    }
  }

  // Shuffle until we have possible moves and no initial matches
  let validShuffle = false;
  let attempts = 0;
  
  while (!validShuffle && attempts < 100) {
    attempts++;
    // Shuffle the indices list
    allTiles.sort(() => Math.random() - 0.5);

    // Map back temporarily to test matches
    let idx = 0;
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        boardState[r][c].animalIdx = allTiles[idx++];
      }
    }

    // Check if shuffle created any starting match
    const initialMatches = findMatches();
    if (initialMatches.size === 0 && hasPossibleMoves()) {
      validShuffle = true;
    }
  }

  // Visual update with animations
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const tile = boardState[r][c];
      tile.tileDiv.innerText = ANIMALS[tile.animalIdx].char;
      
      if (animated) {
        tile.tileDiv.style.transform = 'scale(0.2) rotate(360deg)';
        setTimeout(() => {
          tile.tileDiv.style.transform = 'scale(1) rotate(0deg)';
        }, r * 20 + c * 20);
      }
    }
  }

  setTimeout(() => {
    isAnimating = false;
    resetHintTimer();
  }, 600);
}

// Hint System
function resetHintTimer() {
  if (hintTimer) clearTimeout(hintTimer);
  lastInputTime = Date.now();
  hintTimer = setTimeout(showHint, 6000); // Trigger hint if idle for 6 seconds
}

function showHint() {
  if (isAnimating) return;

  // Search for the first possible move that yields a match
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const tile = boardState[r][c];
      if (!tile) continue;

      // Check Right
      if (c < BOARD_COLS - 1) {
        const target = boardState[r][c+1];
        if (target && testSwapCreatesMatch(tile, target)) {
          highlightHint(tile, target);
          return;
        }
      }
      // Check Down
      if (r < BOARD_ROWS - 1) {
        const target = boardState[r+1][c];
        if (target && testSwapCreatesMatch(tile, target)) {
          highlightHint(tile, target);
          return;
        }
      }
    }
  }
}

function highlightHint(tile1, tile2) {
  tile1.tileDiv.classList.add('hint');
  tile2.tileDiv.classList.add('hint');
}

function clearHints() {
  document.querySelectorAll('.tile.hint').forEach(el => el.classList.remove('hint'));
}

// Stage Progression Check
function isStageCleared() {
  return currentScore >= currentStageConfig.targetScore && iceRemaining <= 0;
}

function checkStageComplete() {
  if (isStageCleared()) {
    isAnimating = true;
    playSound('win');

    // Calculate stars rating
    let stars = 1;
    if (movesCount <= currentStageConfig.movesFor3Stars) {
      stars = 3;
    } else if (movesCount <= currentStageConfig.movesFor2Stars) {
      stars = 2;
    }

    // Save completed stage
    const prevStars = progress.completedStages[currentStageConfig.stage] || 0;
    if (stars > prevStars) {
      progress.completedStages[currentStageConfig.stage] = stars;
    }

    // Unlock next stage
    if (currentStageConfig.stage === progress.currentStage && progress.currentStage < 1000) {
      progress.currentStage++;
    }

    saveProgress();

    setTimeout(() => {
      showVictoryModal(stars);
    }, 400);
  }
}

// Particle generator helper (Confetti-like pops)
function spawnParticles(x, y, color) {
  const container = document.getElementById('board-outer');
  const pCount = 8;
  for (let i = 0; i < pCount; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.backgroundColor = color;
    p.style.width = `${Math.random() * 8 + 6}px`;
    p.style.height = p.style.width;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;

    // Angle and speed
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 60 + 40;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;

    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--dy', `${dy}px`);

    container.appendChild(p);
    setTimeout(() => p.remove(), 600);
  }
}

// Ice flying particles
function spawnIceParticles(x, y) {
  const container = document.getElementById('board-outer');
  const pCount = 6;
  for (let i = 0; i < pCount; i++) {
    const p = document.createElement('div');
    p.className = 'ice-particle';
    p.style.width = `${Math.random() * 10 + 4}px`;
    p.style.height = `${Math.random() * 6 + 4}px`;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;

    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 50 + 30;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;

    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--dy', `${dy}px`);

    container.appendChild(p);
    setTimeout(() => p.remove(), 500);
  }
}

// floating combo/score popup text
function spawnComboText(x, y, text) {
  const container = document.getElementById('board-outer');
  const popup = document.createElement('div');
  popup.className = 'combo-popup';
  popup.innerText = text;
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;

  container.appendChild(popup);
  setTimeout(() => popup.remove(), 800);
}

// UI Updating HUD
function updateHUD() {
  document.getElementById('stage-num').innerText = `STAGE ${currentStageConfig.stage}`;
  document.getElementById('score-val').innerText = currentScore.toLocaleString();
  document.getElementById('target-val').innerText = `목표: ${currentStageConfig.targetScore.toLocaleString()}`;
  document.getElementById('moves-val').innerText = movesCount;

  // Ice count visibility
  const iceStatusDiv = document.getElementById('ice-status-div');
  if (currentStageConfig.iceCount > 0) {
    iceStatusDiv.style.display = 'block';
    document.getElementById('ice-val').innerText = iceRemaining;
  } else {
    iceStatusDiv.style.display = 'none';
  }

  // Progress Bar
  const scorePct = Math.min(100, (currentScore / currentStageConfig.targetScore) * 100);
  document.getElementById('progress-bar').style.width = `${scorePct}%`;

  // HUD Stars representation
  const hudStars = document.querySelectorAll('.hud-panel .star');
  hudStars.forEach(s => s.classList.remove('active'));

  if (movesCount <= currentStageConfig.movesFor3Stars) {
    hudStars[0].classList.add('active');
    hudStars[1].classList.add('active');
    hudStars[2].classList.add('active');
  } else if (movesCount <= currentStageConfig.movesFor2Stars) {
    hudStars[0].classList.add('active');
    hudStars[1].classList.add('active');
  } else {
    hudStars[0].classList.add('active');
  }
}

// System Log Console
function addSystemLog(text) {
  console.log(`[프리팡 LOG] ${text}`);
}

// Modals Trigger Handlers
function openStageSelectModal() {
  playSound('click');
  const modal = document.getElementById('stage-modal');
  const grid = document.getElementById('stage-grid');
  grid.innerHTML = '';

  // Generate 1000 stage buttons
  for (let s = 1; s <= 1000; s++) {
    const btn = document.createElement('button');
    btn.className = 'stage-btn';
    
    // Check if unlocked
    const isUnlocked = s <= progress.currentStage;
    if (!isUnlocked) {
      btn.classList.add('locked');
      btn.innerHTML = `<div>${s}</div><div style="font-size:10px;">🔒</div>`;
    } else {
      const stars = progress.completedStages[s] || 0;
      let starStr = '';
      if (stars > 0) {
        starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      }
      btn.innerHTML = `<div>${s}</div><div class="stars-sub">${starStr}</div>`;
      btn.onclick = () => {
        closeModal('stage-modal');
        loadStage(s);
      };
    }
    grid.appendChild(btn);
  }

  modal.classList.add('active');
}

function showVictoryModal(stars) {
  const modal = document.getElementById('victory-modal');
  document.getElementById('vic-stage').innerText = `STAGE ${currentStageConfig.stage} 완료!`;
  
  const starsDiv = document.getElementById('vic-stars');
  starsDiv.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const starSpan = document.createElement('span');
    starSpan.className = 'star active';
    starSpan.style.fontSize = '36px';
    starSpan.innerText = i < stars ? '★' : '☆';
    if (i >= stars) starSpan.classList.remove('active');
    starsDiv.appendChild(starSpan);
  }

  modal.classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Load Stage Core
function loadStage(stageNum) {
  updateTileSizeConfig();
  currentScore = 0;
  movesCount = 0;
  comboCount = 0;
  selectedTile = null;
  isAnimating = false;
  
  currentStageConfig = getStageConfig(stageNum);
  
  initBoard(currentStageConfig);
  updateHUD();
  resetHintTimer();
}

function nextStage() {
  closeModal('victory-modal');
  const next = currentStageConfig.stage + 1;
  if (next <= 1000) {
    loadStage(next);
  }
}

function restartStage() {
  playSound('click');
  loadStage(currentStageConfig.stage);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  playSound('click');
  const btn = document.getElementById('btn-sound');
  btn.innerText = soundEnabled ? '🔊 사운드 ON' : '🔇 사운드 OFF';
}

function triggerManualHint() {
  playSound('click');
  clearHints();
  showHint();
}

// Entrypoint
window.onload = function() {
  loadProgress();
  // Default load current unlocked stage
  loadStage(progress.currentStage);

  // Setup click triggers for close buttons
  document.getElementById('btn-sound').onclick = toggleSound;
  document.getElementById('btn-restart').onclick = restartStage;
  document.getElementById('btn-stages').onclick = openStageSelectModal;
  document.getElementById('btn-hint').onclick = triggerManualHint;

  // Keyboard listeners bypass
  window.addEventListener('mousedown', () => {
    initAudio();
  });

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('FreePang PWA Service Worker Registered', reg.scope))
      .catch(err => console.error('Service Worker registration failed', err));
  }
};
