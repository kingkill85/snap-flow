import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { projectRepository } from '../repositories/project.ts';
import { floorplanRepository } from '../repositories/floorplan.ts';
import { authMiddleware } from '../middleware/auth.ts';
import { bomService } from '../services/bom.ts';
import { currencyService } from '../services/currency.ts';
import { invoiceCalculationService } from '../services/invoice-calculation.ts';
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
  name: z.string().min(1).max(200),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email().optional().or(z.literal('')),
  customer_phone: z.string().max(50).optional().or(z.literal('')),
  customer_address: z.string().max(500).optional().or(z.literal('')),
});

// Validation schema for updating projects
const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  customer_name: z.string().min(1).max(200).optional(),
  customer_email: z.string().email().optional().or(z.literal('')),
  customer_phone: z.string().max(50).optional().or(z.literal('')),
  customer_address: z.string().max(500).optional().or(z.literal('')),
});

// Validation schema for updating invoice settings
const updateInvoiceSettingsSchema = z.object({
  discount_percentage: z.number().min(0).max(100).optional(),
  discount_usd: z.number().min(0).optional(),
  services_percentage: z.number().min(0).max(100).optional(),
  services_usd: z.number().min(0).optional(),
  local_currency_code: z.string().min(3).max(3).optional(),
  exchange_rate: z.number().min(0).optional(),
  google_exchange_rate: z.number().min(0).optional(),
});

// GET /projects - List all projects with optional search
// Query param: search (filters by project name or customer name)
projectRoutes.get('/', authMiddleware, async (c) => {
  try {
    const search = c.req.query('search');
    const projects = await projectRepository.findAll(search || undefined);
    return c.json({
      data: projects,
    });
  } catch (error) {
    console.error('List projects error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /projects/:id/total - Get total price for entire project (MUST come before /:id)
projectRoutes.get('/:id/total', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  
  try {
    const project = await projectRepository.findById(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    const total = await bomService.getProjectTotal(id);
    return c.json({ data: total });
  } catch (error) {
    console.error('Get project total error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /projects/:id/invoice-calculation - Get calculated invoice totals (MUST come before /:id)
projectRoutes.get('/:id/invoice-calculation', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    // Check if project exists
    const project = await projectRepository.findById(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Get BOM total
    const { totalPrice: bomTotal } = await bomService.getProjectTotal(id);

    // Calculate invoice totals
    const calculation = invoiceCalculationService.calculate(bomTotal, {
      discount_percentage: project.discount_percentage,
      discount_usd: project.discount_usd,
      services_percentage: project.services_percentage,
      services_usd: project.services_usd,
      exchange_rate: project.exchange_rate,
      local_currency_code: project.local_currency_code,
    });

    return c.json({
      data: calculation,
    });
  } catch (error) {
    console.error('Get invoice calculation error:', error);
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
  const { name, status, customer_name, customer_email, customer_phone, customer_address } = c.req.valid('json');

  try {
    // Create project with customer info
    const createData: CreateProjectDTO = { 
      name,
      customer_name,
    };
    
    if (status) createData.status = status;
    if (customer_email) createData.customer_email = customer_email;
    if (customer_phone) createData.customer_phone = customer_phone;
    if (customer_address) createData.customer_address = customer_address;
    
    const project = await projectRepository.create(createData);

    return c.json({
      data: project,
      message: 'Project created successfully',
    }, 201);
  } catch (error: any) {
    console.error('Create project error:', error);
    // Check for duplicate project error
    if (error.message?.includes('already exists')) {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /projects/:id/invoice-settings - Update invoice configuration (MUST come before /:id)
projectRoutes.put('/:id/invoice-settings', authMiddleware, zValidator('json', updateInvoiceSettingsSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  try {
    // Check if project exists
    const project = await projectRepository.findById(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const updatedProject = await projectRepository.updateInvoiceSettings(id, data);

    return c.json({
      data: updatedProject,
      message: 'Invoice settings updated successfully',
    });
  } catch (error) {
    console.error('Update invoice settings error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /projects/:id - Update project
projectRoutes.put('/:id', authMiddleware, zValidator('json', updateProjectSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const { name, status, customer_name, customer_email, customer_phone, customer_address } = c.req.valid('json');

  try {
    // Check if project exists
    const existingProject = await projectRepository.findById(id);
    if (!existingProject) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const updateData: { 
      name?: string; 
      status?: 'active' | 'completed' | 'cancelled';
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      customer_address?: string;
    } = {};
    
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (customer_name !== undefined) updateData.customer_name = customer_name;
    if (customer_email !== undefined && customer_email !== '') updateData.customer_email = customer_email;
    if (customer_phone !== undefined && customer_phone !== '') updateData.customer_phone = customer_phone;
    if (customer_address !== undefined && customer_address !== '') updateData.customer_address = customer_address;

    const project = await projectRepository.update(id, updateData);

    return c.json({
      data: project,
      message: 'Project updated successfully',
    });
  } catch (error: any) {
    console.error('Update project error:', error);
    // Check for duplicate project error
    if (error.message?.includes('already exists')) {
      return c.json({ error: error.message }, 400);
    }
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

    // Check if project has floorplans
    const floorplans = await floorplanRepository.findByProject(id);
    if (floorplans.length > 0) {
      return c.json({ 
        error: `Cannot delete project with ${floorplans.length} floorplan(s). Please delete all floorplans first.` 
      }, 400);
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
