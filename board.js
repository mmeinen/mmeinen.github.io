


var coolMineData = {};


function determineState(x,y) {
	if (coolMineData.hasOwnProperty(x+"-"+y)) {
	  return coolMineData[x+"-"+y];
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

    if (coolMineData.hasOwnProperty(x+"-"+y)) {
      	return false;
    }

  	if (determineMine(x, y)) {
    	coolMineData[x + "-" +  y] = TILE_BOMB;
  	}
  	else {
    	coolMineData[x + "-" +  y] = determineNumber(x, y);
	}

    if (coolMineData[x + "-" +  y] === 0) {
      	actOnSurrounding(revealMine, x, y);
    }

    return true;
}

function flagMine(x,y) {

    if (coolMineData.hasOwnProperty(x+"-"+y) && coolMineData[x + "-" +  y] === TILE_FLAG) {
      	delete coolMineData[x + "-" +  y];
      	return true;
    }
    else {
	    coolMineData[x + "-" +  y] = TILE_FLAG;
	    return true;
	}

	return false;
}
