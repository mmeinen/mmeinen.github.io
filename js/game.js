// --- Animation System ---
var animations = [];
var animLoopRunning = false;

function queueAnimation(type, duration, data, onComplete) {
    animations.push({
        type: type,
        startTime: performance.now(),
        duration: duration,
        data: data || {},
        onComplete: onComplete || null
    });
    if (!animLoopRunning) {
        animLoopRunning = true;
        requestAnimationFrame(animLoop);
    }
}

function animLoop(timestamp) {
    var still = [];
    for (var i = 0; i < animations.length; i++) {
        var a = animations[i];
        var elapsed = timestamp - a.startTime;
        if (elapsed >= a.duration) {
            if (a.onComplete) a.onComplete();
        } else {
            still.push(a);
        }
    }
    animations = still;
    Renderer.render();
    if (animations.length > 0) {
        requestAnimationFrame(animLoop);
    } else {
        animLoopRunning = false;
    }
}

function getActiveAnimations(type) {
    var now = performance.now();
    var result = [];
    for (var i = 0; i < animations.length; i++) {
        var a = animations[i];
        if (a.type === type) {
            var progress = Math.min((now - a.startTime) / a.duration, 1);
            result.push({ progress: progress, data: a.data });
        }
    }
    return result;
}

window.onresize = function(event){
    Renderer.render();
};

window.onload = function(event){

    startGame();

    var canvas = document.getElementById('canvas');
    canvas.addEventListener("click", clicked);
    canvas.addEventListener("contextmenu", function (event) {
        clicked(event);
        event.preventDefault();
        return false;
    });

    var playAgainBtn = document.getElementById('msPlayAgain');
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', function() {
            startGame();
        });
    }

    window.addEventListener('keydown', function(event) {
        if (event.code === 'Space') {
            event.preventDefault();
            if (gameOver || isNaN(hoverTileX) || isNaN(hoverTileY)) return;

            var state = determineState(hoverTileX, hoverTileY);
            var isDirty = false;

            if (state === null || state === TILE_FLAG) {
                // Unrevealed or flagged — toggle flag
                isDirty = flagMine(hoverTileX, hoverTileY);
                numFlagsDirty = true;
                updateHUD();
            } else if (state > 0) {
                // Revealed numbered tile — chord reveal adjacent
                isDirty = chordReveal(hoverTileX, hoverTileY);
            }

            if (isDirty) {
                Renderer.render();
                checkGoal();
            }
        }
    });
};


window.onmousedown = function(event) {

    watchDrag = true;
    dragX = event.clientX;
    dragY = event.clientY;
}

window.onmousemove = function(event) {
    if (startDrag) {

        if (Math.abs(dragX - event.clientX) > 1 || Math.abs(dragY - event.clientY) > 1) {
            cameraX += (dragX - event.clientX);
            cameraY += (dragY - event.clientY);
            Renderer.render();

            dragX = event.clientX;
            dragY = event.clientY;
        }
    }

    if (watchDrag && (Math.abs(dragX - event.clientX) > 5 || Math.abs(dragY - event.clientY) > 5)) {

        startDrag = true;
        watchDrag = false;

        dragX = event.clientX;
        dragY = event.clientY;
    }

    // Hover tracking
    var newHX = Math.floor((cameraX + event.clientX) / TILE_DIMENSION);
    var newHY = Math.floor((cameraY + event.clientY) / TILE_DIMENSION);
    if (newHX !== hoverTileX || newHY !== hoverTileY) {
        hoverTileX = newHX;
        hoverTileY = newHY;
        if (!startDrag) Renderer.render();
    }
}

window.onmouseup = function(event) {
    startDrag = false;
    watchDrag = false;
}

window.onmouseout = function(event) {
    if (!event.relatedTarget) {
        hoverTileX = NaN;
        hoverTileY = NaN;
        Renderer.render();
    }
}

var cameraX = 0;
var cameraY = 0;
var gameOver = false;
var hoverTileX = NaN;
var hoverTileY = NaN;

var initialClickX = NaN;
var initialClickY = NaN;

var goalX = NaN;
var goalY = NaN;

var dragX = 0;
var dragY = 0; 

var startDrag = false;
var watchDrag = false;
var arrowPulseTimer = null;

function startArrowPulse() {
    if (arrowPulseTimer) return;
    arrowPulseTimer = setInterval(function() {
        if (!animLoopRunning && !isNaN(goalX)) {
            Renderer.render();
        }
    }, 50);
}

function stopArrowPulse() {
    if (arrowPulseTimer) {
        clearInterval(arrowPulseTimer);
        arrowPulseTimer = null;
    }
}

function updateHUD() {
    var levelEl = document.getElementById('msLevel');
    var flagsEl = document.getElementById('msFlags');
    if (levelEl) levelEl.textContent = 'LEVEL ' + level;
    if (flagsEl) flagsEl.innerHTML = '&#9873; ' + getNumFlags();
}

function showLevelBanner() {
    var banner = document.getElementById('msBanner');
    var text = document.getElementById('msBannerText');
    if (!banner || !text) { nextLevel(); return; }
    text.textContent = 'LEVEL ' + level + ' COMPLETE';
    banner.style.display = '';
    banner.style.animation = 'none';
    banner.offsetHeight; // reflow
    banner.style.animation = 'ms-banner-fade 2s ease-in-out forwards';
    setTimeout(function() {
        banner.style.display = 'none';
        nextLevel();
    }, 2000);
}

function startGame() {
    gameOver = false;
    var overlay = document.getElementById('msOverlay');
    if (overlay) overlay.style.display = 'none';
    level = 0;
    nextLevel();
}

function nextLevel() {

    level++;
    seed = "seed" + Math.random() + "seed";
    coolMineData = new Map();    
    tileRenderCache = [];
    numFlagsDirty = true;

    initialClickX = NaN;
    initialClickY = NaN;
    goalX = NaN;
    goalY = NaN;
    updateHUD();
    Renderer.render();
}

function clicked(event) {

    if (gameOver) return;

    var x = Math.floor((cameraX + event.clientX) / TILE_DIMENSION);
    var y = Math.floor((cameraY + event.clientY) / TILE_DIMENSION);
    var isDirty = false;

    if (isNaN(initialClickX) || isNaN(initialClickY)) {
        initialClickX = x;
        initialClickY = y;
        setGoal();
    }

    // Left click
    if (event.button === 1 || event.button === 0) {
        isDirty = revealMine(x, y);
    }
    // Right click
    else if (event.button === 2) {
        event.preventDefault();
        isDirty = flagMine(x, y);
        numFlagsDirty = true;
        updateHUD();
    }
    // Middle click
    else if (event.button === 4) {
        //TODO
    }

    if (isDirty) {
        Renderer.render();
        checkGoal();
    }
}

function setGoal() {

    var distance = 10 + level * 5;
    var directionRad = Math.random()*2 * Math.PI;

    goalX = Math.ceil(distance * Math.sin(directionRad));
    goalY = Math.ceil(distance * Math.cos(directionRad));
    startArrowPulse();
}