import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Issue 89 real-runtime feature retains the approved representative acceptance matrix', async () => {
  const feature = await readFile('e2e/features/issue-89-zoning-parameters.feature', 'utf8');
  const required = [
    'Administrator creates a definition',
    'Referenced parameter deletion is actionable',
    'Multiple Product Type groups on desktop',
    'Narrow accessible editor',
    'Keyboard stepper and persistence',
    'Cancel discards drafts',
    'Positive-only grouped summary persists after reload',
    'Summary overflow remains bounded and accessible',
    'Stale revision recovery',
    'Non-administrator authorization is enforced',
    'Cross-tenant Area is non-disclosing',
    'Invalid value is rejected atomically',
    'Deactivate and reactivate retains values',
    'Project Product Type reselection retains values',
    'Applicability conflict has visible recovery',
  ];
  for (const scenario of required) assert.match(feature, new RegExp(`Scenario: ${scenario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.equal((feature.match(/openspec-scenario:/g) ?? []).length, required.length);
});
