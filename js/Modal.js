

var Modal = React.createClass({
	propTypes: {
		// You can declare that a prop is a specific JS primitive. By default, these
		// are all optional.
		// optionalArray: React.PropTypes.array,
		// optionalBool: React.PropTypes.bool,
		// optionalFunc: React.PropTypes.func,
		// optionalNumber: React.PropTypes.number,
		// optionalObject: React.PropTypes.object,
		// optionalString: React.PropTypes.string,
		closed: React.PropTypes.bool,
		onClose: React.PropTypes.func,
	},
		
    render: function() {
        if (this.props.closed) {
			return (<div/>);
		}
		
		return (
		<div>
		<button onClick={this.props.onClose}> Clowse me </button>
		{this.props.children}
		</div>);
    }
});