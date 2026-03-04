(function () {
  'use strict';

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var W, H;

  // --- Layout (recomputed on resize) ---
  var CARD_W, CARD_H, CARD_R, CASCADE_DY, TOP_Y, TOP_GAP, TAB_Y, S;
  var SUITS = ['\u2663', '\u2666', '\u2665', '\u2660'];
  var SUIT_COLORS = ['#ccddee', '#ff5555', '#ff5555', '#ccddee'];
  var RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Standard playing card pip layouts: [xFrac, yFrac] within pip area
  var PIP_POS = {
    1:  [[0.5, 0.5]],
    2:  [[0.5, 0.15], [0.5, 0.85]],
    3:  [[0.5, 0.15], [0.5, 0.5], [0.5, 0.85]],
    4:  [[0.3, 0.15], [0.7, 0.15], [0.3, 0.85], [0.7, 0.85]],
    5:  [[0.3, 0.15], [0.7, 0.15], [0.5, 0.5], [0.3, 0.85], [0.7, 0.85]],
    6:  [[0.3, 0.15], [0.7, 0.15], [0.3, 0.5], [0.7, 0.5], [0.3, 0.85], [0.7, 0.85]],
    7:  [[0.3, 0.15], [0.7, 0.15], [0.5, 0.325], [0.3, 0.5], [0.7, 0.5], [0.3, 0.85], [0.7, 0.85]],
    8:  [[0.3, 0.15], [0.7, 0.15], [0.5, 0.325], [0.3, 0.5], [0.7, 0.5], [0.5, 0.675], [0.3, 0.85], [0.7, 0.85]],
    9:  [[0.3, 0.125], [0.7, 0.125], [0.3, 0.375], [0.7, 0.375], [0.5, 0.5], [0.3, 0.625], [0.7, 0.625], [0.3, 0.875], [0.7, 0.875]],
    10: [[0.3, 0.125], [0.7, 0.125], [0.5, 0.25], [0.3, 0.375], [0.7, 0.375], [0.3, 0.625], [0.7, 0.625], [0.5, 0.75], [0.3, 0.875], [0.7, 0.875]]
  };

  function recalcLayout() {
    W = canvas.width;
    H = canvas.height;
    TOP_GAP = Math.max(4, Math.round(W / 86));
    CARD_W = Math.round((W - 9 * TOP_GAP) / 8);
    CARD_H = Math.round(CARD_W * 100 / 72);
    // Height constraint: ensure tableau has room
    var needed = Math.round(TOP_GAP * 3) + CARD_H * 2.5 + Math.round(CARD_H * 0.22) * 6;
    if (needed > H) {
      CARD_H = Math.max(40, Math.round((H - TOP_GAP * 5) / 3.5));
      CARD_W = Math.round(CARD_H * 72 / 100);
    }
    CARD_R = Math.max(2, Math.round(CARD_W * 6 / 72));
    TOP_Y = Math.round(TOP_GAP * 1.33);
    TAB_Y = TOP_Y + CARD_H + Math.round(TOP_GAP * 1.67);
    CASCADE_DY = Math.max(8, Math.round(CARD_H * 0.22));
    S = CARD_W / 72;
  }

  function resize() {
    var topBar = document.querySelector('.top-bar');
    var controls = document.querySelector('.controls');
    var availW = window.innerWidth;
    var availH = window.innerHeight - topBar.offsetHeight - controls.offsetHeight;
    canvas.width = Math.max(280, Math.round(availW));
    canvas.height = Math.max(200, Math.round(availH));
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    recalcLayout();
    if (state) draw();
  }

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
  var drag = null;
  var anims = [];
  var animRunning = false;

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
      selected: null,
      undoStack: [],
      gameWon: false,
      moveCount: 0
    };
    drag = null;
    anims.length = 0;
    animRunning = false;
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
    anims.length = 0;
    animRunning = false;
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

  function safeToAutoPlay(card) {
    var needed = card.rank - 1;
    for (var s = 0; s < 4; s++) {
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
    var animDelay = anims.length > 0 ? 100 : 0;
    while (moved) {
      moved = false;
      for (var c = 0; c < 8; c++) {
        var pile = state.tableau[c];
        if (pile.length === 0) continue;
        var card = pile[pile.length - 1];
        if (!safeToAutoPlay(card)) continue;
        for (var fi = 0; fi < 4; fi++) {
          if (canPlaceOnFoundation(card, fi)) {
            var sx = tabX(c);
            var sy = TAB_Y + (pile.length - 1) * cascadeDY(pile.length);
            state.foundations[fi] = pile.pop();
            addFoundAnim(state.foundations[fi], sx, sy, fi, animDelay);
            animDelay += 80;
            moved = true;
            break;
          }
        }
      }
      for (var i = 0; i < 4; i++) {
        if (state.freeCells[i] === null) continue;
        var card2 = state.freeCells[i];
        if (!safeToAutoPlay(card2)) continue;
        for (var fi2 = 0; fi2 < 4; fi2++) {
          if (canPlaceOnFoundation(card2, fi2)) {
            var sx2 = cellX(i);
            var sy2 = TOP_Y;
            state.foundations[fi2] = state.freeCells[i];
            state.freeCells[i] = null;
            addFoundAnim(state.foundations[fi2], sx2, sy2, fi2, animDelay);
            animDelay += 80;
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

  function trySendToFoundation(hit) {
    var card, srcX, srcY;
    if (hit.zone === 'free') {
      if (state.freeCells[hit.idx] === null) return false;
      card = state.freeCells[hit.idx];
      srcX = cellX(hit.idx);
      srcY = TOP_Y;
    } else if (hit.zone === 'tab') {
      var pile = state.tableau[hit.col];
      if (pile.length === 0) return false;
      card = pile[pile.length - 1];
      srcX = tabX(hit.col);
      srcY = TAB_Y + (pile.length - 1) * cascadeDY(pile.length);
    } else {
      return false;
    }
    for (var fi = 0; fi < 4; fi++) {
      if (canPlaceOnFoundation(card, fi)) {
        pushUndo();
        if (hit.zone === 'free') {
          state.freeCells[hit.idx] = null;
        } else {
          state.tableau[hit.col].pop();
        }
        state.foundations[fi] = card;
        state.moveCount++;
        addFoundAnim(card, srcX, srcY, fi, 0);
        return true;
      }
    }
    return false;
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
    for (var i = 0; i < 4; i++) {
      var x = cellX(i);
      if (mx >= x && mx < x + CARD_W && my >= TOP_Y && my < TOP_Y + CARD_H) {
        return { zone: 'free', idx: i };
      }
    }
    for (var i2 = 0; i2 < 4; i2++) {
      var fx = foundX(i2);
      if (mx >= fx && mx < fx + CARD_W && my >= TOP_Y && my < TOP_Y + CARD_H) {
        return { zone: 'found', idx: i2 };
      }
    }
    for (var c = 0; c < 8; c++) {
      var tx = tabX(c);
      var pile = state.tableau[c];
      if (mx < tx || mx >= tx + CARD_W) continue;
      if (pile.length === 0) {
        if (my >= TAB_Y && my < TAB_Y + CARD_H) return { zone: 'tab', col: c, idx: -1 };
        continue;
      }
      var dy = cascadeDY(pile.length);
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
    if (count <= 10) return CASCADE_DY;
    var maxH = 9 * CASCADE_DY;
    return Math.max(Math.round(4 * S), Math.floor(maxH / (count - 1)));
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
    if (anims.length > 0) { anims.length = 0; animRunning = false; }
    var pos = getCanvasCoords(e);
    var hit = hitTest(pos.x, pos.y);

    if (state.selected && hit) {
      if (tryPlace(hit)) {
        state.selected = null;
        drag = null;
        autoFoundation();
        if (checkWin()) state.gameWon = true;
        draw();
        startAnimLoop();
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
      state.selected = { source: drag.source, col: drag.col, idx: drag.idx };
      drag = null;
      canvas.style.cursor = 'grab';
      draw();
      return;
    }

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
        startAnimLoop();
        return;
      }
      state.selected = null;
    }

    drag = null;
    canvas.style.cursor = 'default';
    draw();
  }

  function tryPlace(hit) {
    var sel = state.selected;
    if (hit.zone === 'found') {
      var card = getSelectedCards();
      if (card.length !== 1) return false;
      if (canPlaceOnFoundation(card[0], hit.idx)) {
        var srcX, srcY;
        if (drag && drag.started) {
          srcX = drag.mx - drag.offsetX;
          srcY = drag.my - drag.offsetY;
        } else if (sel.source === 'free') {
          srcX = cellX(sel.idx);
          srcY = TOP_Y;
        } else {
          srcX = tabX(sel.col);
          var srcPile = state.tableau[sel.col];
          srcY = TAB_Y + (srcPile.length - 1) * cascadeDY(srcPile.length);
        }
        pushUndo();
        removeSelected();
        state.foundations[hit.idx] = card[0];
        state.moveCount++;
        addFoundAnim(card[0], srcX, srcY, hit.idx, 0);
        return true;
      }
      return false;
    }
    if (hit.zone === 'free') {
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
      var targetEmpty = state.tableau[hit.col].length === 0;
      var emptyColsAvailable = emptyColumns();
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

  // --- Animation ---
  function addFoundAnim(card, fromX, fromY, foundIdx, delay) {
    var prevCard = null;
    if (card.rank > 1) {
      prevCard = { suit: card.suit, rank: card.rank - 1, color: card.color };
    }
    anims.push({
      card: card,
      fromX: fromX, fromY: fromY,
      toX: foundX(foundIdx), toY: TOP_Y,
      start: performance.now() + (delay || 0),
      duration: 180,
      foundIdx: foundIdx,
      prevCard: prevCard
    });
  }

  function tickAnims() {
    var now = performance.now();
    while (anims.length > 0 && now >= anims[0].start + anims[0].duration) {
      anims.shift();
    }
    if (anims.length === 0) {
      animRunning = false;
      draw();
      return;
    }
    draw();
    requestAnimationFrame(tickAnims);
  }

  function startAnimLoop() {
    if (!animRunning && anims.length > 0) {
      animRunning = true;
      requestAnimationFrame(tickAnims);
    }
  }

  // --- Drawing ---
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060810';
    ctx.fillRect(0, 0, W, H);

    // Labels
    ctx.font = Math.round(11 * S) + 'px Courier New';
    ctx.fillStyle = 'rgba(60,140,255,0.85)';
    ctx.fillText('FREE CELLS', cellX(0), TOP_Y - Math.round(4 * S));
    ctx.fillText('FOUNDATIONS', foundX(0), TOP_Y - Math.round(4 * S));

    var isDragging = drag && drag.started;

    // Free cells
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
      var animForF = null;
      for (var ai = 0; ai < anims.length; ai++) {
        if (anims[ai].foundIdx === f) { animForF = anims[ai]; break; }
      }
      if (animForF) {
        if (animForF.prevCard) {
          drawCard(fx, TOP_Y, animForF.prevCard, false);
        } else {
          drawEmptySlot(fx, TOP_Y);
          ctx.font = Math.round(28 * S) + 'px serif';
          ctx.fillStyle = 'rgba(60,140,255,0.15)';
          ctx.textAlign = 'center';
          ctx.fillText(SUITS[f], fx + CARD_W / 2, TOP_Y + CARD_H / 2 + Math.round(10 * S));
          ctx.textAlign = 'left';
        }
      } else if (state.foundations[f]) {
        drawCard(fx, TOP_Y, state.foundations[f], false);
      } else {
        drawEmptySlot(fx, TOP_Y);
        ctx.font = Math.round(28 * S) + 'px serif';
        ctx.fillStyle = 'rgba(60,140,255,0.15)';
        ctx.textAlign = 'center';
        ctx.fillText(SUITS[f], fx + CARD_W / 2, TOP_Y + CARD_H / 2 + Math.round(10 * S));
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
    ctx.font = Math.round(12 * S) + 'px Courier New';
    ctx.fillStyle = 'rgba(60,140,255,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('MOVES: ' + state.moveCount, W / 2, H - Math.round(6 * S));
    ctx.textAlign = 'left';

    // Dragged cards
    if (isDragging) {
      var dragX = drag.mx - drag.offsetX;
      var dragY = drag.my - drag.offsetY;
      for (var di = 0; di < drag.cards.length; di++) {
        drawCard(dragX, dragY + di * CASCADE_DY, drag.cards[di], true);
      }
    }

    // Animated cards flying to foundations
    var now = performance.now();
    for (var ai2 = 0; ai2 < anims.length; ai2++) {
      var a = anims[ai2];
      if (now < a.start) continue;
      var t = Math.min(1, (now - a.start) / a.duration);
      t = 1 - (1 - t) * (1 - t);
      var ax = a.fromX + (a.toX - a.fromX) * t;
      var ay = a.fromY + (a.toY - a.fromY) * t;
      drawCard(ax, ay, a.card, false);
    }

    if (state.gameWon) drawWinOverlay();
  }

  function drawPips(x, y, card) {
    var color = SUIT_COLORS[card.suit];
    var suit = SUITS[card.suit];
    var positions = PIP_POS[card.rank];

    // Pip area: inset from card edges, large to fill the card
    var pipL = x + CARD_W * 0.15;
    var pipT = y + CARD_H * 0.10;
    var pipW = CARD_W * 0.70;
    var pipH = CARD_H * 0.80;

    ctx.fillStyle = color;
    ctx.textAlign = 'center';

    if (card.rank === 1) {
      // Ace: one large centered pip
      ctx.font = Math.round(38 * S) + 'px serif';
      ctx.fillText(suit, pipL + pipW * 0.5, pipT + pipH * 0.5 + Math.round(14 * S));
    } else {
      ctx.font = Math.round(24 * S) + 'px serif';
      for (var i = 0; i < positions.length; i++) {
        var px = pipL + pipW * positions[i][0];
        var py = pipT + pipH * positions[i][1];

        if (positions[i][1] > 0.5) {
          // Bottom half — draw upside-down
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.PI);
          ctx.fillText(suit, 0, Math.round(9 * S));
          ctx.restore();
        } else {
          ctx.fillText(suit, px, py + Math.round(9 * S));
        }
      }
    }
    ctx.textAlign = 'left';
  }

  // --- Held-item helpers ---
  function drawSword(cx, cy, h, color) {
    // Vertical sword: blade + crossguard + grip
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
    // Blade
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + h);
    ctx.stroke();
    // Crossguard
    var gY = cy + Math.round(h * 0.72);
    ctx.beginPath();
    ctx.moveTo(cx - Math.round(3 * S), gY);
    ctx.lineTo(cx + Math.round(3 * S), gY);
    ctx.stroke();
    // Pommel
    ctx.beginPath();
    ctx.arc(cx, cy + h + Math.round(1 * S), Math.max(1, Math.round(1 * S)), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAxe(cx, cy, h, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
    // Shaft
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + h);
    ctx.stroke();
    // Axe head (curved blade on one side)
    var headY = cy + Math.round(h * 0.15);
    var headH = Math.round(h * 0.35);
    ctx.beginPath();
    ctx.moveTo(cx, headY);
    ctx.quadraticCurveTo(cx + Math.round(5 * S), headY + headH / 2, cx, headY + headH);
    ctx.stroke();
    // Fill the blade area lightly
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, headY);
    ctx.quadraticCurveTo(cx + Math.round(5 * S), headY + headH / 2, cx, headY + headH);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  function drawRose(cx, cy, h, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(1 * S));
    // Stem
    ctx.beginPath();
    ctx.moveTo(cx, cy + Math.round(h * 0.3));
    ctx.lineTo(cx, cy + h);
    ctx.stroke();
    // Flower head (small circle cluster)
    var r = Math.max(2, Math.round(2.5 * S));
    var fy = cy + Math.round(h * 0.2);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(cx, fy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(cx - r * 0.7, fy + r * 0.5, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.7, fy + r * 0.5, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  function drawScepter(cx, cy, h, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
    // Shaft
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + h);
    ctx.stroke();
    // Orb on top
    var r = Math.max(2, Math.round(2 * S));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Small cross on orb
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy - r - Math.round(1.5 * S));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - Math.round(1 * S), cy - r - Math.round(0.5 * S));
    ctx.lineTo(cx + Math.round(1 * S), cy - r - Math.round(0.5 * S));
    ctx.stroke();
  }

  function drawStaff(cx, cy, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + h);
    ctx.stroke();
    // Knob on top
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, Math.round(1.5 * S)), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFeather(cx, cy, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(1 * S));
    // Quill shaft (slightly curved)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.round(1.5 * S), cy + h * 0.5, cx, cy + h);
    ctx.stroke();
    // Feather vanes
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + Math.round(h * 0.1));
    ctx.quadraticCurveTo(cx + Math.round(3 * S), cy + Math.round(h * 0.3), cx, cy + Math.round(h * 0.55));
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy + Math.round(h * 0.1));
    ctx.quadraticCurveTo(cx - Math.round(2 * S), cy + Math.round(h * 0.3), cx, cy + Math.round(h * 0.55));
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  function drawPike(cx, cy, h, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
    // Shaft
    ctx.beginPath();
    ctx.moveTo(cx, cy + Math.round(h * 0.2));
    ctx.lineTo(cx, cy + h);
    ctx.stroke();
    // Spearhead
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - Math.round(2 * S), cy + Math.round(h * 0.22));
    ctx.lineTo(cx + Math.round(2 * S), cy + Math.round(h * 0.22));
    ctx.closePath();
    ctx.fill();
  }

  // --- Portrait half drawing ---
  function drawPortraitHalf(cx, topY, halfH, card, clothFill, accentColor) {
    var color = SUIT_COLORS[card.suit];
    var headR = Math.round(Math.min(halfH * 0.16, 7 * S));
    var headCY = topY + Math.round(halfH * 0.28);
    var lw = Math.max(1, Math.round(1.2 * S));

    // --- Head (filled circle with outline) ---
    ctx.fillStyle = 'rgba(180,160,140,0.25)';
    ctx.beginPath();
    ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();

    // --- Eyes ---
    var eyeOff = Math.round(headR * 0.4);
    var eyeR = Math.max(1, Math.round(1.2 * S));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx - eyeOff, headCY - Math.round(headR * 0.15), eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeOff, headCY - Math.round(headR * 0.15), eyeR, 0, Math.PI * 2);
    ctx.fill();

    // --- Nose (small line) ---
    var noseLen = Math.max(1, Math.round(1.5 * S));
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(0.8 * S));
    ctx.beginPath();
    ctx.moveTo(cx, headCY + Math.round(headR * 0.1));
    ctx.lineTo(cx, headCY + Math.round(headR * 0.1) + noseLen);
    ctx.stroke();

    // --- Mouth (small arc) ---
    ctx.beginPath();
    ctx.arc(cx, headCY + Math.round(headR * 0.35), Math.round(headR * 0.2), 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    ctx.lineWidth = lw;

    // Item dimensions
    var itemH = Math.round(halfH * 0.45);
    var itemOff = Math.round(headR * 1.6);
    var itemY = topY + Math.round(halfH * 0.18);

    // --- Rank-specific details ---
    if (card.rank === 11) {
      drawJackDetails(cx, topY, halfH, headR, headCY, card, clothFill, accentColor, color, itemH, itemOff, itemY);
    } else if (card.rank === 12) {
      drawQueenDetails(cx, topY, halfH, headR, headCY, card, clothFill, accentColor, color, itemH, itemOff, itemY);
    } else if (card.rank === 13) {
      drawKingDetails(cx, topY, halfH, headR, headCY, card, clothFill, accentColor, color, itemH, itemOff, itemY);
    }
  }

  function drawJackDetails(cx, topY, halfH, headR, headCY, card, clothFill, accent, color, itemH, itemOff, itemY) {
    var lw = Math.max(1, Math.round(1.2 * S));

    // --- Beret / flat cap (filled) ---
    var capTop = headCY - headR - Math.round(3 * S);
    var capW = Math.round(headR * 1.3);
    ctx.fillStyle = clothFill;
    ctx.beginPath();
    ctx.moveTo(cx - capW, headCY - headR + Math.round(1 * S));
    ctx.quadraticCurveTo(cx - capW, capTop, cx, capTop - Math.round(1 * S));
    ctx.quadraticCurveTo(cx + capW + Math.round(2 * S), capTop, cx + capW + Math.round(2 * S), headCY - headR + Math.round(1 * S));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
    // Cap brim
    ctx.beginPath();
    ctx.moveTo(cx - capW - Math.round(1 * S), headCY - headR + Math.round(1 * S));
    ctx.lineTo(cx + capW + Math.round(3 * S), headCY - headR + Math.round(1 * S));
    ctx.stroke();

    // --- V-neck tunic (filled, narrow) ---
    var bodyTop = headCY + headR;
    var bodyBot = topY + halfH;
    var bodyW = Math.round(headR * 1.2);
    ctx.fillStyle = clothFill;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW, bodyTop + Math.round(2 * S));
    ctx.lineTo(cx - bodyW - Math.round(2 * S), bodyBot);
    ctx.lineTo(cx + bodyW + Math.round(2 * S), bodyBot);
    ctx.lineTo(cx + bodyW, bodyTop + Math.round(2 * S));
    // V-neck cutout
    ctx.lineTo(cx + Math.round(3 * S), bodyTop);
    ctx.lineTo(cx, bodyTop + Math.round(3 * S));
    ctx.lineTo(cx - Math.round(3 * S), bodyTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();

    // Collar accent lines
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, Math.round(0.7 * S));
    ctx.beginPath();
    ctx.moveTo(cx - bodyW + Math.round(1 * S), bodyTop + Math.round(3 * S));
    ctx.lineTo(cx - bodyW + Math.round(1 * S), bodyBot);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + bodyW - Math.round(1 * S), bodyTop + Math.round(3 * S));
    ctx.lineTo(cx + bodyW - Math.round(1 * S), bodyBot);
    ctx.stroke();

    // --- Held item (suit-specific) ---
    ctx.lineWidth = Math.max(1, Math.round(1.2 * S));
    if (card.suit === 0) { // Clubs: staff left
      drawStaff(cx - itemOff, itemY, itemH, accent);
    } else if (card.suit === 1) { // Diamonds: feather right
      drawFeather(cx + itemOff, itemY, itemH, accent);
    } else if (card.suit === 2) { // Hearts: rose left
      drawRose(cx - itemOff, itemY, itemH, accent);
    } else { // Spades: pike right
      drawPike(cx + itemOff, itemY, itemH, accent);
    }
  }

  function drawQueenDetails(cx, topY, halfH, headR, headCY, card, clothFill, accent, color, itemH, itemOff, itemY) {
    var lw = Math.max(1, Math.round(1.2 * S));

    // --- 3-pointed crown (filled) ---
    var crBase = headCY - headR - Math.round(1 * S);
    var crH = Math.round(headR * 0.8);
    var crW = Math.round(headR * 1.0);
    ctx.fillStyle = 'rgba(220,180,50,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx - crW, crBase);
    ctx.lineTo(cx - crW + Math.round(2 * S), crBase - crH);
    ctx.lineTo(cx - Math.round(1 * S), crBase - Math.round(crH * 0.3));
    ctx.lineTo(cx, crBase - crH);
    ctx.lineTo(cx + Math.round(1 * S), crBase - Math.round(crH * 0.3));
    ctx.lineTo(cx + crW - Math.round(2 * S), crBase - crH);
    ctx.lineTo(cx + crW, crBase);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();

    // --- Hair (flowing lines down both sides) ---
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, Math.round(1 * S));
    // Left hair
    ctx.beginPath();
    ctx.moveTo(cx - headR, headCY - Math.round(headR * 0.3));
    ctx.quadraticCurveTo(cx - headR - Math.round(3 * S), headCY + headR * 0.5, cx - headR - Math.round(2 * S), headCY + headR + Math.round(5 * S));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - headR + Math.round(1 * S), headCY - Math.round(headR * 0.1));
    ctx.quadraticCurveTo(cx - headR - Math.round(2 * S), headCY + headR * 0.7, cx - headR - Math.round(1 * S), headCY + headR + Math.round(4 * S));
    ctx.stroke();
    // Right hair
    ctx.beginPath();
    ctx.moveTo(cx + headR, headCY - Math.round(headR * 0.3));
    ctx.quadraticCurveTo(cx + headR + Math.round(3 * S), headCY + headR * 0.5, cx + headR + Math.round(2 * S), headCY + headR + Math.round(5 * S));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + headR - Math.round(1 * S), headCY - Math.round(headR * 0.1));
    ctx.quadraticCurveTo(cx + headR + Math.round(2 * S), headCY + headR * 0.7, cx + headR + Math.round(1 * S), headCY + headR + Math.round(4 * S));
    ctx.stroke();

    // --- Necklace (small arc below chin) ---
    ctx.strokeStyle = 'rgba(220,180,50,0.6)';
    ctx.lineWidth = Math.max(1, Math.round(0.8 * S));
    var neckY = headCY + headR + Math.round(2 * S);
    ctx.beginPath();
    ctx.arc(cx, neckY, Math.round(3 * S), 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // pendant dot
    ctx.fillStyle = 'rgba(220,180,50,0.6)';
    ctx.beginPath();
    ctx.arc(cx, neckY + Math.round(3 * S), Math.max(1, Math.round(0.8 * S)), 0, Math.PI * 2);
    ctx.fill();

    // --- Gown (filled, curved, wider than Jack) ---
    var bodyTop = headCY + headR + Math.round(1 * S);
    var bodyBot = topY + halfH;
    var bodyW = Math.round(headR * 1.6);
    ctx.fillStyle = clothFill;
    ctx.beginPath();
    ctx.moveTo(cx - Math.round(headR * 0.7), bodyTop);
    ctx.quadraticCurveTo(cx - bodyW - Math.round(2 * S), (bodyTop + bodyBot) / 2, cx - bodyW - Math.round(3 * S), bodyBot);
    ctx.lineTo(cx + bodyW + Math.round(3 * S), bodyBot);
    ctx.quadraticCurveTo(cx + bodyW + Math.round(2 * S), (bodyTop + bodyBot) / 2, cx + Math.round(headR * 0.7), bodyTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();

    // Gown center line accent
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, Math.round(0.7 * S));
    ctx.beginPath();
    ctx.moveTo(cx, bodyTop + Math.round(2 * S));
    ctx.lineTo(cx, bodyBot);
    ctx.stroke();

    // --- Held item (suit-specific) ---
    ctx.lineWidth = Math.max(1, Math.round(1.2 * S));
    if (card.suit === 0) { // Clubs: scepter left
      drawScepter(cx - itemOff, itemY, itemH, accent);
    } else if (card.suit === 1) { // Diamonds: rose right
      drawRose(cx + itemOff, itemY, itemH, accent);
    } else if (card.suit === 2) { // Hearts: rose left
      drawRose(cx - itemOff, itemY, itemH, accent);
    } else { // Spades: scepter right
      drawScepter(cx + itemOff, itemY, itemH, accent);
    }
  }

  function drawKingDetails(cx, topY, halfH, headR, headCY, card, clothFill, accent, color, itemH, itemOff, itemY) {
    var lw = Math.max(1, Math.round(1.2 * S));

    // --- 5-pointed crown (filled, with jewel) ---
    var crBase = headCY - headR - Math.round(1 * S);
    var crH = Math.round(headR * 1.0);
    var crW = Math.round(headR * 1.15);
    ctx.fillStyle = 'rgba(220,180,50,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx - crW, crBase);
    ctx.lineTo(cx - crW + Math.round(1 * S), crBase - crH);
    ctx.lineTo(cx - Math.round(headR * 0.5), crBase - Math.round(crH * 0.35));
    ctx.lineTo(cx - Math.round(headR * 0.25), crBase - crH);
    ctx.lineTo(cx, crBase - Math.round(crH * 0.35));
    ctx.lineTo(cx + Math.round(headR * 0.25), crBase - crH);
    ctx.lineTo(cx + Math.round(headR * 0.5), crBase - Math.round(crH * 0.35));
    ctx.lineTo(cx + crW - Math.round(1 * S), crBase - crH);
    ctx.lineTo(cx + crW, crBase);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
    // Crown band
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, Math.round(0.7 * S));
    ctx.beginPath();
    ctx.moveTo(cx - crW, crBase);
    ctx.lineTo(cx + crW, crBase);
    ctx.stroke();
    // Center jewel
    ctx.fillStyle = card.suit === 1 || card.suit === 2 ? 'rgba(255,80,80,0.7)' : 'rgba(80,140,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx, crBase - Math.round(crH * 0.55), Math.max(1, Math.round(1.2 * S)), 0, Math.PI * 2);
    ctx.fill();

    // --- Beard (filled) ---
    ctx.fillStyle = 'rgba(160,130,90,0.35)';
    var beardTop = headCY + Math.round(headR * 0.3);
    var beardBot = headCY + headR + Math.round(5 * S);
    var beardW = Math.round(headR * 0.7);
    ctx.beginPath();
    ctx.moveTo(cx - beardW, beardTop);
    ctx.quadraticCurveTo(cx - beardW, beardBot, cx, beardBot + Math.round(2 * S));
    ctx.quadraticCurveTo(cx + beardW, beardBot, cx + beardW, beardTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(0.7 * S));
    ctx.stroke();

    // --- Robes / mantle (filled, broadest) ---
    var bodyTop = headCY + headR + Math.round(2 * S);
    var bodyBot = topY + halfH;
    var bodyW = Math.round(headR * 2.0);
    ctx.fillStyle = clothFill;
    ctx.beginPath();
    ctx.moveTo(cx - Math.round(headR * 0.6), bodyTop);
    ctx.lineTo(cx - bodyW, bodyBot);
    ctx.lineTo(cx + bodyW, bodyBot);
    ctx.lineTo(cx + Math.round(headR * 0.6), bodyTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();

    // Mantle collar / fur trim accent
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, Math.round(1 * S));
    ctx.beginPath();
    ctx.moveTo(cx - Math.round(headR * 0.8), bodyTop - Math.round(1 * S));
    ctx.quadraticCurveTo(cx, bodyTop + Math.round(3 * S), cx + Math.round(headR * 0.8), bodyTop - Math.round(1 * S));
    ctx.stroke();

    // --- Held item (suit-specific) ---
    ctx.lineWidth = Math.max(1, Math.round(1.2 * S));
    if (card.suit === 0) { // Clubs: sword left
      drawSword(cx - itemOff, itemY, itemH, accent);
    } else if (card.suit === 1) { // Diamonds: axe right
      drawAxe(cx + itemOff, itemY, itemH, accent);
    } else if (card.suit === 2) { // Hearts: sword behind (centered)
      drawSword(cx, itemY - Math.round(2 * S), itemH, accent);
    } else { // Spades: sword right
      drawSword(cx + itemOff, itemY, itemH, accent);
    }
  }

  // --- Main face card orchestrator ---
  function drawFace(x, y, card) {
    var color = SUIT_COLORS[card.suit];
    var cx = x + CARD_W / 2;
    var isRed = card.suit === 1 || card.suit === 2;
    var clothFill = isRed ? 'rgba(140,40,40,0.6)' : 'rgba(60,80,110,0.6)';
    var accent = isRed ? 'rgba(255,180,140,0.9)' : 'rgba(200,220,240,0.9)';

    var portraitTop = y + CARD_H * 0.24;
    var portraitBot = y + CARD_H * 0.76;
    var halfH = (portraitBot - portraitTop) / 2;
    var midY = y + CARD_H * 0.5;

    // --- Top half portrait (clipped) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, CARD_W, CARD_H * 0.5);
    ctx.clip();
    drawPortraitHalf(cx, portraitTop, halfH, card, clothFill, accent);
    ctx.restore();

    // --- Bottom half portrait (rotated 180°, clipped) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + CARD_H * 0.5, CARD_W, CARD_H * 0.5);
    ctx.clip();
    ctx.translate(x + CARD_W, y + CARD_H);
    ctx.rotate(Math.PI);
    // After rotation, the top-left corner of the card is at (0,0)
    drawPortraitHalf(CARD_W / 2, CARD_H * 0.24, halfH, card, clothFill, accent);
    ctx.restore();

    // --- Dividing line with suit symbol in gap ---
    ctx.strokeStyle = 'rgba(60,140,255,0.2)';
    ctx.lineWidth = Math.max(1, Math.round(1 * S));
    var gapW = Math.round(6 * S);
    // Left segment
    ctx.beginPath();
    ctx.moveTo(x + Math.round(3 * S), midY);
    ctx.lineTo(cx - gapW, midY);
    ctx.stroke();
    // Right segment
    ctx.beginPath();
    ctx.moveTo(cx + gapW, midY);
    ctx.lineTo(x + CARD_W - Math.round(3 * S), midY);
    ctx.stroke();
    // Suit symbol in gap
    ctx.font = Math.round(7 * S) + 'px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.fillText(SUITS[card.suit], cx, midY + Math.round(3 * S));
    ctx.globalAlpha = 1.0;
    ctx.textAlign = 'left';
  }

  function drawCard(x, y, card, selected) {
    // Background
    ctx.fillStyle = selected ? '#1e3050' : '#1c2438';
    roundRect(x, y, CARD_W, CARD_H, CARD_R, true);

    // Border
    ctx.strokeStyle = selected ? 'rgba(60,140,255,0.8)' : 'rgba(60,140,255,0.25)';
    ctx.lineWidth = selected ? Math.max(1, Math.round(2 * S)) : 1;
    roundRect(x, y, CARD_W, CARD_H, CARD_R, false, true);

    // Selection glow
    if (selected) {
      ctx.shadowColor = 'rgba(60,140,255,0.4)';
      ctx.shadowBlur = Math.round(8 * S);
      ctx.strokeStyle = 'rgba(60,140,255,0.6)';
      roundRect(x, y, CARD_W, CARD_H, CARD_R, false, true);
      ctx.shadowBlur = 0;
    }

    var color = SUIT_COLORS[card.suit];
    var pad = Math.round(4 * S);

    // Top-left corner index
    ctx.font = 'bold ' + Math.round(11 * S) + 'px Courier New';
    ctx.fillStyle = color;
    ctx.fillText(RANKS[card.rank], x + pad, y + Math.round(13 * S));
    ctx.font = Math.round(10 * S) + 'px serif';
    ctx.fillText(SUITS[card.suit], x + pad, y + Math.round(24 * S));

    // Bottom-right corner index (rotated 180°)
    ctx.save();
    ctx.translate(x + CARD_W, y + CARD_H);
    ctx.rotate(Math.PI);
    ctx.font = 'bold ' + Math.round(11 * S) + 'px Courier New';
    ctx.fillStyle = color;
    ctx.fillText(RANKS[card.rank], pad, Math.round(13 * S));
    ctx.font = Math.round(10 * S) + 'px serif';
    ctx.fillText(SUITS[card.suit], pad, Math.round(24 * S));
    ctx.restore();

    // Card face content
    if (card.rank <= 10) {
      drawPips(x, y, card);
    } else {
      drawFace(x, y, card);
    }
  }

  function drawEmptySlot(x, y) {
    var d = Math.max(2, Math.round(4 * S));
    ctx.setLineDash([d, d]);
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
    ctx.font = 'bold ' + Math.round(48 * S) + 'px Courier New';
    ctx.fillStyle = 'rgba(60,140,255,0.9)';
    ctx.fillText('YOU WIN!', W / 2, H / 2 - Math.round(30 * S));

    ctx.font = Math.round(18 * S) + 'px Courier New';
    ctx.fillStyle = 'rgba(60,140,255,0.85)';
    ctx.fillText('Moves: ' + state.moveCount, W / 2, H / 2 + Math.round(10 * S));
    ctx.fillText('Press N for new game', W / 2, H / 2 + Math.round(40 * S));
    ctx.textAlign = 'left';
  }

  // --- Right-click ---
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function trySendToFreeCell(hit) {
    var card;
    if (hit.zone === 'tab') {
      var pile = state.tableau[hit.col];
      if (pile.length === 0) return false;
      card = pile[pile.length - 1];
    } else {
      return false;
    }
    for (var i = 0; i < 4; i++) {
      if (state.freeCells[i] === null) {
        pushUndo();
        state.tableau[hit.col].pop();
        state.freeCells[i] = card;
        state.moveCount++;
        return true;
      }
    }
    return false;
  }

  function handleRightClick(e) {
    e.preventDefault();
    if (state.gameWon) return;
    if (anims.length > 0) { anims.length = 0; animRunning = false; }
    state.selected = null;
    drag = null;
    var pos = getCanvasCoords(e);
    var hit = hitTest(pos.x, pos.y);
    if (hit && hit.zone === 'tab') {
      if (trySendToFreeCell(hit)) {
        draw();
        return;
      }
    }
    draw();
  }

  // --- Input ---
  canvas.addEventListener('mousedown', function (e) {
    if (e.button === 2) return;
    handleMouseDown(e);
  });
  canvas.addEventListener('mouseup', function (e) {
    if (e.button === 2) { handleRightClick(e); return; }
    handleMouseUp(e);
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button !== 0) return;
    handleMouseUp(e);
  });
  window.addEventListener('mousemove', handleMouseMove);

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

  window.addEventListener('resize', resize);

  // --- Start ---
  resize();
  newGame();
})();
