// Shared Qloo response shapes: the single source of truth for
// category -> filter.type mapping and for the fields we are allowed to
// surface from an Insights response.
//
// Both transports (src/web/qloo-browser.mjs and src/qloo/client.mjs) import
// from here so the browser demo, the CLI and the tests cannot drift apart.

// Bucket query category -> Insights filter.type.
//
// Values must come from the developer guide's "Supported Entity Types" list
// (artist, book, brand, destination, movie, person, place, podcast, tv_show,
// video_game). Two values an earlier revision of this map carried are
// REJECTED by the hackathon API with HTTP 400:
//   urn:entity:music_artist      -> use urn:entity:artist
//   urn:entity:place:restaurant  -> not a supported filter.type at all
// Timing note (measured 2026-10-06): urn:entity:place answers ENTITY-signal
// requests in 1-2s but TAG-signal requests in 32-46s (and 504s), which is
// why recommend() always signals with an entity id.
export const INSIGHTS_TYPE = {
  brands: 'urn:entity:brand',
  music: 'urn:entity:artist',
  podcasts: 'urn:entity:podcast',
  dining: 'urn:entity:place',
  travel: 'urn:entity:destination',
};

// The full documented set, kept so the contract test can pin the map.
export const SUPPORTED_INSIGHTS_TYPES = [
  'urn:entity:artist',
  'urn:entity:book',
  'urn:entity:brand',
  'urn:entity:destination',
  'urn:entity:movie',
  'urn:entity:person',
  'urn:entity:place',
  'urn:entity:podcast',
  'urn:entity:tv_show',
  'urn:entity:video_game',
];

// Evidence must come from the API, never be invented: only fields the
// response actually carries are surfaced — missing evidence stays missing.
export function evidenceFor(entity) {
  const explain = entity?.query?.explainability ?? entity?.explainability;
  const evidence = {};
  const correlated =
    explain?.correlated_categories ??
    entity?.properties?.correlated_categories ??
    entity?.correlated_categories;
  if (Array.isArray(correlated) && correlated.length) {
    evidence.correlated_categories = correlated;
  }
  const overlap = explain?.audience_overlap ?? entity?.properties?.audience_overlap;
  if (overlap !== undefined && overlap !== null) evidence.audience_overlap = overlap;
  return Object.keys(evidence).length ? evidence : null;
}

// Normalize an Insights entity list into the lead shape the pipeline ranks.
export function entitiesToLeads(entities, category) {
  return (Array.isArray(entities) ? entities : [])
    .map((entity) => ({
      name: entity?.name,
      affinity: entity?.affinity ?? entity?.query?.affinity ?? 0,
      category,
      evidence: evidenceFor(entity),
    }))
    .filter((lead) => lead.name);
}

// Normalize a /search hit list.
export function normalizeEntities(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      name: row?.name,
      entity_id: row?.entity_id,
      types: row?.types ?? [],
    }))
    .filter((row) => row.entity_id && row.name);
}

// Normalize a tag hit list (/v2/tags or `qloo api tags`).
export function compactTag(tag) {
  if (!tag || typeof tag !== 'object') return undefined;
  return {
    id: tag.id ?? tag.tag_id,
    name: tag.name,
    category: tag.category ?? tag.type,
    type: tag.type ?? tag.subtype,
    popularity: tag.popularity,
  };
}
