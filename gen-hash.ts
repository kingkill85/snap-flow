import { hashPassword } from './src/services/password.ts';
const hash = await hashPassword('admin123');
console.log(hash);
