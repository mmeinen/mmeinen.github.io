
    window.onresize = function(event){
      render();
    };

    window.onload = function(event){
      render();
      var canvas = document.getElementById('canvas');
      canvas.addEventListener("click", clicked);
      canvas.addEventListener("contextmenu", function (event) {
        clicked(event);
        event.preventDefault();
        return false;
      });
    };



    window.onmousedown = function(event) {

      startDrag = true; //TODO fix click vs drag stutter. 
      dragX = event.clientX;
      dragY = event.clientY;
    }

    window.onmousemove = function(event) {
      if (startDrag) {

        if (Math.abs(dragX - event.clientX) > 1 || Math.abs(dragY - event.clientY) > 1) {
          console.log("camera: " + cameraX + "," + cameraY);
          cameraX += (dragX - event.clientX);
          cameraY += (dragY - event.clientY);
          console.log("camera: " + cameraX + "," + cameraY);
          render();

          dragX = event.clientX;
          dragY = event.clientY;
        }
      }

    }

    window.onmouseup = function(event) {
      startDrag = false;
    }

    var cameraX = 0;
    var cameraY = 0;

    var dragX = 0;
    var dragY = 0; 

    var startDrag = false;

    function getContext() {
      var canvas = document.getElementById('canvas');

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;


      if (canvas.getContext) {
        return canvas.getContext('2d');
      }

      return null;
    }

    function drawTiles(renderContext, canvasWidth, canvasHeight) {

      var left = 0 - (cameraX % TILE_DIMENSION);
      if (left > 0) { left -= TILE_DIMENSION; }  //Because JS can't modulo properly 
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

    function drawMiniMap(renderContext, canvasWidth, canvasHeight) {

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

    }

    function render() {

      var ctx = getContext();

      if (ctx !== null) {
        drawTiles(ctx, canvas.width, canvas.height);
        drawMiniMap(ctx, canvas.width, canvas.height)
      }

    }

    function clicked(event) {

      var x = Math.floor((cameraX + event.clientX) / TILE_DIMENSION);
      var y = Math.floor((cameraY + event.clientY) / TILE_DIMENSION);
      var isDirty = false;

      // Left click
      if (event.button === 1 || event.button === 0) {
          isDirty = revealMine(x, y);
      }
      // Right click
      else if (event.button === 2) {
        event.preventDefault();
        isDirty = flagMine(x, y);
      }
      // Middle click
      else if (event.button === 4) {
        //TODO
      }

      if (isDirty) {
        render();
      }
    }







