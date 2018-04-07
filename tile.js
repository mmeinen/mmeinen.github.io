

const TILE_DIMENSION = 40;
const TILE_MINI_DIMENSION = 2;

const SPRITE_DIMENSION = 15;

const TILE_BOMB = -1;
const TILE_FLAG = -2;

var spriteSheet = new Image();
spriteSheet.src = "images/tile_set.png";

function renderTile(ctx, x, y, renderPt) {

    var state = determineState(x, y);

    var spriteX = 16;
    var spriteY = 0;

    if (state !== null) {
	    ctx.font = "14px Arial";

	    if (state === TILE_BOMB) {
			ctx.drawImage(spriteSheet, 193, 65, SPRITE_DIMENSION, SPRITE_DIMENSION, 
				renderPt.x, renderPt.y, TILE_DIMENSION, TILE_DIMENSION);
	    }
	    else if (state === TILE_FLAG) {
			ctx.drawImage(spriteSheet, 176, 80, SPRITE_DIMENSION, SPRITE_DIMENSION, 
				renderPt.x, renderPt.y, TILE_DIMENSION, TILE_DIMENSION);
	    }
	    else if (state !== 0) {

			ctx.drawImage(spriteSheet, 0, 0, SPRITE_DIMENSION, SPRITE_DIMENSION, 
				renderPt.x, renderPt.y, TILE_DIMENSION, TILE_DIMENSION);

	        ctx.strokeText(state,renderPt.x+25,renderPt.y+25);
      		ctx.fillStyle = ('rgba(200,0,0,0.3)');
	    }
	    else {
	 		return;
	    }
    }
    else {
		ctx.drawImage(spriteSheet, spriteX, spriteY, SPRITE_DIMENSION, SPRITE_DIMENSION, 
			renderPt.x, renderPt.y, TILE_DIMENSION, TILE_DIMENSION);   
	}

    ctx.fillStyle = ('rgba(0,0,0,1)');
    ctx.strokeRect(renderPt.x, renderPt.y, TILE_DIMENSION, TILE_DIMENSION);
      
}

function renderSimpleTile(ctx, x, y, renderPt) {

    var state = determineState(x, y);

    if (state !== null) {
 		ctx.fillStyle = ('rgba(255,255,255,1)');
    }
    else {
      	ctx.fillStyle = ('rgba(200,0,0,1)');
  	}

    ctx.fillRect(renderPt.x, renderPt.y, TILE_MINI_DIMENSION, TILE_MINI_DIMENSION);
}

function determineNumber(x, y) { //TODO cache result, map

	var number = 0;

	actOnSurrounding(function(inX,inY){
	    if (determineMine(inX, inY)) {
	      number++;
	    }

	}, x, y);

	return number;
	}

function determineMine(x, y) { //TODO cache result, map 
	var str = x + "coolseed" + y

	var hash = parseInt(hex_md5(str));

	return hash % 5 == 0;
}
