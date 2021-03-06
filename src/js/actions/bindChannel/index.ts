import {MarkType, Spec} from 'vega';
import {compile as vlCompile} from 'vega-lite';
import {Channel} from 'vega-lite/src/channel';
import {ChannelDef} from 'vega-lite/src/channeldef';
import {InlineData} from 'vega-lite/src/data';
import {NormalizedUnitSpec, TopLevelUnitSpec} from 'vega-lite/src/spec/unit';
import {batchGroupBy} from '../../reducers/historyOptions';
import {LyraVegaLiteSpec, Mark, MarkRecord} from '../../store/factory/Mark';
import duplicate from '../../util/duplicate';
import {setVlUnit} from '../markActions';
import cleanupUnused from './cleanupUnused';
import parseData from './parseData';
import parseGuides from './parseGuides';
import parseMarks from './parseMarks';
import parseScales from './parseScales';
import updateAggregateDependencies from './aggregateDependencies';

const AGGREGATE_OPS = require('../../constants/aggregateOps'),
  getInVis = require('../../util/immutable-utils').getInVis,
  dsUtils = require('../../util/dataset-utils');

// Vega mark types to Vega-Lite mark types.
const TYPES = {
  rect: 'bar',
  symbol: 'circle',
  text: 'text',
  line: 'line',
  area: 'area'
};

export const CELLW = 517, CELLH = 392;

export interface CompiledBinding {
  input: TopLevelUnitSpec,
  output: Spec,
  map: any,
  mark: MarkRecord,
  markId: number,
  markType: MarkType,
  property: string,
  channel: Channel,
  dsId: number,
  plId: number;
}

/**
 * Async action creator that binds the given field to the given mark's property.
 * In particular, a Vega-Lite specification is constructed and parsed to trigger
 * updates across the entire store (e.g., instantiating new data transforms,
 * scales, and guides).
 *
 * @param  {number} dsId     The ID of the dataset that contains the given field.
 * @param  {Object} field    A field schema object.
 * @param  {number} markId   The ID of the mark whose property will be bound.
 * @param  {string} property The name of the property to bind.
 * @returns {Function}       Async action function.
 */
export default function bindChannel(dsId: number, field, markId: number, property: string) {
  return function(dispatch, getState) {
    const state = getState(),
      mark: MarkRecord = getInVis(state, 'marks.' + markId),
      markType = mark.type,
      spec = vlSpec(mark),
      mapping = map(spec),
      channel = channelName(property),
      plId = getInVis(state, 'datasets.' + dsId + '._parent');

    const from = mark.from;
    if (from && from.data) {
      if (getInVis(state, `datasets.${from.data}._parent`) !== plId) {
        throw Error('Mark and field must be from the same pipeline.');
      }
    }

    // Though we dispatch multiple actions, we want bindChannel to register as
    // only a single state change to the history from the user's perspective.
    batchGroupBy.start();

    spec.encoding[channel] = channelDef(field);

    const parsed = compile(spec, property, dsId);
    parsed.map = mapping;
    parsed.mark = mark;
    parsed.markId = markId;
    parsed.markType = markType;
    parsed.property = property;
    parsed.channel = channel;
    parsed.dsId = dsId;
    parsed.plId = plId;
    parseData(dispatch, state, parsed);
    parseScales(dispatch, state, parsed);
    parseMarks(dispatch, state, parsed);

    // TODO:
    // if (parsed.map.data.summary) {
    //   updateAggregateDependencies(dispatch, getState(), parsed);
    // }

    // At this point, we know enough to clean up any unused scales and
    // data sources. We do this here (rather than in the ctrl) to (1) avoid
    // unnecessary re-renders triggered by deleting primitives and (2) to get
    // the most accurate guide orientation as possible.
    cleanupUnused(dispatch, state);

    parseGuides(dispatch, getState(), parsed);

    dispatch(setVlUnit(spec, markId));
    batchGroupBy.end();
  };
}

/**
 * Compiles a Vega-Lite specification, and returns the resultant Vega spec for
 * further analsis. The current mark's dataset's values are embedded in the VL
 * spec, and config values are supplied to be able to account for VL
 * idiosyncracies.
 *
 * @param   {Object} spec     A Vega-Lite specification.
 * @param   {string} property The Lyra channel being bound.
 * @param   {number} dsId     The ID of the dataset that backs the current mark.
 * @returns {Object}          An object containing the Vega and Vega-Lite specs.
 */
function compile(spec: LyraVegaLiteSpec, property: string, dsId: number): CompiledBinding {
  spec = duplicate(spec);

  // Always drive the Vega-Lite spec by a pipeline's source dataset.
  // We analyze the resultant Vega spec to understand what this mark's
  // backing dataset should actually be (source, aggregate, etc.).
  (spec.data as InlineData).values = dsUtils.output(dsId);

  // Supply custom cell width/heights to be able to differentiate hardcoded
  // scale ranges generated by Vega-Lite.
  spec.config.view = {
    width: CELLW,
    height: CELLH
  };

  // Force marks to be filled, if we're binding to the fill color property.
  spec.config.mark = {filled: property === 'fill'};

  return {
    input: spec,
    output: vlCompile(spec).spec
  } as CompiledBinding;
}

/**
 * Constructs a Vega-Lite specification, or returns a previously created one,
 * for the given mark.
 *
 * @param  {Mark} mark A mark definition from the store.
 * @returns {Object} A Vega-Lite specification.
 */
function vlSpec(mark: MarkRecord): LyraVegaLiteSpec {
  return mark._vlUnit || {
    mark: TYPES[mark.type],
    data: {values: []},
    encoding: {},
    config: {}
  };
}

/**
 * Builds/returns a mapping of primitive names found in a mark's Vega-Lite
 * specification and the corresponding IDs of the primitives in Lyra.
 *
 * @param  {Object} vlUnit A Vega-Lite unit spec for the mark.
 * @returns {Object} A mapping object, stored in a private key in the vlUnit.
 */
function map(vlUnit) {
  return (
    vlUnit._lyraMap ||
    (vlUnit._lyraMap = {
      data: {},
      scales: {},
      axes: {},
      legends: {},
      marks: {}
    })
  );
}

/**
 * Returns the Vega-Lite encoding channel name for the given Vega mark property.
 * @param   {string} name A Vega mark property.
 * @returns {string}      A Vega-Lite encoding channel.
 */
export function channelName(name: string): Channel {
  //  We don't use Vega-Lite's x2/y2 channels because a user may bind them
  //  first in Lyra which Vega-Lite does not expect.
  switch (name) {
    case 'x':
    case 'x+':
    case 'x2':
    case 'width':
      return 'x';
    case 'y':
    case 'y+':
    case 'y2':
    case 'height':
      return 'y';
    case 'fill':
    case 'stroke':
      return 'color';
    case 'text':
    case 'detail':
      return name;
  }
}

const re = {
  agg: new RegExp('^(' + AGGREGATE_OPS.join('|') + ')_(.*?)$'),
  bin: new RegExp('^(bin)_(.*?)(_start|_mid|_end)$')
};

/**
 * Constructs a Vega-Lite channel definition. We test to see if the field
 * represents an aggregated or binned field. If it does, we strip out
 * the corresponding aggregate/bin prefix via a RegExp, and instead set
 * the `aggregate` or `bin` keywords necessary for Vega-Lite.
 *
 * @private
 * @memberOf rules
 * @param  {Object} field A field schema object.
 * @returns {Object} A Vega-Lite channel definition.
 */
function channelDef(field): ChannelDef {
  const name = field.name,
    agg = field.aggregate,
    bin = field.bin,
    ref: ChannelDef = {type: field.mtype};
  let res;

  if (agg || (res = re.agg.exec(name))) {
    ref.aggregate = res ? res[1] : agg;
  } else if (bin || (res = re.bin.exec(name))) {
    ref.bin = true;
  }

  ref.field = res ? res[2] : name;
  return ref;
}
