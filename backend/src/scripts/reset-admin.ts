import { userRepository } from '../repositories/user.ts';
import { hashPassword } from '../services/password.ts';

async function resetAdmin() {
  console.log('Creating/resetting admin user...');
  
  try {
    // Check if admin exists
    const existingAdmin = await userRepository.findByEmail('admin@snapflow.com');
    
    if (existingAdmin) {
      console.log('Admin user exists, updating password...');
      const newPasswordHash = await hashPassword('admin123');
      await userRepository.update(existingAdmin.id, { 
        password_hash: newPasswordHash,
        role: 'admin'
      });
      console.log('✅ Admin password reset to: admin123');
    } else {
      console.log('Creating new admin user...');
      const passwordHash = await hashPassword('admin123');
      await userRepository.create({
        email: 'admin@snapflow.com',
        password_hash: passwordHash,
        full_name: 'Administrator',
        role: 'admin',
      });
      console.log('✅ Admin user created:');
      console.log('  Email: admin@snapflow.com');
      console.log('  Password: admin123');
    }
    
    console.log('\nYou can now login with these credentials.');
  } catch (error) {
    console.error('❌ Error:', error);
    Deno.exit(1);
  }
}

resetAdmin();
