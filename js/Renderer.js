class Renderer {
	
	constructor() {
	}

	static render() {

	    var ctx = Renderer.getContext();

	    if (ctx !== null) {

	    	for (var z = initialClicks.length; z > 0; z--) {
	        	Renderer.drawTiles(ctx, canvas.width, canvas.height, z);
	    	}

        	Renderer.drawTiles(ctx, canvas.width, canvas.height, 0);
	        Renderer.drawHUD(ctx, canvas.width, canvas.height);
	    }

	}

	static getContext() {
	    var canvas = document.getElementById('canvas');

	    canvas.width = window.innerWidth;
	    canvas.height = window.innerHeight;

	    if (canvas.getContext) {
	        return canvas.getContext('2d');
	    }

	    return null;
	}

 	static drawTiles(renderContext, canvasWidth, canvasHeight, z) { //TODO paralax on z. 

 		var tileDimesion = getTileDimension(z);

	    var left = 0 - (cameraX % tileDimesion);
	    if (left > 0) { left -= tileDimesion; }    //Because JS can't modulo properly 
	    var right = Math.ceil((canvasWidth) / tileDimesion) * tileDimesion;


	    var top = 0 - (cameraY % tileDimesion);
	    if (top > 0) { top -= tileDimesion; } //Because JS can't modulo properly 
	    var bottom = Math.ceil((canvasHeight) / tileDimesion) * tileDimesion;


	    var renderPos = {};
	    renderPos.x = left;
	    renderPos.y = top;

	    while (renderPos.x < right && renderPos.y < bottom) {


	        var tileX = Math.floor((cameraX + renderPos.x) / tileDimesion);
	        var tileY = Math.floor((cameraY + renderPos.y) / tileDimesion);

	        renderTile(renderContext, tileX, tileY, z, renderPos); //TODO integrate z

	        renderPos.x += tileDimesion;
	        if (renderPos.x >= right) {
	            renderPos.x = left;
	            renderPos.y += tileDimesion;
	        }

	    }
	}

	static drawHUD(ctx, canvasWidth, canvasHeight) {

	    var miniDims = Renderer.drawMiniMap(ctx, canvasWidth, canvasHeight);


	    ctx.fillStyle = ('rgba(255,255,255,1)');
	    ctx.fillRect(miniDims.x, miniDims.y - 20, miniDims.width, 20);

	    ctx.strokeText("Bombs? " + getNumFlags(), miniDims.x, miniDims.y - 6);
	    ctx.fillStyle = ('rgba(0,0,0,1)');

	    ctx.fillStyle = ('rgba(0,0,0,1)');
	    ctx.strokeRect(miniDims.x, miniDims.y, miniDims.width, miniDims.height);
	}

	static drawMiniMap(renderContext, canvasWidth, canvasHeight) {

	    var miniHeight = Math.max(canvasHeight / 5);
	    var miniWidth = Math.max(canvasWidth / 5);

	    var tilesOut = (miniWidth / TILE_MINI_DIMENSION) - (canvasWidth / TILE_DIMENSION);
	    var tilesOut = tilesOut / 2;

	    var tilesOutt = (miniHeight / TILE_MINI_DIMENSION) - (canvasHeight / TILE_DIMENSION);
	    var tilesOutt = tilesOutt / 2;

	    var miniCameraX = cameraX * (TILE_MINI_DIMENSION / TILE_DIMENSION) - (tilesOut*TILE_MINI_DIMENSION);
	    var miniCameraY = cameraY * (TILE_MINI_DIMENSION / TILE_DIMENSION) - (tilesOutt*TILE_MINI_DIMENSION);

	    var left = 0 - TILE_MINI_DIMENSION;
	    var right = miniWidth;

	    var top = 0;
	    var bottom = miniHeight;

	    var renderPos = {
	        x: left, 
	        y: top
	    };

	    while (renderPos.x < right && renderPos.y < bottom) {


	        var tileX = Math.floor((miniCameraX + renderPos.x) / TILE_MINI_DIMENSION);
	        var tileY = Math.floor((miniCameraY + renderPos.y) / TILE_MINI_DIMENSION);

	        renderSimpleTile(renderContext, tileX, tileY, 0, {  //TODO git rekt minimap z is here 
	            x: renderPos.x,
	            y: (renderPos.y + canvasHeight - miniHeight)
	        });

	        renderPos.x += TILE_MINI_DIMENSION;
	        if (renderPos.x >= right) {
	            renderPos.x = left;
	            renderPos.y += TILE_MINI_DIMENSION;
	        }

	    }



	    return {x: 0, y: canvasHeight - miniHeight, width: miniWidth, height: miniHeight };
	}

}