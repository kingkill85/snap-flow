export const FIXED_PREVIEW_ROUTE = 'https://snapflow-test.kingkill.org';

type Environment = Record<string, string | undefined>;

export function readPreviewSmokeContract(environment: Environment) {
  const email = environment.PREVIEW_ADMIN_EMAIL;
  const password = environment.PREVIEW_ADMIN_PASSWORD;
  const expectedSha = environment.EXPECTED_SHA;
  if (!email || !password) {
    throw new Error('PREVIEW_ADMIN_EMAIL and PREVIEW_ADMIN_PASSWORD are required');
  }
  if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error('EXPECTED_SHA must be a full lowercase commit SHA');
  }
  return { route: FIXED_PREVIEW_ROUTE, email, password, expectedSha };
}
