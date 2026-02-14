import { db } from './src/config/database.ts';
import { hashPassword } from './src/services/password.ts';

async function createAdmin() {
  const passwordHash = await hashPassword('admin123');
  
  // Check if user exists
  const existing = db.query('SELECT id FROM users WHERE email = ?', ['admin@example.com']);
  
  if (existing.length > 0) {
    // Update password
    db.query('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, 'admin@example.com']);
    console.log('Updated admin password');
  } else {
    // Create new admin
    db.query(`
      INSERT INTO users (email, password_hash, role, full_name)
      VALUES (?, ?, 'admin', 'Administrator')
    `, ['admin@example.com', passwordHash]);
    console.log('Created admin user');
  }
  
  console.log('Email: admin@example.com');
  console.log('Password: admin123');
}

createAdmin();
