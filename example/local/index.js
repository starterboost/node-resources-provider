const path = require("path");
const fs = require("fs-extra-promise");
const express = require("express");
const Promise = require("bluebird");

const PORT = 4000;
const DIR = path.resolve( __dirname, './resources' );
//make sure the directory exists
fs.ensureDirSync( DIR );
fs.removeSync( path.resolve(DIR,'a') );

const app = express();

//the resouces provider will keep track of changes in $DIR
const resources = require('../..').init({
	dir: DIR,
	onReady : function(){
		console.log('onReady', resources.getFiles() );
		//create some content additions/changes
		Promise.mapSeries([
			{path:'a/test.txt'},
			{path:'a/b/test.txt'},
			{path:'a/c/test.txt'},
			{path:'a/b/test.txt'},
		], file => {
			//create the file
			const pathFull = path.resolve( DIR, file.path );
			return fs.ensureDirAsync( path.dirname( pathFull ) )
			.then( () => fs.writeFileAsync( pathFull, file.path ) )
			.then( () => Promise.delay( 1000 ) )
		} )
		//wait as the changes won't be detected immediately
		.then( () => Promise.delay( 500 ) )
		.then( () => {
			//log the final state
			console.log('onComplete', resources.getFiles() );
			//log the final state in a specific directory
			console.log('onComplete', resources.getFiles('a/b') );
		} );

	},
	onAdd : function( file ){
		console.log('onAdd', file );
	},
	onUpdate : function( file ){
		console.log('onUpdate', file );
	},
	onRemove : function( file ){
		console.log('onRemove', file );
	}
});

app.use( '/resources', resources.express() );

//start listening
app.listen( PORT, function( err ){
	if( err ){
		console.warn( err.message );
	}else{
		console.log(`Listening on port ${PORT}`);
	}
} );