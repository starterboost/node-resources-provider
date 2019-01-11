# Node Resources Provider

A utility that watches a directory tree for changes. This has the option to be wrapped up in an Express Module to make it easy for clients to query the current state and determine which files need to be downloaded/deleted to sync state.

# Create a Resource Provider

```
const path = require("path");
const DIR = path.resolve( __dirname, './resources' );

//the resouces provider will keep track of changes in $DIR
const resources = require('node-resources').init({
	dir: DIR,
	onReady : function(){
		//list all the files in the directory
		console.log('onReady', resources.getFiles() );
	},
	onAdd : function( file ){
		//called when a file is added
		console.log('onAdd', file );
	},
	onUpdate : function( file ){
		//called when a file is modified
		console.log('onUpdate', file );
	},
	onRemove : function( file ){
		//called when a file is removed
		console.log('onRemove', file );
	}
});

```

# Retrieve a File by path

```
resources.getFile('a/test.txt')
```

# Retrieve all Files

```
resources.getFiles()
```

# Retrieve all Files within a directory

```
resources.getFiles('a')
```

# Expose Resources to Express requests

```
app.use( '/resources', resources.express() );
```

Making the HTTP request '/resources' will return all the files

Making the HTTP request '/resources/$pathToFile' will return the file