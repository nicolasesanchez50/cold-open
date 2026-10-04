// Static demo entry point: runs the shared pipeline in the browser and
// renders the result. Imported by index.html (hosted demo) as
// `<script type="module">`.
//
// Transport selection lives in ./qloo-browser.mjs: live Qloo REST calls when
// an event API key is configured, recorded fixtures otherwise — and the page
// must say which one it is showing.

import { runWith } from '../core/pipeline.mjs';
import { browserQloo, mode, apiKey, setApiKey } from './qloo-browser.mjs';

export async function demoRun(brand, category) {
  return runWith(browserQloo, brand, {
    subjectCategory: category || undefined,
  });
}

function el(id) {
  return document.getElementById(id);
}

export function mount() {
  const form = el('f');
  const out = el('out');
  const status = el('status');
  const banner = el('mode-banner');
  const keyForm = el('key-form');
  if (!form || !out || !status) return;

  function renderMode() {
    if (!banner) return;
    if (mode() === 'live') {
      banner.textContent = 'Mode: LIVE Qloo API';
      banner.dataset.mode = 'live';
    } else {
      banner.textContent =
        'Mode: SAMPLE DATA — development fixtures, no live Qloo call. ' +
        'Add an event API key below to run against Qloo.';
      banner.dataset.mode = 'fixture';
    }
  }
  renderMode();

  if (keyForm) {
    const input = keyForm.querySelector('input[name=key]');
    if (input) input.value = apiKey() ? '••••••••' : '';
    keyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = (input?.value || '').trim();
      // Ignore the masked placeholder unless it was replaced.
      if (value && !/^•+$/.test(value)) setApiKey(value);
      else if (value === '') setApiKey('');
      if (input) input.value = apiKey() ? '••••••••' : '';
      renderMode();
      status.textContent = mode() === 'live'
        ? 'API key saved — live Qloo calls enabled.'
        : 'Key cleared — running on sample fixtures.';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const brand = form.brand.value.trim();
    const category = form.category.value.trim();
    out.innerHTML = '';
    if (!brand) return;
    status.textContent = 'Querying Qloo…';
    try {
      const data = await demoRun(brand, category);
      status.textContent =
        `Resolved "${data.subject.name}" → ` +
        `${data.subject.resolved_tag.name} (${data.subject.resolved_tag.id})` +
        ` · ${mode() === 'live' ? 'live Qloo data' : 'sample fixtures'}` +
        ` · ${data.leads.length} leads`;
      out.innerHTML =
        data.leads
          .map(
            (l) => `
      <div class="lead">
        <h3>#${l.rank} ${escapeHtml(l.name)}</h3>
        <div class="meta">${escapeHtml(l.bucket.replace('_', ' '))} · affinity ${l.affinity.toFixed(2)} · ${escapeHtml(String(l.category))}</div>
        <p>${escapeHtml(l.pitch)}</p>
      </div>`,
          )
          .join('') + `<div class="caveats">${escapeHtml(data.caveats)}</div>`;
    } catch (err) {
      status.textContent = 'Error: ' + (err?.message || err);
    }
  });
}

// Minimal escaping: pitches and caveat text are generated locally, but lead
// names come from an external API response.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}
