import {
  cleanupTestUploadRoot,
  createTestUploadRoot,
} from './test-runtime-bootstrap.ts';

const uploadRoot = await createTestUploadRoot();
let exitCode = 1;

try {
  const command = new Deno.Command(Deno.execPath(), {
    args: ['test', '--allow-all', ...Deno.args],
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: ':memory:',
      UPLOAD_DIR: uploadRoot,
      JWT_SECRET: 'test-secret-key-for-tests-32-chars',
    },
  });
  const status = await command.spawn().status;
  exitCode = status.code;
} finally {
  await cleanupTestUploadRoot(uploadRoot);
}

Deno.exit(exitCode);
