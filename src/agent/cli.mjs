#!/usr/bin/env node
// Cold-Open CLI: node src/agent/cli.mjs <brand> [--category <cat>] [--json]
import { run } from './coldopen.mjs';

const args = process.argv.slice(2);
const brand = args.find((a) => !a.startsWith('--'));
const catIdx = args.indexOf('--category');
const subjectCategory = catIdx >= 0 ? args[catIdx + 1] : undefined;
const asJson = args.includes('--json');

if (!brand) {
  console.error('usage: node src/agent/cli.mjs <brand> [--category <cat>] [--json]');
  process.exit(2);
}

const result = await run(brand, { subjectCategory });

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Cold-Open leads for: ${result.subject.name}`);
  const s = result.subject;
  console.log(
    `Resolved Qloo entity: ${s.resolved_entity.name} (${s.resolved_entity.entity_id})` +
      ` [${(s.resolved_entity.types || []).join(', ')}]`,
  );
  if (s.resolved_tag) {
    console.log(`Resolved Qloo tag: ${s.resolved_tag.name} (${s.resolved_tag.id})`);
  }
  if (s.alternative_entities?.length) {
    console.log(
      `Alternatives considered: ${s.alternative_entities
        .map((e) => `${e.name} [${(e.types || []).join('/') || 'unknown'}]`)
        .join(', ')}`,
    );
  }
  console.log('');
  for (const lead of result.leads) {
    console.log(`#${lead.rank} [${lead.bucket}] ${lead.name} — affinity ${lead.affinity.toFixed(2)}`);
    console.log(`   ${lead.pitch}\n`);
  }
  console.log(result.caveats);
}
