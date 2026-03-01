(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  // --- Constants ---
  var CARD_W = 72, CARD_H = 100, CARD_R = 6;
  var CASCADE_DY = 22;
  var TOP_Y = 16, TOP_GAP = 12;
  var TAB_Y = TOP_Y + CARD_H + 20;
  var SUITS = ['\u2663', '\u2666', '\u2665', '\u2660']; // clubs, diamonds, hearts, spades
  var SUIT_COLORS = ['#ccddee', '#ff5555', '#ff5555', '#ccddee'];
  var RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Layout helpers
  function cellX(i) { return TOP_GAP + i * (CARD_W + TOP_GAP); }
  function foundX(i) { return W - TOP_GAP - (4 - i) * (CARD_W + TOP_GAP); }
  function tabX(col) {
    var totalW = 8 * CARD_W + 7 * TOP_GAP;
    var startX = (W - totalW) / 2;
    return startX + col * (CARD_W + TOP_GAP);
  }

  // --- State ---
  var state;
  var drag = null; // { source, col, idx, cards, offsetX, offsetY, startX, startY, mx, my, started }

  function newDeck() {
    var deck = [];
    for (var s = 0; s < 4; s++)
      for (var r = 1; r <= 13; r++)
        deck.push({ suit: s, rank: r, color: (s === 1 || s === 2) ? 1 : 0 });
    return deck;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function newGame() {
    var deck = shuffle(newDeck());
    var tableau = [[], [], [], [], [], [], [], []];
    for (var i = 0; i < 52; i++) tableau[i % 8].push(deck[i]);
    state = {
      tableau: tableau,
      freeCells: [null, null, null, null],
      foundations: [null, null, null, null],
      selected: null,   // { source, col, idx } or { source: 'free', idx }
      undoStack: [],
      gameWon: false,
      moveCount: 0
    };
    draw();
  }

  function cloneState() {
    return JSON.parse(JSON.stringify({
      tableau: state.tableau,
      freeCells: state.freeCells,
      foundations: state.foundations,
      moveCount: state.moveCount
    }));
  }

  function pushUndo() {
    state.undoStack.push(cloneState());
    if (state.undoStack.length > 200) state.undoStack.shift();
  }

  function undo() {
    if (state.undoStack.length === 0 || state.gameWon) return;
    var prev = state.undoStack.pop();
    state.tableau = prev.tableau;
    state.freeCells = prev.freeCells;
    state.foundations = prev.foundations;
    state.moveCount = prev.moveCount;
    state.selected = null;
    drag = null;
    draw();
  }

  // --- Rules ---
  function canPlaceOnTableau(card, col) {
    var pile = state.tableau[col];
    if (pile.length === 0) return true;
    var top = pile[pile.length - 1];
    return top.color !== card.color && top.rank === card.rank + 1;
  }

  function canPlaceOnFoundation(card, fi) {
    var fTop = state.foundations[fi];
    if (fTop === null) return card.rank === 1;
    return fTop.suit === card.suit && fTop.rank === card.rank - 1;
  }

  function emptyFreeCells() {
    var c = 0;
    for (var i = 0; i < 4; i++) if (state.freeCells[i] === null) c++;
    return c;
  }

  function emptyColumns() {
    var c = 0;
    for (var i = 0; i < 8; i++) if (state.tableau[i].length === 0) c++;
    return c;
  }

  function maxMovable() {
    return (1 + emptyFreeCells()) * Math.pow(2, emptyColumns());
  }

  function isValidSequence(col, startIdx) {
    var pile = state.tableau[col];
    for (var i = startIdx; i < pile.length - 1; i++) {
      var a = pile[i], b = pile[i + 1];
      if (a.color === b.color || a.rank !== b.rank + 1) return false;
    }
    return true;
  }

  // Safe auto-foundation: only auto-play if both opposite-color suits
  // have foundation rank >= card.rank - 1
  function safeToAutoPlay(card) {
    var needed = card.rank - 1;
    for (var s = 0; s < 4; s++) {
      // Check opposite color suits
      var sColor = (s === 1 || s === 2) ? 1 : 0;
      if (sColor !== card.color) {
        var fRank = state.foundations[s] === null ? 0 : state.foundations[s].rank;
        if (fRank < needed) return false;
      }
    }
    return true;
  }

  function autoFoundation() {
    var moved = true;
    while (moved) {
      moved = false;
      // Check tableau tops
      for (var c = 0; c < 8; c++) {
        var pile = state.tableau[c];
        if (pile.length === 0) continue;
        var card = pile[pile.length - 1];
        if (!safeToAutoPlay(card)) continue;
        for (var fi = 0; fi < 4; fi++) {
          if (canPlaceOnFoundation(card, fi)) {
            state.foundations[fi] = pile.pop();
            moved = true;
            break;
          }
        }
      }
      // Check free cells
      for (var i = 0; i < 4; i++) {
        if (state.freeCells[i] === null) continue;
        var card2 = state.freeCells[i];
        if (!safeToAutoPlay(card2)) continue;
        for (var fi2 = 0; fi2 < 4; fi2++) {
          if (canPlaceOnFoundation(card2, fi2)) {
            state.foundations[fi2] = state.freeCells[i];
            state.freeCells[i] = null;
            moved = true;
            break;
          }
        }
      }
    }
  }

  function checkWin() {
    for (var i = 0; i < 4; i++) {
      if (state.foundations[i] === null || state.foundations[i].rank !== 13) return false;
    }
    return true;
  }

  // --- Hit detection ---
  function getCanvasCoords(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height)
    };
  }

  function hitTest(mx, my) {
    // Free cells (top-left)
    for (var i = 0; i < 4; i++) {
      var x = cellX(i);
      if (mx >= x && mx < x + CARD_W && my >= TOP_Y && my < TOP_Y + CARD_H) {
        return { zone: 'free', idx: i };
      }
    }
    // Foundations (top-right)
    for (var i2 = 0; i2 < 4; i2++) {
      var fx = foundX(i2);
      if (mx >= fx && mx < fx + CARD_W && my >= TOP_Y && my < TOP_Y + CARD_H) {
        return { zone: 'found', idx: i2 };
      }
    }
    // Tableau columns — scan top to bottom, last card wins
    for (var c = 0; c < 8; c++) {
      var tx = tabX(c);
      var pile = state.tableau[c];
      if (mx < tx || mx >= tx + CARD_W) continue;
      if (pile.length === 0) {
        if (my >= TAB_Y && my < TAB_Y + CARD_H) return { zone: 'tab', col: c, idx: -1 };
        continue;
      }
      var dy = cascadeDY(pile.length);
      // Check from bottom card to top
      for (var j = pile.length - 1; j >= 0; j--) {
        var cy = TAB_Y + j * dy;
        var cardBottom = (j === pile.length - 1) ? cy + CARD_H : cy + dy;
        if (my >= cy && my < cardBottom) {
          return { zone: 'tab', col: c, idx: j };
        }
      }
    }
    return null;
  }

  function cascadeDY(count) {
    if (count <= 1) return CASCADE_DY;
    var maxH = H - TAB_Y - CARD_H - 8;
    var needed = (count - 1) * CASCADE_DY;
    if (needed <= maxH) return CASCADE_DY;
    return Math.floor(maxH / (count - 1));
  }

  // --- Drag / click logic ---
  function tryPickup(hit, pos) {
    var cards = null, source = null, cardOriginX, cardOriginY;
    if (hit.zone === 'free' && state.freeCells[hit.idx] !== null) {
      cards = [state.freeCells[hit.idx]];
      source = { source: 'free', idx: hit.idx };
      cardOriginX = cellX(hit.idx);
      cardOriginY = TOP_Y;
    } else if (hit.zone === 'tab') {
      var pile = state.tableau[hit.col];
      if (pile.length > 0) {
        var idx = hit.idx < 0 ? pile.length - 1 : hit.idx;
        if (isValidSequence(hit.col, idx)) {
          var seqLen = pile.length - idx;
          if (seqLen <= maxMovable()) {
            cards = pile.slice(idx);
            source = { source: 'tab', col: hit.col, idx: idx };
            cardOriginX = tabX(hit.col);
            cardOriginY = TAB_Y + idx * cascadeDY(pile.length);
          }
        }
      }
    }
    if (!cards) return false;
    drag = {
      source: source.source, col: source.col, idx: source.idx,
      cards: cards,
      offsetX: pos.x - cardOriginX, offsetY: pos.y - cardOriginY,
      startX: pos.x, startY: pos.y,
      mx: pos.x, my: pos.y,
      started: false
    };
    return true;
  }

  function handleMouseDown(e) {
    if (e.preventDefault) e.preventDefault();
    if (state.gameWon) return;
    var pos = getCanvasCoords(e);
    var hit = hitTest(pos.x, pos.y);

    // Click-to-place: if something selected, try placing at the target
    if (state.selected && hit) {
      if (tryPlace(hit)) {
        state.selected = null;
        drag = null;
        autoFoundation();
        if (checkWin()) state.gameWon = true;
        draw();
        return;
      }
      state.selected = null;
    }

    drag = null;
    if (!hit) { draw(); return; }
    tryPickup(hit, pos);
    draw();
  }

  function handleMouseMove(e) {
    var pos = getCanvasCoords(e);
    if (!drag) {
      var hit = hitTest(pos.x, pos.y);
      var over = hit && ((hit.zone === 'free' && state.freeCells[hit.idx] !== null) ||
                         (hit.zone === 'tab' && state.tableau[hit.col] && state.tableau[hit.col].length > 0));
      canvas.style.cursor = over ? 'grab' : 'default';
      return;
    }
    drag.mx = pos.x;
    drag.my = pos.y;
    if (!drag.started) {
      var ddx = pos.x - drag.startX, ddy = pos.y - drag.startY;
      if (ddx * ddx + ddy * ddy < 16) return;
      drag.started = true;
      canvas.style.cursor = 'grabbing';
    }
    draw();
  }

  function handleMouseUp(e) {
    if (!drag) return;
    var pos = getCanvasCoords(e);

    if (!drag.started) {
      // No movement — treat as click-to-select
      state.selected = { source: drag.source, col: drag.col, idx: drag.idx };
      drag = null;
      canvas.style.cursor = 'grab';
      draw();
      return;
    }

    // Drag ended — try to drop
    var hit = hitTest(pos.x, pos.y);
    if (hit) {
      state.selected = { source: drag.source, col: drag.col, idx: drag.idx };
      if (tryPlace(hit)) {
        state.selected = null;
        drag = null;
        autoFoundation();
        if (checkWin()) state.gameWon = true;
        canvas.style.cursor = 'default';
        draw();
        return;
      }
      state.selected = null;
    }

    // Failed drop — snap back
    drag = null;
    canvas.style.cursor = 'default';
    draw();
  }

  function tryPlace(hit) {
    var sel = state.selected;
    if (hit.zone === 'found') {
      // Place single card on foundation
      var card = getSelectedCards();
      if (card.length !== 1) return false;
      if (canPlaceOnFoundation(card[0], hit.idx)) {
        pushUndo();
        removeSelected();
        state.foundations[hit.idx] = card[0];
        state.moveCount++;
        return true;
      }
      return false;
    }
    if (hit.zone === 'free') {
      // Place single card in free cell
      if (state.freeCells[hit.idx] !== null) return false;
      var cards = getSelectedCards();
      if (cards.length !== 1) return false;
      pushUndo();
      removeSelected();
      state.freeCells[hit.idx] = cards[0];
      state.moveCount++;
      return true;
    }
    if (hit.zone === 'tab') {
      var cards2 = getSelectedCards();
      if (cards2.length === 0) return false;
      // Check supermove limit accounting for target column being empty
      var targetEmpty = state.tableau[hit.col].length === 0;
      var emptyColsAvailable = emptyColumns();
      // If moving to an empty column, that column isn't available as buffer
      if (targetEmpty) emptyColsAvailable--;
      var limit = (1 + emptyFreeCells()) * Math.pow(2, Math.max(0, emptyColsAvailable));
      if (cards2.length > limit) return false;
      if (targetEmpty || canPlaceOnTableau(cards2[0], hit.col)) {
        pushUndo();
        removeSelected();
        for (var i = 0; i < cards2.length; i++) state.tableau[hit.col].push(cards2[i]);
        state.moveCount++;
        return true;
      }
      return false;
    }
    return false;
  }

  function getSelectedCards() {
    var sel = state.selected;
    if (!sel) return [];
    if (sel.source === 'free') return [state.freeCells[sel.idx]];
    if (sel.source === 'tab') return state.tableau[sel.col].slice(sel.idx);
    return [];
  }

  function removeSelected() {
    var sel = state.selected;
    if (sel.source === 'free') {
      state.freeCells[sel.idx] = null;
    } else if (sel.source === 'tab') {
      state.tableau[sel.col].splice(sel.idx);
    }
  }

  // --- Drawing ---
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    // Labels
    ctx.font = '11px Courier New';
    ctx.fillStyle = 'rgba(60,140,255,0.3)';
    ctx.fillText('FREE CELLS', cellX(0), TOP_Y - 4);
    ctx.fillText('FOUNDATIONS', foundX(0), TOP_Y - 4);

    // Free cells
    var isDragging = drag && drag.started;
    for (var i = 0; i < 4; i++) {
      var x = cellX(i);
      var isDragSrc = isDragging && drag.source === 'free' && drag.idx === i;
      if (state.freeCells[i] && !isDragSrc) {
        var isSel = state.selected && state.selected.source === 'free' && state.selected.idx === i;
        drawCard(x, TOP_Y, state.freeCells[i], isSel);
      } else {
        drawEmptySlot(x, TOP_Y);
      }
    }

    // Foundations
    for (var f = 0; f < 4; f++) {
      var fx = foundX(f);
      if (state.foundations[f]) {
        drawCard(fx, TOP_Y, state.foundations[f], false);
      } else {
        drawEmptySlot(fx, TOP_Y);
        // Suit hint
        ctx.font = '28px serif';
        ctx.fillStyle = 'rgba(60,140,255,0.15)';
        ctx.textAlign = 'center';
        ctx.fillText(SUITS[f], fx + CARD_W / 2, TOP_Y + CARD_H / 2 + 10);
        ctx.textAlign = 'left';
      }
    }

    // Tableau
    for (var c = 0; c < 8; c++) {
      var tx = tabX(c);
      var pile = state.tableau[c];
      var drawCount = pile.length;
      if (isDragging && drag.source === 'tab' && drag.col === c) {
        drawCount = drag.idx;
      }
      if (drawCount === 0) {
        drawEmptySlot(tx, TAB_Y);
        continue;
      }
      var dy = cascadeDY(pile.length);
      for (var j = 0; j < drawCount; j++) {
        var isSel2 = state.selected && state.selected.source === 'tab' &&
                     state.selected.col === c && j >= state.selected.idx;
        drawCard(tx, TAB_Y + j * dy, pile[j], isSel2);
      }
    }

    // Move counter
    ctx.font = '12px Courier New';
    ctx.fillStyle = 'rgba(60,140,255,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('MOVES: ' + state.moveCount, W / 2, H - 6);
    ctx.textAlign = 'left';

    // Dragged cards (drawn on top of everything)
    if (isDragging) {
      var dragX = drag.mx - drag.offsetX;
      var dragY = drag.my - drag.offsetY;
      for (var di = 0; di < drag.cards.length; di++) {
        drawCard(dragX, dragY + di * CASCADE_DY, drag.cards[di], true);
      }
    }

    // Win overlay
    if (state.gameWon) drawWinOverlay();
  }

  function drawCard(x, y, card, selected) {
    // Card background
    ctx.fillStyle = selected ? '#1a2848' : '#1a2030';
    roundRect(x, y, CARD_W, CARD_H, CARD_R, true);

    // Border
    ctx.strokeStyle = selected ? 'rgba(60,140,255,0.8)' : 'rgba(60,140,255,0.25)';
    ctx.lineWidth = selected ? 2 : 1;
    roundRect(x, y, CARD_W, CARD_H, CARD_R, false, true);

    // Selected glow
    if (selected) {
      ctx.shadowColor = 'rgba(60,140,255,0.4)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(60,140,255,0.6)';
      roundRect(x, y, CARD_W, CARD_H, CARD_R, false, true);
      ctx.shadowBlur = 0;
    }

    var color = SUIT_COLORS[card.suit];

    // Rank + suit top-left
    ctx.font = 'bold 14px Courier New';
    ctx.fillStyle = color;
    ctx.fillText(RANKS[card.rank], x + 5, y + 16);
    ctx.font = '12px serif';
    ctx.fillText(SUITS[card.suit], x + 5, y + 30);

    // Large suit center
    ctx.font = '32px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(SUITS[card.suit], x + CARD_W / 2, y + CARD_H / 2 + 12);
    ctx.textAlign = 'left';
  }

  function drawEmptySlot(x, y) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(60,140,255,0.15)';
    ctx.lineWidth = 1;
    roundRect(x, y, CARD_W, CARD_H, CARD_R, false, true);
    ctx.setLineDash([]);
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawWinOverlay() {
    ctx.fillStyle = 'rgba(10,14,26,0.85)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Courier New';
    ctx.fillStyle = 'rgba(60,140,255,0.9)';
    ctx.fillText('YOU WIN!', W / 2, H / 2 - 30);

    ctx.font = '18px Courier New';
    ctx.fillStyle = 'rgba(60,140,255,0.6)';
    ctx.fillText('Moves: ' + state.moveCount, W / 2, H / 2 + 10);
    ctx.fillText('Press N for new game', W / 2, H / 2 + 40);
    ctx.textAlign = 'left';
  }

  // --- Input ---
  canvas.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (e.touches.length === 1) handleMouseDown(e.touches[0]);
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches.length === 1) handleMouseMove(e.touches[0]);
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    if (e.changedTouches.length >= 1) handleMouseUp(e.changedTouches[0]);
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'n') newGame();
    if (k === 'z' && !e.ctrlKey && !e.metaKey) undo();
    if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    if (k === 'escape') { state.selected = null; drag = null; }
    draw();
  });

  // --- Start ---
  newGame();
})();
