/* eslint no-unused-expressions: 0 */
'use strict';

require('../scss/app.scss');

// Additional requires to polyfill + browserify package.
require('array.prototype.find');
require('string.prototype.startswith');
require('./transforms');

// Initialize the Redux store
var store = global.store = require('./store');

// Initialize the Model.
var ctrl = global.ctrl = require('./ctrl');

// Set up the listeners that connect the ctrl to the store
var listeners = require('./store/listeners');

// Bind the listener that will flow changes from the redux store into Vega.
store.subscribe(listeners.createStoreListener(store, ctrl));

// Initializes the Lyra ctrl with a new Scene primitive.
var createScene = require('./actions/sceneActions').createScene,
    addPipeline = require('./actions/pipelineActions').addPipeline,
    Mark = require('./store/factory/Mark'),
    addMark = require('./actions/markActions').addMark;

store.dispatch(createScene({
  width: 600,
  height: 600
}));

store.dispatch(addPipeline({
  name: 'cars'
}, {
  name: 'carsjson',
  url:  '/data/cars.json'
}));

store.dispatch(addPipeline({
  name: 'jobs'
}, {
  name: 'jobsjson',
  url:  '/data/jobs.json'
}));

store.dispatch(addPipeline({
  name: 'gapminder'
}, {
  name: 'gapminderjson',
  url:  '/data/gapminder.json'
}));

store.dispatch(addMark(Mark('group', {_parent: 1})));

require('./components');

store.dispatch(require('./actions/historyActions').clearHistory());
