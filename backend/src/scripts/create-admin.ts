import { db } from '../config/database.ts';
import { hashPassword } from '../services/password.ts';

/**
 * Emergency admin user creation script
 * Run this if you get locked out after changing JWT_SECRET
 * 
 * Usage: cd backend && deno run --allow-all src/scripts/create-admin.ts
 * 
 * This creates an admin user with credentials:
 *   Email: admin@snapflow.local
 *   Password: admin123
 * 
 * After logging in, CHANGE THIS PASSWORD immediately!
 */

const ADMIN_EMAIL = 'admin@snapflow.local';
const ADMIN_PASSWORD = 'admin123';

async function createAdminUser() {
  console.log('Creating emergency admin user...');
  
  try {
    // Check if user already exists
    const existing = db.query<[number]>(
      'SELECT id FROM users WHERE email = ?',
      [ADMIN_EMAIL]
    );
    
    if (existing.length > 0) {
      console.log(`User ${ADMIN_EMAIL} already exists`);
      console.log('You can log in with the password you previously set');
      return;
    }
    
    // Hash password
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    
    // Create admin user
    db.query(
      `INSERT INTO users (email, password_hash, role, full_name) 
       VALUES (?, ?, ?, ?)`,
      [ADMIN_EMAIL, passwordHash, 'admin', 'Administrator']
    );
    
    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('Login credentials:');
    console.log(`  Email: ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
    console.log('   Go to Profile → Update Password');
    
  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
    Deno.exit(1);
  } finally {
    db.close();
  }
}

// Run the script
createAdminUser();
