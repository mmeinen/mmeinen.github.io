

const TILE_DIMENSION = 50;
const TILE_MINI_DIMENSION = 2;

const TILE_BOMB = -1;
const TILE_FLAG = -2;

class tile {
	
	constructor(x, y, state) {
		this.x = x;
		this.y = y;
		this.state = state;
	}

	
	render(ctx) {

	}
};



function renderTile(ctx, x, y, renderPt) {

    var state = determineState(x, y);

    if (state !== null) {
	    ctx.font = "14px Arial";

	    if (state === TILE_BOMB) {
	        ctx.strokeText("B",renderPt.x+25,renderPt.y+25);
      		ctx.fillStyle = ('rgba(255,0,0,0.8)');
	    }
	    else if (state === TILE_FLAG) {
	        ctx.strokeText("F",renderPt.x+25,renderPt.y+25);
      		ctx.fillStyle = ('rgba(0,200,0,0.5)');

	    }
	    else if (state !== 0) {
	        ctx.strokeText(state,renderPt.x+25,renderPt.y+25);
      		ctx.fillStyle = ('rgba(200,0,0,0.3)');
	    }
	    else {
	 		ctx.fillStyle = ('rgba(0,0,0,0)');
	    }
    }
    else {
      	ctx.fillStyle = ('rgba(200,0,0,0.8)');
  	}

    ctx.fillRect(renderPt.x, renderPt.y, TILE_DIMENSION, TILE_DIMENSION);
    

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

	return hash % 6 == 0;
}
