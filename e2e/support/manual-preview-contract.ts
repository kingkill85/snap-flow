export const FIXED_PREVIEW_ROUTE = 'https://snapflow-test.kingkill.org';

type Environment = Record<string, string | undefined>;

export function readPreviewSmokeContract(environment: Environment) {
  const email = environment.PREVIEW_ADMIN_EMAIL;
  const password = environment.PREVIEW_ADMIN_PASSWORD;
  const expectedSha = environment.EXPECTED_SHA;
  const phase = environment.PREVIEW_SMOKE_PHASE;
  const createdId = environment.PREVIEW_SMOKE_ID;
  if (!email || !password) {
    throw new Error('PREVIEW_ADMIN_EMAIL and PREVIEW_ADMIN_PASSWORD are required');
  }
  if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error('EXPECTED_SHA must be a full lowercase commit SHA');
  }
  if (phase !== 'create' && phase !== 'verify-cleanup') {
    throw new Error('PREVIEW_SMOKE_PHASE must be create or verify-cleanup');
  }
  if (phase === 'verify-cleanup' && !/^\d+$/.test(createdId || '')) {
    throw new Error('PREVIEW_SMOKE_ID is required for verification cleanup');
  }
  return { route: FIXED_PREVIEW_ROUTE, email, password, expectedSha, phase, createdId };
}
