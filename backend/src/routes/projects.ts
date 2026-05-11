import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { projectRepository } from '../repositories/project.ts';
import { floorplanRepository } from '../repositories/floorplan.ts';
import { authMiddleware } from '../middleware/auth.ts';
import { bomService } from '../services/bom.ts';

import { invoiceCalculationService } from '../services/invoice-calculation.ts';
import type { CreateProjectDTO } from '../models/index.ts';
import type { TenantContext } from '../repositories/user.ts';

// Extend Hono context types
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    userEmail: string;
    userRole: string;
    tenantId: number;
  }
}

function getTenantCtx(c: { get: (key: string) => unknown; req: { query: (key: string) => string | undefined } }): TenantContext {
  const role = c.get('userRole') as TenantContext['role'];
  const tenantId = c.get('tenantId') as number;

  // Admin can filter by specific tenant via query param
  const queryTenantId = c.req.query('tenantId');
  if (queryTenantId && role === 'admin') {
    return { tenantId: parseInt(queryTenantId), role: 'tenant_admin' }; // Force filtering
  }

  return { tenantId, role };
}

const projectRoutes = new Hono();

// Validation schema for creating projects
const createProjectSchema = z.object({
  group_name: z.string().min(1).max(200),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email().optional().or(z.literal('')),
  customer_phone: z.string().max(50).optional().or(z.literal('')),
  customer_address: z.string().max(500).optional().or(z.literal('')),
  version_name: z.string().min(1).max(100).optional(),
  item_type_ids: z.array(z.number()).optional(),
});

// Validation schema for updating projects
const updateProjectSchema = z.object({
  version_name: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  tenant_id: z.number().optional(),
  item_type_ids: z.array(z.number()).optional(),
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
// Query param: search (filters by version name, group name or customer name)
projectRoutes.get('/', authMiddleware, async (c) => {
  try {
    const search = c.req.query('search');
    const ctx = getTenantCtx(c);
    const projects = await projectRepository.findAll(search || undefined, ctx);

    // Enrich each project with item_type_ids
    const projectsWithTypeIds = await Promise.all(
      projects.map(async (project) => {
        const itemTypeIds = await projectRepository.getItemTypeIds(project.id);
        return { ...project, item_type_ids: itemTypeIds };
      })
    );

    return c.json({
      data: projectsWithTypeIds,
    });
  } catch (error) {
    console.error('List projects error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /projects/:id/total - Get total price for entire project (MUST come before /:id)
projectRoutes.get('/:id/total', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const ctx = getTenantCtx(c);
    const project = await projectRepository.findById(id, ctx);
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
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    // Check if project exists
    const ctx = getTenantCtx(c);
    const project = await projectRepository.findById(id, ctx);
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
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const ctx = getTenantCtx(c);
    const project = await projectRepository.findById(id, ctx);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const itemTypeIds = await projectRepository.getItemTypeIds(id);

    return c.json({
      data: { ...project, item_type_ids: itemTypeIds },
    });
  } catch (error) {
    console.error('Get project error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /projects - Create new project
projectRoutes.post('/', authMiddleware, zValidator('json', createProjectSchema), async (c) => {
  const {
    group_name, status, customer_name, customer_email, customer_phone,
    customer_address, version_name, item_type_ids,
  } = c.req.valid('json');

  try {
    const tenantId = c.get('tenantId') as number;

    const createData: CreateProjectDTO = {
      group_name,
      customer_name,
      tenant_id: tenantId,
    };

    if (status) createData.status = status;
    if (customer_email) createData.customer_email = customer_email;
    if (customer_phone) createData.customer_phone = customer_phone;
    if (customer_address) createData.customer_address = customer_address;
    if (version_name) createData.version_name = version_name;
    if (item_type_ids) createData.item_type_ids = item_type_ids;

    const project = await projectRepository.create(createData);

    // findById with joined group info for response
    const fullProject = await projectRepository.findById(project.id);
    const returnedItemTypeIds = await projectRepository.getItemTypeIds(project.id);

    return c.json({
      data: { ...fullProject, item_type_ids: returnedItemTypeIds },
      message: 'Project created successfully',
    }, 201);
  } catch (error: unknown) {
    console.error('Create project error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('already exists')) {
      return c.json({ error: message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /projects/:id/invoice-settings - Update invoice configuration (MUST come before /:id)
projectRoutes.put('/:id/invoice-settings', authMiddleware, zValidator('json', updateInvoiceSettingsSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const data = c.req.valid('json');

  try {
    // Check if project exists
    const ctx = getTenantCtx(c);
    const project = await projectRepository.findById(id, ctx);
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
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const { version_name, status, tenant_id, item_type_ids } = c.req.valid('json');
  const callerRole = c.get('userRole') as string;

  try {
    // Check if project exists
    const ctx = getTenantCtx(c);
    const existingProject = await projectRepository.findById(id, ctx);
    if (!existingProject) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Users can only edit active projects
    if (callerRole === 'user' && existingProject.status !== 'active') {
      return c.json({ error: 'Only active projects can be edited' }, 403);
    }

    const updateData: {
      version_name?: string;
      status?: 'active' | 'completed' | 'cancelled';
      tenant_id?: number;
    } = {};

    if (version_name !== undefined) updateData.version_name = version_name;
    if (status !== undefined) updateData.status = status;
    if (tenant_id !== undefined && callerRole === 'admin') updateData.tenant_id = tenant_id;

    const project = await projectRepository.update(id, updateData, ctx);

    // Update item type IDs if provided
    if (item_type_ids !== undefined) {
      await projectRepository.setItemTypeIds(id, item_type_ids);
    }

    const projectItemTypeIds = await projectRepository.getItemTypeIds(id);

    return c.json({
      data: { ...project, item_type_ids: projectItemTypeIds },
      message: 'Project updated successfully',
    });
  } catch (error: unknown) {
    console.error('Update project error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('already exists')) {
      return c.json({ error: message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /projects/:id - Delete project (admin/tenant_admin only)
projectRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  const callerRole = c.get('userRole') as string;
  if (callerRole === 'user') {
    return c.json({ error: 'Forbidden - Users cannot delete projects' }, 403);
  }

  try {
    const ctx = getTenantCtx(c);
    const project = await projectRepository.findById(id, ctx);
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

    await projectRepository.delete(id, ctx);

    return c.json({
      message: 'Project deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Delete project error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('last version')) {
      return c.json({ error: message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default projectRoutes;
