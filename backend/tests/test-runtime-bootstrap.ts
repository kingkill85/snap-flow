const NORMAL_UPLOAD_ROOT = new URL('../uploads', import.meta.url).pathname.replace(/\/$/, '');
const TEST_UPLOAD_PREFIX = 'snapflow-backend-tests-';

export function getNormalUploadRoot(): string {
  return NORMAL_UPLOAD_ROOT;
}

export function assertIsolatedTestUploadRoot(root: string): void {
  const normalized = root.replace(/\/$/, '');
  if (!normalized.startsWith(`/tmp/${TEST_UPLOAD_PREFIX}`)) {
    throw new Error(`Refusing unsafe test upload root: ${root}`);
  }
  if (normalized === NORMAL_UPLOAD_ROOT || normalized.startsWith(`${NORMAL_UPLOAD_ROOT}/`)) {
    throw new Error(`Test upload root overlaps normal uploads: ${root}`);
  }
}

export async function createTestUploadRoot(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: TEST_UPLOAD_PREFIX });
  assertIsolatedTestUploadRoot(root);
  return root;
}

export async function cleanupTestUploadRoot(root: string): Promise<void> {
  assertIsolatedTestUploadRoot(root);
  await Deno.remove(root, { recursive: true });
}
