
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

}

window.onmouseup = function(event) {
    startDrag = false;
    watchDrag = false;
}

var cameraX = 0;
var cameraY = 0;

var initialClickX = NaN;
var initialClickY = NaN;

var goalX = NaN;
var goalY = NaN;

var dragX = 0;
var dragY = 0; 

var startDrag = false;
var watchDrag = false;

function startGame() {
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
    Renderer.render();
}

function clicked(event) {

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
    goalY = Math.ceil(distance * Math.cos(directionRad))
;}