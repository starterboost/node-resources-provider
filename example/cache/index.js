const path = require("path");
const fs = require("fs-extra-promise");
const express = require('express');

const PORT = 3000;
const DIR = path.resolve( __dirname, './resources' );
const URL_SERVER = 'http://localhost:4000';/** ADD THE URL OF YOUR RESOURCE PROVIDER HERE*/
//make sure the directory exists
fs.ensureDirSync( DIR );

//create server instance
const app = express();

//the resouces provider will keep track of changes in $DIR
const cache = require('../..').cache({
	dir : DIR,
	url : URL_SERVER,
	pathToCache : '/cache'
});

cache.sync().then( () => {
	console.log('completed');
} );

//configure the server
app.use( express.static( DIR ) );

//start listening
app.listen( PORT, function( err ){
	if( err ){
		console.warn( err.message );
	}else{
		console.log(`Listening on port ${PORT}`);
	}
} );
