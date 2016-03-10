'use strict';
var dl = require('datalib'),
    inherits = require('inherits'),
    sg = require('../../../model/signals'),
    Mark = require('./Mark'),
    util = require('../../../util');

var DELTA = sg.DELTA,
    DX = DELTA + '.x',
    DY = DELTA + '.y';

/**
 * @classdesc A Lyra Area Mark Primitive.
 * @see  {@link https://github.com/vega/vega/wiki/Marks#area}
 * @extends {Mark}
 *
 * @constructor
 */
function Area() {
  Mark.call(this, 'area');

  var props = this.properties,
      update = props.update,
      defaults = {
        stroke: {value: '#000000'},
        strokeWidth: {value: 3}
      };

  dl.extend(update, defaults);

  return this;
}

// inherit Mark class' prototype
inherits(Area, Mark);

Area.prototype.initHandles = function() {
  var prop = util.propSg,
      test = util.test,
      at = util.anchorTarget.bind(util, this, 'handles'),
      x = prop(this, 'x'),
      y = prop(this, 'y');

  sg.streams(x, [{
    type: DELTA, expr: test(at(), x + '+' + DX, x)
  }]);

  sg.streams(y, [{
    type: DELTA, expr: test(at(), y + '+' + DY, y)
  }]);

};

Area.prototype.export = function(resolve) {
  var spec = Mark.prototype.export.call(this, resolve);
  if (!spec.from) {
    spec.from = {
      data: 'dummy_data'
    };
    spec.properties.update.x = {
      field: 'foo'
    };
    spec.properties.update.y = {
      field: 'bar'
    };
  }

  delete spec.properties.update.fill;
  delete spec.properties.update.fillOpacity;

  return spec;
};

module.exports = Area;
