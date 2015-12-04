import React from 'react';

var ToolBar = React.createClass({
	
	openBrowser: function openBrowser() {
		//todo open a modal that has the browser contents. Should be cool. 
		
	}
	
	
	render: function render() {
		return (
			<div className="site-toolbar">
				<button onClick={this.openBrowser} > Web Looker </button>
				<h1>I am the footer.</h1>
			</div>
		);
	}
});


module.exports = ToolBar;