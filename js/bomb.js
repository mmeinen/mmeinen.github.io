
class BombMonster {

	constructor(position) {

		this.tentacles = [];
		this.position = position;
		this.speed = 0.5;

		var iterator = 0;

		while(iterator++ < 8) {
			tentacles.push({
				"position": position
			});
		}
	}

	tickTentacles(delta, targetPos) {

		for(var tentacle in this.tentacles) {
			//TODO find place approx 180 degress away 
			//latch onto that. 
			//max tentacle length 30 units. 

			//TODO pathfind

		}

		//TODO move center to mid of tentacles. 


		// TODOOOOO jiggle it. 
	}


	render(ctx) {
		ctx.beginPath();
		ctx.moveTo(0,0);
		ctx.lineTo(300,150);
		ctx.stroke();
	}

};