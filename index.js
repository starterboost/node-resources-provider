const path = require("path");
const fs = require("fs-extra-promise");
const _ = require("lodash");
const moment = require("moment");
const Promise = require("bluebird");
const md5 = Promise.promisify( require("md5-file") );
const chokidar = require('chokidar');

const DEFAULT_SAVE_CACHE_DELAY = 250;

function IsValidFile( relativePath ){
	return _.includes([
		'.cache.json',
		'.DS_Store',
		'.gitkeep',
	], path.basename( relativePath ) ) ? false : true;
}


function ResourcesProvider( options ){
	this.options = options || {};

	this._saveCount = 0;
	this._changeCount = 0;

	this._onReady = _.isFunction( options.onReady ) ? options.onReady : () => {};
	this._onAdd = _.isFunction( options.onAdd ) ? options.onAdd : () => {};
	this._onUpdate = _.isFunction( options.onUpdate ) ? options.onUpdate : () => {};
	this._onRemove = _.isFunction( options.onRemove ) ? options.onRemove : () => {};

	this._dir = path.resolve( options.dir || '.' );
	this._pathCache = path.resolve( this._dir, '.cache.json' );
	
	this._loadCache()
	.then( () => console.assert( this._resources ) )
	.then( () => this._scanDir() )
	.then( () => {
		return this._changeCount > 0 ? this._saveCache( {delay:0} ) : null
	} )
	.then( () => {
		//start watching the directory for changes
		const watcher = chokidar.watch( this._dir ).on( 'ready', () => {
			//add events to the watcher
			watcher
			.on( 'add', ( file, stat ) => {
				file = path.relative( this._dir, file );
				if( IsValidFile( file ) ){
					//update the file
					this._updateFile(
						file,
						stat
					)
					.then( () => {
						this._saveCache();
					} );
					//console.log('watcher:add', file );
					//notify any listenrs
					this._onAdd( file );
				}

			})
			.on( 'change', ( file, stat ) => {
				file = path.relative( this._dir, file );
				if( IsValidFile( file ) ){
					//this means that the file content have updated
					this._updateFile(
						file,
						stat
					)
					.then( () => {
						this._saveCache();
					} );
					//console.log('watcher:change', file );
					//notify any listenrs
					this._onUpdate( file );
				}
			})
			.on( 'unlink', ( file, stat ) => {
				file = path.relative( this._dir, file );
				if( IsValidFile( file ) ){
					//console.log('watcher:unlink', file );
					this._removeFile( file )
					.then( () => {
						this._saveCache();
					} );
					//notify any listenrs
					this._onRemove( file );
				}
			});
		} );
		//slight delay to allow the watcher to catch up
		Promise.delay( 500 ).then( () => this._onReady() );
	} );
}

ResourcesProvider.prototype._scanDir = function( dir ){
	//list all the files in _resources - tick off files from the register when we pass them
	this._register = _.map( this._resources, resource => resource.path );
	return this._readDir()
	.then( () => {
		//anything not ticked off will be deleted from resources
		return Promise.mapSeries( this._register, item => this._removeFile( item ).catch( err => console.warn( err.message ) ) );
	} );
}

ResourcesProvider.prototype._readDir = function( dir ){
	dir = dir ? path.resolve( this._dir, dir ) : this._dir;
	//read the contents of the directory
	return fs.readdirAsync( dir )
	.then( items => {
		return Promise.mapSeries( items, item => {
			//where are we
			const fullPath = path.resolve( dir, item );
			const relativePath = path.relative( this._dir, fullPath );

			if( !IsValidFile( relativePath ) ){
				//we ignore these files
				return null;
			}

			//remove this from the register
			this._register = _.without( this._register, relativePath );

			const refFile = this.getFile( relativePath );
			//get stat on the item
			return fs.statAsync( fullPath )
			.then( stat => {
				//decide if we need to drill down
				if( stat.isDirectory() ){
					return this._readDir( relativePath );
				}else{
					stat = new Stat( stat );
					//decide if we need to update the reference
					if( !refFile || !Stat.isEqual( stat, refFile.stat ) ){
						//get the hash
						return this._updateFile(
							relativePath
						)
					}
				}

			} );
		});
	} );
}

ResourcesProvider.prototype._updateFile = function( pathToFile, stat ){
	//remove the old reference
	return this._removeFile( pathToFile ).then( file => {
		if( !file ){
			//update the change count as no change associated with removing the file
			this._changeCount++;
		}
		
		return Promise.all([
			//generate the new hash for this file
			md5( path.resolve( this._dir, pathToFile ) ),
			stat ? stat : fs.statAsync( path.resolve( this._dir, pathToFile ) )
		])
		.then( info => {
			let [hash,stat] = info;

			//convert the stat if required
			if( !(stat instanceof Stat) ){
				stat = new Stat( stat );
			}
			//update the file ref
			const data = {hash,stat,path:pathToFile};
			this._resources.push( data );
			return data;
		} );
	} )

}

ResourcesProvider.prototype._removeFile = function( pathToFile ){
	let result = false;
	//remove the reference
	while( true ){
		const file = this.getFile( pathToFile );
		if( file ){
			this._changeCount++;
			this._resources = _.without( this._resources, file );
			result = true;
		}else{
			break;
		}
	}
	return Promise.resolve( result );
}

ResourcesProvider.prototype.getFile = function( pathToFile ){
	return _.find( this._resources, item => {
		return item.path == pathToFile ? true : false;
	}  );
}

ResourcesProvider.prototype.getFiles = function( dir ){
	dir = dir || '';
	
	if( dir.length > 0 && !/\/$/.test( dir ) ){
		//ensure always end in a trailing slash if not an empty string
		dir += '/';
	}
	//find all files in that sub directory - returning just the path
	return _.map( _.filter( this._resources, item => {
		return dir.length == 0 || item.path.indexOf( dir ) == 0 ? true : false;
	} ), item => item.path );
}

ResourcesProvider.prototype._loadCache = function( ){
	//load up the resources
	return fs.existsAsync( this._pathCache )
	.then( exists => {
		if( exists ){
			return fs.readJSONAsync( this._pathCache );
		}else{
			throw new Error('Resource is missing');
		}
	} )
	.catch( err => {
		console.warn( err.message );
		return [];
	} )
	.then( ( resources ) => _.map( resources, resource => {
		resource.stat = Stat.fromJSON( resource.stat );

		return resource;
	} ) )
	.then( ( resources ) => {
		this._resources = resources;
	} );

}

ResourcesProvider.prototype._saveCache = function( options ){
	options = options || {};
	const delay =  _.isNumber( options.delay ) ? options.delay : DEFAULT_SAVE_CACHE_DELAY;
	
	//clear any previous delay
	if( this._saveCacheTimeout ){
		clearTimeout( this._saveCacheTimeout );
		delete this._saveCacheTimeout;
	}

	if( delay > 0 ){
		this._saveCacheTimeout = setTimeout( () => {
			//save again
			this._saveCache( _.merge( options, {delay: 0} ) );
		}, delay );
	}else{
		//console.log(`saveCount ${this._saveCount++}`);
		//write back the resources
		return fs.writeJSONAsync( this._pathCache, this._resources || [] );
	}

}

ResourcesProvider.prototype.express = function( options ){
	
	const app = require("express")();
	app.get( '/', ( req, res, next ) => {
		res.send( this._resources );
	} );

	app.use( ( req, res, next ) => {
		const pathToFile = req.path.replace(/^\//,'');
		const file = this.getFile( pathToFile );
		if( file ){
			res.sendFile( path.resolve(this._dir,file.path) );
		}else{
			next();
		}
	} )

	return app;
}

function Stat( data ){
	data = data || {};
	//copy over select properties
	_.each( Stat.PROPS_DEFAULT, prop => {
		this[prop] = data[prop];
	} );
	
	//copy over select properties converted to moment data object
	_.each( Stat.PROPS_DATE, prop => {
		this[prop] = moment(data[prop]);
	} );
}

Stat.PROPS_DEFAULT = ['size'];
Stat.PROPS_DATE = ['mtime'];

Stat.fromJSON = function( data ){
	return new Stat( data );
}

Stat.isEqual = function( a, b ){

	return _.every(
		[
			//ensure we have all the data we need
			_.every( [a,b], stat => stat ? true : false ),
			//compare the dates
			_.every( Stat.PROPS_DATE, prop => {
				return (a[prop]).isSame( b[prop] )
			} ),
			//compare the basic props
			_.every( Stat.PROPS_DEFAULT, prop => {
				return a[prop] == b[prop] ? true : false;
			} )
		]
	);
	
}


module.exports = {
	ResourcesProvider,
	init : ( options ) => {
		return new ResourcesProvider( options );
	}
}
