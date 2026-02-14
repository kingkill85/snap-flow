import { comparePassword } from './src/services/password.ts';

const hash = '$2b$10$nrdfgxKbCaB5kI5DHnyLCeVTjKv.VwDMQ5nUjOop3AWcs3RjjBf26';

async function test() {
  const result = await comparePassword('admin123', hash);
  console.log('Password "admin123" match:', result);
  
  const result2 = await comparePassword('password', hash);
  console.log('Password "password" match:', result2);
}

test();
