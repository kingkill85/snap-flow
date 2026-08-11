import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Issue 89 real-runtime feature retains the approved representative acceptance matrix', async () => {
  const feature = await readFile('e2e/features/issue-89-zoning-parameters.feature', 'utf8');
  const required = [
    'Administrator creates a definition',
    'Referenced parameter deletion is actionable',
    'Compact compound zoning editor',
    'Multiple Product Type groups on desktop',
    'Narrow accessible editor',
    'Compound number control keyboard and button operation',
    'Compound number control respects integer boundaries',
    'Invalid compound draft is non-mutating',
    'Cancel discards drafts',
    'Positive-only grouped annotations persist after reload',
    'Saved editor values reach the floorplan and PNG export',
    'Existing project geometry paints persisted zoning values',
    'Annotation overflow remains bounded and accessible',
    'Annotation remains readable over varied floorplan backgrounds',
    'Annotation avoids a nearby product placement',
    'Annotation passes pointer interaction through',
    'PNG export preserves annotation presentation',
    'PNG annotation export fails closed',
    'Stale revision recovery',
    'Non-administrator authorization is enforced',
    'Cross-tenant Area is non-disclosing',
    'Invalid value is rejected atomically',
    'Deactivate and reactivate retains values',
    'Project Product Type reselection retains values',
    'Applicability conflict has visible recovery',
    'Create Version preserves remapped zoning values',
  ];
  for (const scenario of required) assert.match(feature, new RegExp(`Scenario: ${scenario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.equal((feature.match(/openspec-scenario:/g) ?? []).length, required.length);
});
