#!/usr/bin/env /usr/local/bin/node

'use strict';

const https = require( 'https' );
const fs = require( 'fs' );

const ACCESS_TOKEN = ''; // here put your access token
const CLIENT_ID = ''; // here put your client id

const args = process.argv.slice( 2 );

const DEFAULT_HTTP_OPTIONS = {
	host: 'a.wunderlist.com',
	path: '/api/v1/lists',
	headers: {
		'X-Access-Token': args[ 0 ] || ACCESS_TOKEN,
		'X-Client-ID': args[ 1 ] || CLIENT_ID
	}
};

const COLORS = {
	RESET: '\x1b[0m',
	RED: '\x1b[31m',
	YELLOW: '\x1b[33m'
};

Date.prototype.monthNames = [
	"January", "February", "March",
	"April", "May", "June",
	"July", "August", "September",
	"October", "November", "December"
];

Date.prototype.daysNames = [ '周日', '周一', '周二', '周三', '周四', '周五', '周六' ];

Date.prototype.getMonthName = function() {
	return this.monthNames[ this.getMonth() ];
};

Date.prototype.getShortMonthName = function() {
	return this.getMonthName().substr( 0, 3 );
};

Date.prototype.getDayName = function() {
	return this.daysNames[ this.getDay() ];
};

Date.prototype.getShortDayName = function() {
	return this.getDayName().substr( 0, 3 );
};

Date.prototype.toShortFormatDate = function() {
	return ` -- ${this.getMonth()}月${this.getDate()}日 (${this.getDayName()})`;
	return `${this.getShortDayName()}, ${this.getDate()} ${this.getShortMonthName()}`;
};

const _result = Symbol( 'result' );
const _printFunc = Symbol( 'printFunc' );

class OutputBuilder {
	constructor( printFunc ) {
		this[ _result ] = '';
		this[ _printFunc ] = printFunc;
	}

	/**
	 * Returns output.
	 *
	 * @returns {String}
	 */
	get result() {
		return this[ _result ];
	}

	/**
	 * Adds string to output and adds new line to the end.
	 *
	 * @param {String} line
	 *
	 * @returns {OutputBuilder}
	 */
	addLine( line, color = null ) {
		this[ _result ] += this._addColor( line + ' \n', color );

		return this;
	}

	/**
	 * Adds empty line.
	 *
	 * @returns {OutputBuilder}
	 */
	addSeparator() {
		this.addLine( '' );

		return this;
	}

	/**
	 * Prints result.
	 */
	print() {
		this[ _printFunc ]( this.result );
	}

	/**
	 * Adds color to string.
	 *
	 * @private
	 * @param {String} line
	 * @param {String} color
	 * @returns {String}
	 */
	_addColor( line, color ) {
		if ( !color ) {
			return line;
		}

		return color + line + COLORS.RESET;
	}
}

const TEMP_PATH = '/tmp/';

class FileCache {
	/**
	 * Saves information in file.
	 *
	 * @param {String} fileName
	 * @param {Object} value
	 * @returns {Promise}
	 */
	static saveValue( fileName, value ) {
		return new Promise( ( resolve, reject ) => {
			const path = TEMP_PATH + fileName;

			value = JSON.stringify( value );

			fs.writeFile( path, value, ( err ) => {
				if ( err ) {
					return reject( err );
				}

				resolve();
			} );
		} );
	}

	/**
	 * Returns object from cache file.
	 *
	 * @param {String} fileName
	 * @returns {Promise.<Object>}
	 */
	static getValue( fileName ) {
		return new Promise( ( resolve, reject ) => {
			fs.readFile( `${TEMP_PATH}${fileName}`, 'utf8', ( err, data ) => {
				if ( err ) {
					return reject( err );
				}

				resolve( JSON.parse( data ) );
			} );
		} );
	}
}

class Task {
	constructor( task ) {
		this.id = task.id;
		this.title = task.title;
		this.starred = task.starred;
		this.due_date = task.due_date;
	}

	/**
	 * Returns formatted due date.
	 *
	 * @returns {String}
	 */
	get formattedDueDate() {
		return this.due_date ? new Date( this.due_date ).toShortFormatDate() : '';
	}

	/**
	 * Returns information whether a task is after the deadline.
	 *
	 * @returns {Boolean}
	 */
	get isAfterDeadline() {
		return this.daysToTask !== null && this.daysToTask <= 0;
	}

	/**
	 * Returns information about the number of days to task.
	 *
	 * @returns {Number}
	 */
	get daysToTask() {
		if ( !this.due_date ) {
			return null;
		}

		const dueDate = new Date( this.due_date );
		dueDate.setHours( 0, 0, 0, 0 );

		const now = new Date();
		now.setHours( 0, 0, 0, 0 );

		return Math.round( (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) );
	}

	/**
	 * Converts task to string.
	 *
	 * @returns {string}
	 */
	toString() {
		return `  ${this.starred ? '*' : ' '}  ${this.title}  ${this.formattedDueDate} ${this.isAfterDeadline ? '(过期 ' +
		Math.abs( this.daysToTask ) + ' 天)' : ' ' }`;
	}
}

class WunderlistGeekTool {
	/**
	 * Gets data and displays them.
	 */
	run() {
		const output = new OutputBuilder( console.log );

		this._getListsWithTasks()
			.then( ( lists ) => {
				for ( const list of lists.filter( list => list.tasks.length ) ) {
					output.addLine( `${list.title} ( ${list.tasks.length} )` );

					for ( const task of list.tasks ) {
						let lineColor = null;

						if ( task.starred ) {
							lineColor = COLORS.YELLOW;
						}

						if ( task.isAfterDeadline ) {
							lineColor = COLORS.RED;
						}

						output.addLine( task.toString(), lineColor );
					}
				}
				output.addSeparator();
				output.addSeparator();
				output.addLine( '更新于:  ' + (new Date()).toString().substr(16,8) );
				output.print();

				FileCache.saveValue( 'output', {
					result: output.result,
					date: new Date()
				} );
			} )
			.catch( ( err ) => {
				if ( err[ 'invalid_request' ] ) {
					output.addLine( 'Invalid Request. It is possible that lack of data - Access Token or Client Id' ).addSeparator();
				}

				FileCache.getValue( 'output' )
					.then( ( data ) => {
						if ( data ) {
							output.addLine( data.result )
								.addSeparator()
								.addLine( `Information from cache ( ${new Date( data.date ).toUTCString()} )` );

							output.print();
						}
					} );
			} );
	}

	/**
	 * Returns lists.
	 *
	 * @private
	 * @returns {Promise.<Array.<List>>}
	 */
	_getLists() {
		return HttpHelper.get( '/api/v1/lists' )
			.then( ( lists ) => {
				return lists;
			} );
	}

	/**
	 * Returns lists with included tasks.
	 *
	 * @private
	 * @returns {Promise.<Array.<List>>}
	 */
	_getListsWithTasks() {
		return this._getLists().then( ( lists ) => {
			const getAllTasks = [];

			for ( const list of lists ) {
				getAllTasks.push( new Promise( ( resolve ) => {
					this._getTasksForList( list.id )
						.then( ( tasks ) => {
							list.tasks = tasks;
							resolve();
						} );
				} ) );
			}

			return Promise.all( getAllTasks )
				.then( () => lists );
		} );
	}

	/**
	 * Returns lists order.
	 *
	 * @private
	 * @returns {Promise.<Array.<Number>>}
	 */
	_getListsOrder() {
		return HttpHelper.get( '/api/v1/list_positions' )
			.then( ( res ) => res[ 0 ].values );
	}

	/**
	 * Return tasks for list.
	 *
	 * @private
	 * @param {Number} listId
	 * @returns {Promise.<Array.<Task>>}
	 */
	_getTasksForList( listId ) {
		return HttpHelper.get( `/api/v1/tasks?list_id=${listId}` )
			.then( ( tasks ) => {
				const results = [];

				for ( const task of tasks ) {
					results.push( new Task( task ) );
				}
				return results;

				
			} );
	}

	/**
	 * Returns tasks order.
	 *
	 * @private
	 * @param {Number} listId
	 * @returns {Promise.<Array.<Number>>}
	 */
	_getTasksOrder( listId ) {
		return HttpHelper.get( `/api/v1/task_positions?list_id=${listId}` )
			.then( ( res ) => res[ 0 ].values );
	}
}

class HttpHelper {
	/**
	 * Sends request to Wunderlist API.
	 *
	 * @param {String} path
	 * @returns {Promise.<*>}
	 */
	static get( path ) {
		return new Promise( ( resolve, reject )=> {
			const options = Object.assign( {}, DEFAULT_HTTP_OPTIONS );
			options.path = path;

			https.get( options, ( res ) => {
				let body = '';

				res.on( 'data', ( chunk ) => {
					body += chunk;
				} );

				res.on( 'end', () => {
					const response = JSON.parse( body );

					if ( response[ 'invalid_request' ] ) {
						return reject( response );
					}

					resolve( response );
				} );

				res.on( 'error', ( err ) => reject( err ) );

				res.on( 'timeout', () => reject() );
			} );
		} );
	}
}

new WunderlistGeekTool().run();

/**
 * @typedef {Object} List
 * @property {Number} id
 * @property {Date} created_at
 * @property {String} title
 */

/**
 * @typedef {Object} ListWithTasks
 * @property {Number} id
 * @property {Date} created_at
 * @property {String} title
 * @property {Array.<Task>} tasks
 */

/**
 * @typedef {Object} Task
 * @property {Number} id
 * @property {Date} created_at
 * @property {Date} due_date
 * @property {String} title
 * @property {Boolean} starred
 */
