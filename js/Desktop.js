
var React = require('react');

var Toolbar = require("./toolbar")

var Desktop = React.createClass({
	render: function render() {
		//'npm run dev' is the magic
		return (
			<div >
				<div className="page-wrap">
					<h1>I am the main desktop</h1>
				</div>
				<Toolbar />
			</div>
		);
	}
});


module.exports = Desktop;