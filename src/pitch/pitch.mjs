// Pitch generator: one short, evidence-grounded paragraph per lead.
//
// Deliberately template-based (no LLM call): the hackathon docs reward
// provenance and clearly-labeled limits, and a template makes the Qloo
// evidence in every sentence auditable. An LLM polish pass can sit on top
// later without changing the data flow.

const BUCKET_FRAMING = {
  brand_collab: (lead) => `a brand collaboration with ${lead.name}`,
  artist_influencer: (lead) => `an artist/influencer partnership with ${lead.name}`,
  event_venue: (lead) => `an event or venue activation around ${lead.name}`,
};

export function affinityLabel(affinity) {
  if (affinity >= 0.8) return 'very strong';
  if (affinity >= 0.6) return 'strong';
  if (affinity >= 0.4) return 'moderate';
  return 'emerging';
}

export function pitchFor(lead, subject) {
  const framing = (BUCKET_FRAMING[lead.bucket] || BUCKET_FRAMING.brand_collab)(lead);
  const strength = affinityLabel(lead.affinity);
  const evidenceBits = [];
  if (lead.evidence?.correlated_categories?.length) {
    evidenceBits.push(
      `shared affinity across ${lead.evidence.correlated_categories.join(', ')}`,
    );
  }
  if (lead.evidence?.audience_overlap != null) {
    evidenceBits.push(`audience overlap index ${lead.evidence.audience_overlap}`);
  }
  const evidence = evidenceBits.length
    ? ` Evidence: ${evidenceBits.join('; ')}.`
    : '';
  return (
    `Consider ${framing}. Qloo aggregate taste data shows ${strength} affinity ` +
    `between ${subject.name} and ${lead.name} (affinity score ${lead.affinity.toFixed(2)}), ` +
    `meaning audiences with an affinity for ${subject.name} over-index on interest in ` +
    `${lead.name} relative to baseline.${evidence} ` +
    `This describes group-level cultural affinity, not individual behavior or a causal link.`
  );
}

export function caveatBlock(subject) {
  return [
    `What this does not establish:`,
    `- Affinities are aggregate group-level correlations from Qloo, not evidence about any individual.`,
    `- A high affinity score is not a causal claim and does not predict campaign performance.`,
    `- Results reflect the entity/tag resolution chosen for "${subject.name}"; a different resolution would change them.`,
    `- Scores describe taste affinity only; they say nothing about brand fit, budget, or availability of the counterparty.`,
  ].join('\n');
}
