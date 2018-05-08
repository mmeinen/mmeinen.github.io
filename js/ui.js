class UI {


	constructor() {
		this.createWelcomeDialog();
		this.createClickShield();
	}

	createWelcomeDialog() {

		this.welcomeDialog = document.createElement("div");
		this.welcomeDialog.setAttribute("id", "ui");

  		var title = document.createElement("h1");
  		title.innerHTML = "Meinen Sweeper";
		this.welcomeDialog.appendChild(title);

  		var tutorial = document.createElement("p");
  		tutorial.innerHTML = "Clear a path to the next level. See how far you can go.";
		this.welcomeDialog.appendChild(tutorial);

  		var btnStart = document.createElement("input");
  		btnStart.setAttribute("id", "btnStart");
  		btnStart.setAttribute("type", "button");
  		btnStart.setAttribute("value", "Start Game");
  		btnStart.onclick = startGame;
		this.welcomeDialog.appendChild(btnStart);

  		var credit = document.createElement("p");
  		credit.innerHTML = "By Matthew Meinen matthewjmeinen@gmail.com";
		this.welcomeDialog.appendChild(credit);

		document.getElementById("body").appendChild(this.welcomeDialog);
	}

	createClickShield() {
		this.clickShield = document.createElement("div");
		this.clickShield.setAttribute("id", "clickShield");
	}

	openWelcome(open) {
		this.welcomeDialog.style.display = open ? "block" : "none";
		this.clickShield.style.display = open ? "block" : "none";
	}
}