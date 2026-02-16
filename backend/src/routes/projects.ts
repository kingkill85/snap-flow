import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { projectRepository } from '../repositories/project.ts';
import { customerRepository } from '../repositories/customer.ts';
import { authMiddleware } from '../middleware/auth.ts';
import type { CreateProjectDTO } from '../models/index.ts';

// Extend Hono context types
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    userEmail: string;
    userRole: string;
  }
}

const projectRoutes = new Hono();

// Validation schema for creating projects
const createProjectSchema = z.object({
  customer_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
});

// Validation schema for updating projects
const updateProjectSchema = z.object({
  customer_id: z.number().int().positive().optional(),
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
});

// GET /projects - List all projects
projectRoutes.get('/', authMiddleware, async (c) => {
  try {
    const projects = await projectRepository.findAll();
    return c.json({
      data: projects,
    });
  } catch (error) {
    console.error('List projects error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /projects/:id - Get single project
projectRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  
  try {
    const project = await projectRepository.findById(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    return c.json({
      data: project,
    });
  } catch (error) {
    console.error('Get project error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /projects - Create new project
projectRoutes.post('/', authMiddleware, zValidator('json', createProjectSchema), async (c) => {
  const { customer_id, name, status } = c.req.valid('json');

  try {
    // Check if customer exists
    const customer = await customerRepository.findById(customer_id);
    if (!customer) {
      return c.json({ error: 'Customer not found' }, 404);
    }

    // Check for duplicate project name (case-insensitive)
    const existingProjects = await projectRepository.findByCustomer(customer_id);
    const duplicateName = existingProjects.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (duplicateName) {
      return c.json({ error: 'A project with this name already exists for this customer' }, 400);
    }

    // Create project
    const createData: CreateProjectDTO = { customer_id, name };
    if (status) createData.status = status;
    const project = await projectRepository.create(createData);

    return c.json({
      data: project,
      message: 'Project created successfully',
    }, 201);
  } catch (error) {
    console.error('Create project error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /projects/:id - Update project
projectRoutes.put('/:id', authMiddleware, zValidator('json', updateProjectSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const { customer_id, name, status } = c.req.valid('json');

  try {
    // Check if project exists
    const existingProject = await projectRepository.findById(id);
    if (!existingProject) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Check if customer exists if changing customer
    if (customer_id) {
      const customer = await customerRepository.findById(customer_id);
      if (!customer) {
        return c.json({ error: 'Customer not found' }, 404);
      }
    }

    // Check for duplicate project name when updating
    if (name && name.toLowerCase() !== existingProject.name.toLowerCase()) {
      const checkCustomerId = customer_id || existingProject.customer_id;
      const existingProjects = await projectRepository.findByCustomer(checkCustomerId);
      const duplicateName = existingProjects.find(p => 
        p.id !== id && p.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicateName) {
        return c.json({ error: 'A project with this name already exists for this customer' }, 400);
      }
    }

    const updateData: { customer_id?: number; name?: string; status?: 'active' | 'completed' | 'cancelled' } = {};
    if (customer_id !== undefined) updateData.customer_id = customer_id;
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;

    const project = await projectRepository.update(id, updateData);

    return c.json({
      data: project,
      message: 'Project updated successfully',
    });
  } catch (error) {
    console.error('Update project error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /projects/:id - Delete project
projectRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const project = await projectRepository.findById(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    await projectRepository.delete(id);
    
    return c.json({
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Delete project error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default projectRoutes;
