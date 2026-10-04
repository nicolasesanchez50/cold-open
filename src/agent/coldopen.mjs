// Cold-Open agent pipeline, bound to the Node transport.
//
// All pipeline logic lives in src/core/pipeline.mjs so the static demo runs
// the identical code path. This module only injects the Node Qloo client
// (live harness CLI or recorded fixtures) and keeps the export surface used
// by src/agent/cli.mjs and src/web/server.mjs.

import { qloo } from '../qloo/client.mjs';
import { runWith } from '../core/pipeline.mjs';

export async function run(subjectName, opts = {}) {
  return runWith(qloo, subjectName, opts);
}

export { resolveSubject, scanBucket } from '../core/pipeline.mjs';
