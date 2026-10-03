import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLead, rankLeads, isCompetitor } from '../src/rank/leads.mjs';
import { pitchFor, caveatBlock, affinityLabel } from '../src/pitch/pitch.mjs';

test('toLead normalizes fields', () => {
  const l = toLead({ name: 'X', affinity: 0.5, category: 'music' }, 'brand_collab');
  assert.equal(l.name, 'X');
  assert.equal(l.affinity, 0.5);
  assert.equal(l.bucket, 'brand_collab');
});

test('isCompetitor matches same category', () => {
  assert.equal(isCompetitor({ category: 'alcoholic_drinks' }, 'alcoholic_drinks'), true);
  assert.equal(isCompetitor({ category: 'music' }, 'alcoholic_drinks'), false);
  assert.equal(isCompetitor({ category: 'music' }, undefined), false);
});

test('rankLeads filters competitors and sorts by affinity', () => {
  const leads = [
    toLead({ name: 'Competitor', affinity: 0.95, category: 'alcoholic_drinks' }, 'brand_collab'),
    toLead({ name: 'High', affinity: 0.8, category: 'music' }, 'artist_influencer'),
    toLead({ name: 'Low', affinity: 0.3, category: 'dining' }, 'event_venue'),
  ];
  const ranked = rankLeads(leads, { subjectCategory: 'alcoholic_drinks' });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].name, 'High');
  assert.equal(ranked[1].name, 'Low');
  assert.equal(ranked[0].rank, 1);
});

test('rankLeads respects perBucket cap', () => {
  const leads = Array.from({ length: 15 }, (_, i) =>
    toLead({ name: `L${i}`, affinity: 0.5 + i * 0.01, category: 'music' }, 'artist_influencer'),
  );
  const ranked = rankLeads(leads, { perBucket: 5 });
  assert.equal(ranked.length, 5);
});

test('affinityLabel bands', () => {
  assert.equal(affinityLabel(0.85), 'very strong');
  assert.equal(affinityLabel(0.65), 'strong');
  assert.equal(affinityLabel(0.45), 'moderate');
  assert.equal(affinityLabel(0.1), 'emerging');
});

test('pitch cites evidence and disclaims causality', () => {
  const lead = toLead(
    { name: 'Tyler', affinity: 0.84, category: 'music', evidence: { correlated_categories: ['music'], audience_overlap: 71 } },
    'artist_influencer',
  );
  const p = pitchFor(lead, { name: 'Mezcal' });
  assert.match(p, /Mezcal/);
  assert.match(p, /Tyler/);
  assert.match(p, /0\.84/);
  assert.match(p, /not individual behavior or a causal link/);
});

test('caveatBlock covers key limits', () => {
  const c = caveatBlock({ name: 'Mezcal' });
  assert.match(c, /aggregate group-level/);
  assert.match(c, /not a causal claim/);
  assert.match(c, /Mezcal/);
});
