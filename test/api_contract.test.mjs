import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSIGHTS_TYPE, SUPPORTED_INSIGHTS_TYPES } from '../src/web/qloo-browser.mjs';
import { BUCKET_QUERIES } from '../src/core/pipeline.mjs';

// Pins the bug class fixed 2026-10-06: the category -> filter.type map
// carried values the hackathon API rejects with HTTP 400
// (urn:entity:music_artist, urn:entity:place:restaurant), and one that is
// accepted but takes 32-46s / 504s on tag-signal requests (urn:entity:place).

test('every mapped filter.type is in the documented supported set', () => {
  for (const [category, type] of Object.entries(INSIGHTS_TYPE)) {
    assert.ok(
      SUPPORTED_INSIGHTS_TYPES.includes(type),
      `category "${category}" maps to unsupported filter.type "${type}"`,
    );
  }
});

test('every bucket category has a filter.type mapping', () => {
  for (const [bucket, categories] of Object.entries(BUCKET_QUERIES)) {
    for (const category of categories) {
      assert.ok(
        INSIGHTS_TYPE[category],
        `bucket "${bucket}" queries category "${category}" with no INSIGHTS_TYPE entry`,
      );
    }
  }
});

test('rejected / unusable type values stay out of the map', () => {
  const values = Object.values(INSIGHTS_TYPE);
  assert.ok(!values.includes('urn:entity:music_artist'), 'music_artist is a 400');
  assert.ok(!values.includes('urn:entity:place:restaurant'), 'place:restaurant is a 400');
  assert.ok(!values.includes('urn:entity:music'), 'urn:entity:music is a 400');
});
