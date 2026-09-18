const str = {type: 'string'}, strings = {type: 'array', items: str};
const enumeration = values => ({type: 'string', enum: values});
const object = properties => ({type: 'object', properties, required: Object.keys(properties), additionalProperties: false});
const array = items => ({type: 'array', items});
export const SCALE_SCHEMAS = {
  scalePlan: object({mode: enumeration(['empirical','descriptive']), reason: str,
    workstreams: array(object({family: str, parentNodeId: str, question: str, falsifier: str,
      priority: enumeration(['critical','high','normal'])}))}),
  scaleExtract: object({questions: array(object({proposition: str, falsifier: str, scope: str,
    yes: str, no: str, family: str, parentNodeId: str, priority: enumeration(['critical','high','normal']),
    sourceFit: enumeration(['direct','indirect','uncertain','contradictory']),
    references: array(object({sourceId: str, quote: str}))})), gaps: strings}),
  scaleReview: object({id: str, status: enumeration(['accepted','needs_evidence','rejected']), reason: str})
};
