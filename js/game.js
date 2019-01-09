
/*

T O D O 

Handle tile clicks per layer
Remove areas that are solved

spacebar implementation 



better art
    tint layers
    classic tile set. 

What's the goal? 



*/



window.onresize = function(event){
    Renderer.render();
};

window.onload = function(event){

    ui = new UI();
    
    startGame();

    ui.openWelcome(true);

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

var ui; 

var cameraX = 0;
var cameraY = 0;

var initialClicks = [];

var dragX = 0;
var dragY = 0; 

var startDrag = false;
var watchDrag = false;

function startGame() {
    ui.openWelcome(false);
    level = 0;
    nextLevel();
}

function nextLevel() {

    level++;
    seed = "seed" + Math.random() + "seed";
    coolMineData = new Map();    
    tileRenderCache = [];
    numFlagsDirty = true;

    initialClicks = [];
    Renderer.render();
}

function clicked(event, z = 0) {

    var tileDimension = getTileDimension(z);

    var x = Math.floor((cameraX + event.clientX) / tileDimension);
    var y = Math.floor((cameraY + event.clientY) / tileDimension);
    var isDirty = false;
    var isMaxDepth = false;

    if (!(z in initialClicks)) {
        initialClicks[z] = [x, y];
        isMaxDepth = true;
    }

    // Left click
    if (event.button === 1 || event.button === 0) {
        isDirty = revealMine(x, y, z);
    }
    // Right click
    else if (event.button === 2) {
        event.preventDefault();
        isDirty = flagMine(x, y, z);
        numFlagsDirty = true;
    }
    // Middle click
    else if (event.button === 4) {
        //TODO
    }

    if (!isDirty && !isMaxDepth) {
        clicked(event, ++z);
    } 
    else if (isDirty) {
        Renderer.render();
    }
}