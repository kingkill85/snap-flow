import { userRepository } from '../repositories/user.ts';
import { hashPassword } from '../services/password.ts';

/**
 * Seed the database with initial data
 */
async function seed() {
  console.log('🌱 Seeding database...');

  // Check if admin already exists
  const existingAdmin = await userRepository.findByEmail('admin@snapflow.com');
  
  if (existingAdmin) {
    console.log('✅ Admin user already exists');
  } else {
    // Create default admin user
    const passwordHash = hashPassword('admin123');
    
    const admin = await userRepository.create({
      email: 'admin@snapflow.com',
      password_hash: passwordHash,
      role: 'admin',
    });

    console.log('✅ Created admin user:', admin.email);
  }

  console.log('✅ Seeding complete!');
}

if (import.meta.main) {
  await seed();
}
