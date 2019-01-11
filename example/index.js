const path = require("path");
const express = require("express");

const app = express();

const resources = require('..').init({dir: path.resolve( __dirname, './resources' ) });

app.use( '/resources', resources.express() );

app.listen( 4000, function( err ){
	if( err ){
		console.warn( err.message );
	}else{
		console.log(`Listening on port 4000`);
	}
} );