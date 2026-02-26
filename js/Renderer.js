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

	        // Bomb flash overlay
	        var bombAnims = getActiveAnimations('bomb-flash');
	        if (bombAnims.length > 0) {
	            var p = bombAnims[0].progress;
	            var flashAlpha = (1 - p) * 0.4;
	            ctx.fillStyle = 'rgba(200,40,20,' + flashAlpha + ')';
	            ctx.fillRect(0, 0, canvas.width, canvas.height);
	        }
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

	    Renderer.drawMiniMap(ctx, canvasWidth, canvasHeight);
	}

	static drawMiniMap(renderContext, canvasWidth, canvasHeight) {

	    var pad = 12;
	    var miniHeight = Math.max(canvasHeight / 5);
	    var miniWidth = Math.max(canvasWidth / 5);
	    var miniX = pad;
	    var miniY = canvasHeight - miniHeight - pad;

	    var tilesOut = (miniWidth / TILE_MINI_DIMENSION) - (canvasWidth / TILE_DIMENSION);
	    tilesOut = tilesOut / 2;

	    var tilesOutt = (miniHeight / TILE_MINI_DIMENSION) - (canvasHeight / TILE_DIMENSION);
	    tilesOutt = tilesOutt / 2;

	    var miniCameraX = cameraX * (TILE_MINI_DIMENSION / TILE_DIMENSION) - (tilesOut*TILE_MINI_DIMENSION);
	    var miniCameraY = cameraY * (TILE_MINI_DIMENSION / TILE_DIMENSION) - (tilesOutt*TILE_MINI_DIMENSION);

	    // Dark panel background
	    renderContext.fillStyle = 'rgba(20,15,10,0.75)';
	    renderContext.fillRect(miniX - 2, miniY - 2, miniWidth + 4, miniHeight + 4);

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
	            x: miniX + renderPos.x,
	            y: miniY + renderPos.y
	        });

	        renderPos.x += TILE_MINI_DIMENSION;
	        if (renderPos.x >= right) {
	            renderPos.x = left;
	            renderPos.y += TILE_MINI_DIMENSION;
	        }

	    }

	    // Gold border
	    renderContext.strokeStyle = 'rgba(180,140,60,0.6)';
	    renderContext.lineWidth = 2;
	    renderContext.strokeRect(miniX - 2, miniY - 2, miniWidth + 4, miniHeight + 4);

	    // Camera viewport indicator
	    var vpScale = TILE_MINI_DIMENSION / TILE_DIMENSION;
	    var vpW = canvasWidth * vpScale;
	    var vpH = canvasHeight * vpScale;
	    var vpX = miniX + (miniWidth / 2) - (vpW / 2);
	    var vpY = miniY + (miniHeight / 2) - (vpH / 2);
	    renderContext.strokeStyle = 'rgba(240,210,120,0.7)';
	    renderContext.lineWidth = 1;
	    renderContext.strokeRect(vpX, vpY, vpW, vpH);
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

        var positionGoalX = goalX * TILE_DIMENSION + TILE_DIMENSION/2;
        var positionGoalY = goalY * TILE_DIMENSION + TILE_DIMENSION/2;

		if(cameraX < positionGoalX &&
		   (cameraX + canvasWidth) > positionGoalX &&
		   cameraY < positionGoalY &&
		   (cameraY + canvasHeight) > positionGoalY) {
			return;
		}

		var b, m;

		var x1 = cameraX + (canvasWidth / 2);
		var x2 = positionGoalX;

		if (x1 == x2) {
			return;
		}

		var y1 = cameraY + (canvasHeight / 2);
		var y2 = positionGoalY;

		if (y1 == y2) {
			return;
		}

		b = (x2*y1 - x1*y2) / (x2 - x1);
		m = (y1 - b) / x1;

		var lineStartX = 0;
		var lineStartY = 0;

		var boxX = positionGoalX < cameraX
				   ? cameraX + (TILE_DIMENSION*0.5)
				   : cameraX + canvasWidth - (TILE_DIMENSION*0.5);
		var boxY = positionGoalY < cameraY
				   ? cameraY + (TILE_DIMENSION*0.5)
				   : cameraY + canvasHeight - (TILE_DIMENSION*0.5);

		var yIntersection = (m * boxX) + b;

		var lineEndY, lineEndX;
		var shiftAmt;

		if (yIntersection > cameraY && yIntersection < (cameraY + canvasHeight)) {
			lineStartX = boxX;
			lineStartY = yIntersection;

			shiftAmt = positionGoalX < cameraX ? TILE_DIMENSION : -TILE_DIMENSION;
			lineEndX = boxX + shiftAmt;
			lineEndY = (lineEndX) * m + b;
		}
		else {
			lineStartX = (boxY - b) / m;
			lineStartY = boxY;

			shiftAmt = positionGoalY < cameraY ? TILE_DIMENSION : -TILE_DIMENSION;
			lineEndY = boxY + shiftAmt;
			lineEndX = (lineEndY - b) / m;
		}

		Renderer.drawArrow(ctx,
						   lineEndX - cameraX,
						   lineEndY - cameraY,
						   lineStartX - cameraX,
						   lineStartY - cameraY);
	}

	static drawArrow(ctx, fromx, fromy, tox, toy){
        var headlen = 16;
        var angle = Math.atan2(toy-fromy, tox-fromx);

        // Pulsing opacity via sine wave
        var pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
        var alpha = 0.6 + 0.4 * pulse;
        var goldBright = 'rgba(240,210,120,' + alpha + ')';
        var goldGlow = 'rgba(200,160,60,' + (alpha * 0.3) + ')';

        // Glow (wide low-alpha stroke)
        ctx.beginPath();
        ctx.moveTo(fromx, fromy);
        ctx.lineTo(tox, toy);
        ctx.strokeStyle = goldGlow;
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Main stroke
        ctx.beginPath();
        ctx.moveTo(fromx, fromy);
        ctx.lineTo(tox, toy);
        ctx.strokeStyle = goldBright;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Filled triangle arrowhead
        ctx.beginPath();
        ctx.moveTo(tox, toy);
        ctx.lineTo(tox - headlen*Math.cos(angle - Math.PI/6), toy - headlen*Math.sin(angle - Math.PI/6));
        ctx.lineTo(tox - headlen*Math.cos(angle + Math.PI/6), toy - headlen*Math.sin(angle + Math.PI/6));
        ctx.closePath();
        ctx.fillStyle = goldBright;
        ctx.fill();
    }

}