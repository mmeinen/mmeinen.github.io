
//TODO clean up variable names 
//TODO proper tile art
//TODO title card with my name plus play button
//TODO take some tip cash
//TODO server validation of moves
//TODO server save game state/score
//TODO levels
//TODO game mode platformer. 


var level;

var coolMineData = new Map();

var tileRenderCache = {};


var backgroundImg = new Image();
backgroundImg.src = "images/bg.png";

function createKey(x,y) {
	return x+"#"+y;
}

function determineState(x, y) {

    var key = createKey(x, y);
	if (coolMineData.has(key)) {
	  return coolMineData.get(key);
	}
	return null;
}

function actOnSurrounding(func, x, y) {

	for (var i = (x - 1); i <= (x + 1); i++) {
	  for (var j = (y - 1); j <= (y + 1); j++) {
	    if(i == x && j == y) {
	      continue;
	    }

	    func(i,j);
	  }
	}
}

function revealMine(x,y) {

    var key = createKey(x,y);

    if (coolMineData.has(key)) {
      	return false;
    }

  	if (determineMine(x, y)) {
    	coolMineData.set(key, TILE_BOMB);
    	displayScore();
    	//TODO end state! 
  	}
  	else {
    	coolMineData.set(key, determineNumber(x, y));
	}

    if (coolMineData.get(key) === 0) {
      	actOnSurrounding(revealMine, x, y);
    }

    // Clear rendercache for current and surrounding tiles. 
	delete tileRenderCache[createKey(x,y)];

    actOnSurrounding(function(inX,inY) {
    	delete tileRenderCache[createKey(inX,inY)];
    }, x, y);

    return true;
}

function flagMine(x,y) {

	var key = createKey(x,y);

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

function checkGoal() {

	if (determineState(goalX, goalY) === null) {
		return;
	}

	var searcho = [{x:initialClickX, y:initialClickY}];
	var searched = new Map();
	var found = false;

	while (!found && searcho.length > 0) {

		var pt = searcho.pop();

		actOnSurrounding(function(inX,inY){
			
			var key = createKey(inX, inY);
			if (searched.has(key)) {
				return;
			}

			var state = determineState(inX, inY);

		    if (state !== null && state !== TILE_BOMB && state !== TILE_FLAG) {
	    		if (inX == goalX && inY == goalY) {
	    			found = true;
	    		}

				searcho.push({x:inX, y:inY}); 
		    }

			searched.set(key, true); 

		}, pt.x, pt.y);


	}

	if (found) {
		nextLevel();
	}
}
