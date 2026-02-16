import { getDb } from '../config/database.ts';
import type { Customer, CreateCustomerDTO, UpdateCustomerDTO } from '../models/index.ts';

/**
 * Customer Repository
 * Handles all database operations for customers
 */
export class CustomerRepository {
  async findAll(search?: string): Promise<Customer[]> {
    let sql = `
      SELECT id, name, email, phone, address, created_by, created_at 
      FROM customers 
    `;
    const params: (string | number)[] = [];
    
    if (search) {
      sql += ` WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    sql += ` ORDER BY name ASC`;
    
    const result = getDb().queryEntries(sql, params);
    return result as unknown as Customer[];
  }

  async findById(id: number): Promise<Customer | null> {
    const result = getDb().queryEntries(`
      SELECT id, name, email, phone, address, created_by, created_at 
      FROM customers 
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as Customer) : null;
  }

  async create(data: CreateCustomerDTO): Promise<Customer> {
    const result = getDb().queryEntries(`
      INSERT INTO customers (name, email, phone, address, created_by) 
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, name, email, phone, address, created_by, created_at
    `, [data.name, data.email || null, data.phone || null, data.address || null, data.created_by]);
    
    return result[0] as unknown as Customer;
  }

  async update(id: number, data: UpdateCustomerDTO): Promise<Customer | null> {
    const sets: string[] = [];
    const values: (string | undefined | null)[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.email !== undefined) {
      sets.push('email = ?');
      values.push(data.email);
    }
    if (data.phone !== undefined) {
      sets.push('phone = ?');
      values.push(data.phone);
    }
    if (data.address !== undefined) {
      sets.push('address = ?');
      values.push(data.address);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id.toString());

    const result = getDb().queryEntries(`
      UPDATE customers 
      SET ${sets.join(', ')} 
      WHERE id = ?
      RETURNING id, name, email, phone, address, created_by, created_at
    `, values);

    return result.length > 0 ? (result[0] as unknown as Customer) : null;
  }

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM customers WHERE id = ?`, [id]);
  }
}

export const customerRepository = new CustomerRepository();
