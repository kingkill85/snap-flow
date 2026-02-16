import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { customerRepository } from '../repositories/customer.ts';
import { projectRepository } from '../repositories/project.ts';
import { authMiddleware } from '../middleware/auth.ts';
import type { CreateCustomerDTO } from '../models/index.ts';

// Extend Hono context types
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    userEmail: string;
    userRole: string;
  }
}

const customerRoutes = new Hono();

// Validation schema for creating customers
const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
});

// Validation schema for updating customers
const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
});

// GET /customers - List all customers with optional search
// Query param: search (filters by name, email, or phone)
customerRoutes.get('/', authMiddleware, async (c) => {
  try {
    const search = c.req.query('search');
    const customers = await customerRepository.findAll(search || undefined);
    return c.json({
      data: customers,
    });
  } catch (error) {
    console.error('List customers error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /customers/:id - Get single customer
customerRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  
  try {
    const customer = await customerRepository.findById(id);
    if (!customer) {
      return c.json({ error: 'Customer not found' }, 404);
    }
    
    return c.json({
      data: customer,
    });
  } catch (error) {
    console.error('Get customer error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /customers/:id/projects - Get projects for a customer
customerRoutes.get('/:id/projects', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  
  try {
    const customer = await customerRepository.findById(id);
    if (!customer) {
      return c.json({ error: 'Customer not found' }, 404);
    }
    
    const projects = await projectRepository.findByCustomer(id);
    return c.json({
      data: projects,
    });
  } catch (error) {
    console.error('Get customer projects error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /customers - Create new customer
customerRoutes.post('/', authMiddleware, zValidator('json', createCustomerSchema), async (c) => {
  const { name, email, phone, address } = c.req.valid('json');
  const userId = c.get('userId');

  try {
    // Check for duplicate name (case-insensitive)
    const existingCustomers = await customerRepository.findAll();
    const duplicateName = existingCustomers.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (duplicateName) {
      return c.json({ error: 'A customer with this name already exists' }, 400);
    }

    // Check for duplicate email (if provided)
    if (email) {
      const duplicateEmail = existingCustomers.find(c => c.email?.toLowerCase() === email.toLowerCase());
      if (duplicateEmail) {
        return c.json({ error: 'A customer with this email already exists' }, 400);
      }
    }

    // Create customer
    const customer = await customerRepository.create({
      name,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      created_by: userId,
    } as CreateCustomerDTO);

    return c.json({
      data: customer,
      message: 'Customer created successfully',
    }, 201);
  } catch (error) {
    console.error('Create customer error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /customers/:id - Update customer
customerRoutes.put('/:id', authMiddleware, zValidator('json', updateCustomerSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const { name, email, phone, address } = c.req.valid('json');

  try {
    // Check if customer exists
    const existingCustomer = await customerRepository.findById(id);
    if (!existingCustomer) {
      return c.json({ error: 'Customer not found' }, 404);
    }

    // Check for duplicate name (if updating name)
    if (name && name.toLowerCase() !== existingCustomer.name.toLowerCase()) {
      const existingCustomers = await customerRepository.findAll();
      const duplicateName = existingCustomers.find(c => 
        c.id !== id && c.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicateName) {
        return c.json({ error: 'A customer with this name already exists' }, 400);
      }
    }

    // Check for duplicate email (if updating email)
    if (email && email !== existingCustomer.email) {
      const existingCustomers = await customerRepository.findAll();
      const duplicateEmail = existingCustomers.find(c => 
        c.id !== id && c.email?.toLowerCase() === email.toLowerCase()
      );
      if (duplicateEmail) {
        return c.json({ error: 'A customer with this email already exists' }, 400);
      }
    }

    const updateData: { name?: string; email?: string; phone?: string; address?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined && email !== '') updateData.email = email;
    if (phone !== undefined && phone !== '') updateData.phone = phone;
    if (address !== undefined && address !== '') updateData.address = address;

    const customer = await customerRepository.update(id, updateData);

    return c.json({
      data: customer,
      message: 'Customer updated successfully',
    });
  } catch (error) {
    console.error('Update customer error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /customers/:id - Delete customer
customerRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const customer = await customerRepository.findById(id);
    if (!customer) {
      return c.json({ error: 'Customer not found' }, 404);
    }

    // Check if customer has projects
    const projects = await projectRepository.findByCustomer(id);
    if (projects.length > 0) {
      return c.json({ 
        error: 'Cannot delete customer that has projects. Please delete all projects first.' 
      }, 400);
    }

    await customerRepository.delete(id);
    
    return c.json({
      message: 'Customer deleted successfully',
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default customerRoutes;
