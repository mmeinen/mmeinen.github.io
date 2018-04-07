
//TODO clean up variable names 
//TODO paralax background
//TODO proper tile art
//TODO minimap border
//TODO display max bombs cleared in corner for a session
//TODO reset when click on bomb
//TODO title card with my name plus play button
//TODO take some tip cash
//TODO server validation of moves
//TODO server save game state/score
//TODO target to move to
//TODO levels
//TODO game mode platformer. 


var coolMineData = {};

var tileRenderCache = {};



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

	var score = 0;

	for (var key in coolMineData) {
		var places = key.split("#");

		var isMine = determineMine(places[0], places[1]);
		var isFlagged = coolMineData[key] === TILE_FLAG;

		if (isMine && isFlagged) {
			score++;
		}
	}

	alert("you scored " + score);
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
