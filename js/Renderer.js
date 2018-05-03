class Renderer {
	
	constructor() {
	}

	static render() {

	    var ctx = Renderer.getContext();

	    if (ctx !== null) {
	        Renderer.drawBg(ctx, canvas.width, canvas.height);
	        Renderer.drawTiles(ctx, canvas.width, canvas.height);
	        Renderer.drawHUD(ctx, canvas.width, canvas.height);
	        Renderer.drawGotoArrow(ctx, canvas.width, canvas.height);
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

 	static drawTiles(renderContext, canvasWidth, canvasHeight) {

	    var left = 0 - (cameraX % TILE_DIMENSION);
	    if (left > 0) { left -= TILE_DIMENSION; }    //Because JS can't modulo properly 
	    var right = Math.ceil((canvasWidth) / TILE_DIMENSION) * TILE_DIMENSION;


	    var top = 0 - (cameraY % TILE_DIMENSION);
	    if (top > 0) { top -= TILE_DIMENSION; } //Because JS can't modulo properly 
	    var bottom = Math.ceil((canvasHeight) / TILE_DIMENSION) * TILE_DIMENSION;


	    var renderPos = {};
	    renderPos.x = left;
	    renderPos.y = top;

	    while (renderPos.x < right && renderPos.y < bottom) {


	        var tileX = Math.floor((cameraX + renderPos.x) / TILE_DIMENSION);
	        var tileY = Math.floor((cameraY + renderPos.y) / TILE_DIMENSION);

	        renderTile(renderContext, tileX, tileY, renderPos);

	        renderPos.x += TILE_DIMENSION;
	        if (renderPos.x >= right) {
	            renderPos.x = left;
	            renderPos.y += TILE_DIMENSION;
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

	        renderSimpleTile(renderContext, tileX, tileY, { 
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

	static drawBg(ctx, canvasWidth, canvasHeight) {

	    var bgWidth = 320;
	    var bgHeight = 256;

	    var paralaxRatio = 4;

	    var left = 0 - ((cameraX/paralaxRatio) % bgWidth);
	    if (left > 0) { left -= bgWidth; }    //Because JS can't modulo properly 
	    var right = Math.ceil((canvasWidth) / bgWidth) * bgWidth;


	    var top = 0 - ((cameraY/paralaxRatio) % bgHeight);
	    if (top > 0) { top -= bgHeight; } //Because JS can't modulo properly 
	    var bottom = Math.ceil((canvasHeight) / bgHeight) * bgHeight;


	    var renderPos = {};
	    renderPos.x = left;
	    renderPos.y = top;

	    while (renderPos.x < right && renderPos.y < bottom) {

	        //if (y is odd, flip.)
	        ctx.drawImage(backgroundImg, 0, 0, bgWidth, bgHeight, 
	            renderPos.x, renderPos.y,  bgWidth, bgHeight); 

	        renderPos.x += bgWidth;
	        if (renderPos.x >= right) {
	            renderPos.x = left;
	            renderPos.y += bgHeight;
	        }

	    }
	}

	static drawGotoArrow(ctx, canvasWidth, canvasHeight) {

		// Check if goal is on screen 
		// TODO include HUD in this check

        var positionGoalX = goalX * TILE_DIMENSION + TILE_DIMENSION/2;
        var positionGoalY = goalY * TILE_DIMENSION + TILE_DIMENSION/2;

		if(cameraX < positionGoalX &&
		   (cameraX + canvasWidth) > positionGoalX &&
		   cameraY < positionGoalY &&
		   (cameraY + canvasHeight) > positionGoalY) {
			return;
		}

		//todo find our y = mx + b variables. 

		var b, m;

		var x1 = cameraX + (canvasWidth / 2);
		var x2 = positionGoalX;

		// Check vertical line case
		if (x1 == x2) {
			//TODO
			return;
		}

		var y1 = cameraY + (canvasHeight / 2);
		var y2 = positionGoalY;

		// horizontal line case
		if (y1 == y2) {
			//TODO
			return;
		}

		b = (x2*y1 - x1*y2) / (x2 - x1);
		m = (y1 - b) / x1;


		// Temp positions
		var lineStartX = 0;
		var lineStartY = 0;

		// Check if we look at top or bottom line. 
		var boxX = positionGoalX < cameraX 
				   ? cameraX + (TILE_DIMENSION*0.5)
				   : cameraX + canvasWidth - (TILE_DIMENSION*0.5);
		var boxY = positionGoalY < cameraY 
				   ? cameraY + (TILE_DIMENSION*0.5)
				   : cameraY + canvasHeight - (TILE_DIMENSION*0.5);


		//Check if we are on the X edge
		var yIntersection = (m * boxX) + b;

		var lineEndY, lineEndX;
		shiftAmt *= 5;

		if (yIntersection > cameraY && yIntersection < (cameraY + canvasHeight)) {
			//We intersect with y axis! 
			lineStartX = boxX;
			lineStartY = yIntersection;

			var shiftAmt = positionGoalX < cameraX ? TILE_DIMENSION : -TILE_DIMENSION;
			lineEndX = boxX + shiftAmt;
			lineEndY = (lineEndX) * m + b;
		}
		else {
			lineStartX = (boxY - b) / m;
			lineStartY = boxY;

			var shiftAmt = positionGoalY < cameraY ? TILE_DIMENSION : -TILE_DIMENSION;
			lineEndY = boxY + shiftAmt;
			lineEndX = (lineEndY - b) / m;
		}


		Renderer.drawArrow(ctx, 
						   lineEndX - cameraX, 
						   lineEndY - cameraY, 
						   lineStartX - cameraX, 
						   lineStartY - cameraY);

		// ctx.beginPath();
		// ctx.moveTo(lineStartX - (cameraX), lineStartY - (cameraY));
     	// ctx.lineTo(lineEndX - (cameraX), lineEndY - (cameraY));

		// ctx.moveTo(positionGoalX - (cameraX), positionGoalY - (cameraY));
  // 		ctx.lineTo((canvasWidth/2), (canvasHeight/2));


	    // ctx.strokeStyle = 'green';
	    // ctx.lineWidth = 10;
	    // ctx.stroke();
	}

// Stolen straight outta stack overflow, why re-invent the wheel? 
// https://stackoverflow.com/questions/808826/draw-arrow-on-canvas-tag
	static drawArrow(ctx, fromx, fromy, tox, toy){
                var headlen = 10;

                var angle = Math.atan2(toy-fromy,tox-fromx);

                //starting path of the arrow from the start square to the end square and drawing the stroke
                ctx.beginPath();
                ctx.moveTo(fromx, fromy);
                ctx.lineTo(tox, toy);
                ctx.strokeStyle = "#cc0000";
                ctx.lineWidth = 10;
                ctx.stroke();

                //starting a new path from the head of the arrow to one of the sides of the point
                ctx.beginPath();
                ctx.moveTo(tox, toy);
                ctx.lineTo(tox-headlen*Math.cos(angle-Math.PI/7),toy-headlen*Math.sin(angle-Math.PI/7));

                //path from the side point of the arrow, to the other side point
                ctx.lineTo(tox-headlen*Math.cos(angle+Math.PI/7),toy-headlen*Math.sin(angle+Math.PI/7));

                //path from the side point back to the tip of the arrow, and then again to the opposite side point
                ctx.lineTo(tox, toy);
                ctx.lineTo(tox-headlen*Math.cos(angle-Math.PI/7),toy-headlen*Math.sin(angle-Math.PI/7));

                //draws the paths created above
                ctx.strokeStyle = "#cc0000";
                ctx.lineWidth = 10;
                ctx.stroke();
                ctx.fillStyle = "#cc0000";
                ctx.fill();
            }

}