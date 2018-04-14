
//TODO clean up variable names 
//TODO proper tile art
//TODO title card with my name plus play button
//TODO take some tip cash
//TODO server validation of moves
//TODO server save game state/score
//TODO target to move to
//TODO levels
//TODO game mode platformer. 


var level;

var coolMineData = {};

var tileRenderCache = {};


var backgroundImg = new Image();
backgroundImg.src = "images/bg.png";

function determineState(x,y) {
    var key = x+"#"+y;
	if (coolMineData.hasOwnProperty(key)) {
	  return coolMineData[key];
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

    var key = x+"#"+y;

    if (coolMineData.hasOwnProperty(key)) {
      	return false;
    }

  	if (determineMine(x, y)) {
    	coolMineData[key] = TILE_BOMB;
    	displayScore();
    	//TODO end state! 
  	}
  	else {
    	coolMineData[key] = determineNumber(x, y);
	}

    if (coolMineData[key] === 0) {
      	actOnSurrounding(revealMine, x, y);
    }

    // Clear rendercache for current and surrounding tiles. 
	delete tileRenderCache[x+"#"+y];

    actOnSurrounding(function(inX,inY) {
    	delete tileRenderCache[inX+"#"+inY];
    }, x, y);

    return true;
}

function flagMine(x,y) {

	var key = x+"#"+y;

    if (coolMineData.hasOwnProperty(key)){
    	if (coolMineData[key] === TILE_FLAG) {
	      	delete coolMineData[key];
	      	return true;
	    }
    }
    else {
	    coolMineData[key] = TILE_FLAG;
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
		for (var key in coolMineData) {
			if (coolMineData[key] === TILE_FLAG) {
				numFlags++;
			}
		}
		numFlagsDirty = false;
	}


	return numFlags;
}

function checkGoal() {

	//TODO this is slow. fix it. 
	//TODO goal cannot be a mine!


	if (determineState(goalX, goalY) === null) {
		return;
	}

	//TODO start at startx
	var searcho = [{x:initialClickX, y:initialClickY}];
	var searched = [];
	var found = false;

	while (!found && searcho.length > 0) {

		var pt = searcho.pop();

		actOnSurrounding(function(inX,inY){
			
			if (searched.indexOf(inX + "#" + inY) != -1) {
				return;
			}

			var state = determineState(inX, inY);

		    if (state !== null && state !== TILE_BOMB && state !== TILE_FLAG) {
	    		if (inX == goalX && inY == goalY) {
	    			found = true;
	    		}

				searcho.push({x:inX, y:inY}); 
		    }

			searched.push(pt.x + "#" + pt.y); 

		}, pt.x, pt.y);


	}

	if (found) {
		nextLevel();
	}
	//see if start and goal are connected
}
