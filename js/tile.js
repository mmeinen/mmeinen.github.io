

var seed;

const TILE_DIMENSION = 40;
const TILE_MINI_DIMENSION = 2;

const TILE_BOMB = -1;
const TILE_FLAG = -2;

var bombSheet = new Image();
bombSheet.src = "images/tile_set.png";
var castleSheet = new Image();
castleSheet.src = "images/tile_castle_grey.png";


// This lets us add and get a unique value for combination set.
var TOP = 1;
var LEFT = 2;
var RIGHT = 4;
var BOTTOM = 8;

//TODO we will need a texture set that takes into account all 9 possible configurations. 
var CASTLE_PIECES = [
	{x: 32,  y: 64}, // 0  = nothing
	{x: 32,  y: 32}, // 1  = top
	{x: 0,   y: 64}, // 2  = left
	{x: 0,   y: 32}, // 3  = top + left
	{x: 64,  y: 64}, // 4  = right
	{x: 64,  y: 32}, // 5  = top + right
	{x: 97,  y: 64}, // 6  = left + right
	{x: 97,  y: 32}, // 7  = top + left + right
	{x: 160, y: 0 }, // 8  = bottom
	{x: 160, y: 32}, // 9  = bottom + top
	{x: 128, y: 0 }, // 10 = bottom + left
	{x: 128, y: 32}, // 11 = bottom + top + left
	{x: 192, y: 0 }, // 12 = bottom + right
	{x: 192, y: 32}, // 13 = bottom + top + right
	{x: 128, y: 64}, // 14 = bottom + left + right TODO this doesn't exist!
	{x: 128, y: 64}, // 15 = bottom + top + left + right
];

//TODO we will need a texture set that takes into account all 9 possible configurations. 
var BG_CASTLE_PIECES = [
	{x: 64,  y: 256}, // 0  = nothing
	{x: 64,  y: 224}, // 1  = top
	{x: 160, y: 256}, // 2  = left
	{x: 160, y: 224}, // 3  = top + left
	{x: 192, y: 256}, // 4  = right
	{x: 192, y: 224}, // 5  = top + right
	{x: 64,  y: 256}, // 6  = left + right
	{x: 64,  y: 256}, // 7  = top + left + right
];

var WINDOW = {x: 320, y:192};

function renderTile(ctx, x, y, z, renderPt) {

    var state = determineState(x, y, z);
    var tileDimension = getTileDimension(z);

    if (state === null || state === TILE_FLAG) {
		var castle = determineCastle(x, y, z);
		ctx.drawImage(castleSheet, castle.x, castle.y, 32, 32, 
			renderPt.x, renderPt.y, tileDimension, tileDimension);   
    }

    if (state !== null) {

	    if (state === TILE_BOMB) {
			ctx.drawImage(bombSheet, 193, 65, 15, 15, 
				renderPt.x, renderPt.y, tileDimension, tileDimension);
	    }
	    else if (state === TILE_FLAG) {
			ctx.drawImage(castleSheet, 389, 453, 21, 21, 
				renderPt.x, renderPt.y, tileDimension, tileDimension);
	    }
	    else if (state !== 0) {
	    	var bgCastle = determineBgCastle(x, y, z);
			ctx.drawImage(castleSheet, bgCastle.x, bgCastle.y, 32, 32, 
				renderPt.x, renderPt.y, tileDimension, tileDimension);


	    	ctx.font = "26px Bookman";
		    ctx.strokeStyle = 'black';
		    ctx.lineWidth = 2;
	        ctx.strokeText(state,renderPt.x+15,renderPt.y+32);
		    ctx.fillStyle = 'white';
	        ctx.strokeText(state,renderPt.x+15,renderPt.y+32);
	    }
	    else {
	 		return;
	    }
    }
}


// Used in minimap rendering!
function renderSimpleTile(ctx, x, y, z, renderPt) {

    var state = determineState(x, y, z);

    if (state !== null) {
 		ctx.fillStyle = ('rgba(255,255,255,1)');
    }
    else {
      	ctx.fillStyle = ('rgba(200,0,0,1)');
  	}

    ctx.fillRect(renderPt.x, renderPt.y, TILE_MINI_DIMENSION, TILE_MINI_DIMENSION);
}

function determineCastle(x, y, z) {

	var cacheKey = createKey(x, y, z);
	if (tileRenderCache.hasOwnProperty(cacheKey)) {
		return tileRenderCache[cacheKey];
	}

	var index = 0;

	actOnSurrounding(function(inX, inY, inZ){

		// Exclude the corners
		if (inX !== x && inY !== y) {
			return;
		}
		//TODO if there is only corners than we need to know that. 

		var state = determineState(inX, inY, inZ);

	    if (state !== null && state > 0) {
	    	if (inX < x) {
	      		index += LEFT;
	    	}
	    	else if (inX > x) {
	    		index += RIGHT;
	    	}
	    	else if (inY < y) {
	    		index += TOP;
	    	}
	    	else if (inY > y) {
	    		index += BOTTOM;
	    	}
	    }

	}, x, y, z);

	tileRenderCache[cacheKey] = CASTLE_PIECES[index];
	return tileRenderCache[cacheKey];
}

function determineBgCastle(x, y, z) {

	var cacheKey = createKey(x, y, z);
	if (tileRenderCache.hasOwnProperty(cacheKey)) {
		return tileRenderCache[cacheKey];
	}

	var index = 0;

	actOnSurrounding(function(inX, inY, inZ){

		// Exclude the corners
		if (inX !== x && inY !== y) {
			return;
		}
		//TODO if there is only corners than we need to know that. 

		var state = determineState(inX, inY, inZ);

	    if (state === 0) {
	    	if (inX < x) {
	      		index += LEFT;
	    	}
	    	else if (inX > x) {
	    		index += RIGHT;
	    	}
	    	else if (inY < y) {
	    		index += TOP;
	    	}
	    }

	}, x, y, z);

	tileRenderCache[cacheKey] = BG_CASTLE_PIECES[index];
	return tileRenderCache[cacheKey];
}

function determineNumber(x, y, z) { //TODO cache result, map

	var number = 0;

	actOnSurrounding(function(inX, inY, inZ){
	    if (determineMine(inX, inY, inZ)) {
	      number++;
	    }

	}, x, y, z);

	return number;
}

function determineMine(x, y, z) {

	var initialX = initialClicks[z][0];
	var initialY = initialClicks[z][1];
	if (initialX - 1 <= x && initialX + 1 >= x && 
		initialY - 1 < y && initialY + 1 > y) {
		return false;
	}

	var str = x + seed + y + "yolo" + z;

	var hash = parseInt(hex_md5(str));

	return hash % 5 == 0;
}

function getTileDimension(z) {
	return TILE_DIMENSION - (z * 4); //TODO dynamic based on viewport
}