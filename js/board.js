

var level;

var coolMineData = new Map();

var tileRenderCache = {};


var backgroundImg = new Image();
backgroundImg.src = "images/bg.png";

function createKey(x, y, z) {
	return x+"yolo"+y+"swag"+z;
}

function determineState(x, y, z) {

    var key = createKey(x, y, z);
	if (coolMineData.has(key)) {
	  return coolMineData.get(key);
	}
	return null;
}

function actOnSurrounding(func, x, y, z) {

	for (var i = (x - 1); i <= (x + 1); i++) {
	  for (var j = (y - 1); j <= (y + 1); j++) {
	    if(i == x && j == y) {
	      continue;
	    }

	    func(i,j,z);
	  }
	}
}

function revealMine(x, y, z) {

    var key = createKey(x, y, z);

    if (coolMineData.has(key)) {
      	return false;
    }

  	if (determineMine(x, y, z)) {
    	coolMineData.set(key, TILE_BOMB);
    	displayScore();
    	//TODO end state! 
  	}
  	else {
    	coolMineData.set(key, determineNumber(x, y, z));
	}

    if (coolMineData.get(key) === 0) {
      	actOnSurrounding(revealMine, x, y, z);
    }

    // Clear rendercache for current and surrounding tiles. 
	delete tileRenderCache[createKey(x, y, z)];

    actOnSurrounding(function(inX, inY, inZ) {
    	delete tileRenderCache[createKey(inX, inY, inZ)];
    }, x, y, z);

    return true;
}

function flagMine(x, y, z) {

	var key = createKey(x, y, z);

    if (coolMineData.has(key)){
    	if (coolMineData.get(key) === TILE_FLAG) {
	      	delete coolMineData.delete(key);
	      	return true;
	    }
    }
    else {
	    coolMineData.set(key, TILE_FLAG);
	    return true;
	}

	return false;
}

function displayScore() {

	var result = confirm("you got to level " + level + ". Play again?");
	if (result) {
		startGame();
	}
}

var numFlagsDirty;
var numFlags = 0;
function getNumFlags() {
	
	if (numFlagsDirty) {
		numFlags = 0;
		coolMineData.forEach(function(key, value) {
			if (value === TILE_FLAG) {
				numFlags++;
			}
		});
		numFlagsDirty = false;
	}


	return numFlags;
}