
var path = require('path');

var config = {
  entry: path.resolve(__dirname, 'js/main.js'),
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js'
  },
  module: {
    loaders: [{
      test: /\.jsx?$/, // A regexp to test the require path. accepts either js or jsx
	  exclude: /(node_modules|bower_components)/,
      loader: 'babel', // The module to load. "babel" is short for "babel-loader"
      query:
		{
			presets:['react']
		} 
    }]
  }
};

module.exports = config;