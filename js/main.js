
var React = require('react');
var ReactDOM = require('react-dom');
var Desktop = require('./Desktop');

main();

function main() {
    ReactDOM.render(<Desktop />, document.getElementById('app'));
}
