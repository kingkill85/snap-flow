import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { projectGroupRepository } from '../repositories/project-group.ts';
import { projectRepository } from '../repositories/project.ts';
import { authMiddleware } from '../middleware/auth.ts';
import type { TenantContext } from '../repositories/user.ts';

const projectGroupRoutes = new Hono();

// Helper
function getTenantCtx(c: { get: (key: string) => unknown }): TenantContext {
  return {
    role: c.get('userRole') as TenantContext['role'],
    tenantId: c.get('tenantId') as number,
  };
}

// Validation schemas
const updateGroupSchema = z.object({
  customer_name: z.string().min(1).max(200).optional(),
  customer_email: z.string().email().optional().or(z.literal('')),
  customer_phone: z.string().max(50).optional().or(z.literal('')),
  customer_address: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  discount_percentage: z.number().min(0).max(100).optional(),
  discount_usd: z.number().min(0).optional(),
  services_percentage: z.number().min(0).max(100).optional(),
  services_usd: z.number().min(0).optional(),
  local_currency_code: z.string().min(3).max(3).optional(),
  exchange_rate: z.number().min(0).optional(),
});

const createVersionSchema = z.object({
  version_name: z.string().min(1).max(100),
  source_project_id: z.number().int().positive(),
});

// GET /project-groups - List all groups
projectGroupRoutes.get('/', authMiddleware, async (c) => {
  try {
    const search = c.req.query('search');
    const ctx = getTenantCtx(c);
    const groups = await projectGroupRepository.findAll(search || undefined, ctx);

    return c.json({
      data: groups,
    });
  } catch (error) {
    console.error('List project groups error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /project-groups/:id - Get single group
projectGroupRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const ctx = getTenantCtx(c);
    const group = await projectGroupRepository.findById(id, ctx);
    if (!group) {
      return c.json({ error: 'Project group not found' }, 404);
    }

    return c.json({
      data: group,
    });
  } catch (error) {
    console.error('Get project group error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /project-groups/:id - Update group customer info
projectGroupRoutes.put('/:id', authMiddleware, zValidator('json', updateGroupSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const { customer_name, customer_email, customer_phone, customer_address, status,
    discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code, exchange_rate } = c.req.valid('json');

  try {
    // Check if group exists
    const ctx = getTenantCtx(c);
    const existingGroup = await projectGroupRepository.findById(id, ctx);
    if (!existingGroup) {
      return c.json({ error: 'Project group not found' }, 404);
    }

    const updateData: Parameters<typeof projectGroupRepository.update>[1] = {};

    if (customer_name !== undefined) updateData.customer_name = customer_name;
    if (customer_email !== undefined) updateData.customer_email = customer_email;
    if (customer_phone !== undefined) updateData.customer_phone = customer_phone;
    if (customer_address !== undefined) updateData.customer_address = customer_address;
    if (status !== undefined) updateData.status = status;
    if (discount_percentage !== undefined) updateData.discount_percentage = discount_percentage;
    if (discount_usd !== undefined) updateData.discount_usd = discount_usd;
    if (services_percentage !== undefined) updateData.services_percentage = services_percentage;
    if (services_usd !== undefined) updateData.services_usd = services_usd;
    if (local_currency_code !== undefined) updateData.local_currency_code = local_currency_code;
    if (exchange_rate !== undefined) updateData.exchange_rate = exchange_rate;

    const updated = await projectGroupRepository.update(id, updateData);

    return c.json({
      data: updated,
      message: 'Project group updated successfully',
    });
  } catch (error: unknown) {
    console.error('Update project group error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('already exists')) {
      return c.json({ error: message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /project-groups/:id/invoice-settings - Update group invoice settings (MUST come before /:id)
projectGroupRoutes.put('/:id/invoice-settings', authMiddleware, zValidator('json', updateGroupSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const { discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code, exchange_rate } = c.req.valid('json');

  try {
    // Check if group exists
    const ctx = getTenantCtx(c);
    const existingGroup = await projectGroupRepository.findById(id, ctx);
    if (!existingGroup) {
      return c.json({ error: 'Project group not found' }, 404);
    }

    const updateData: Parameters<typeof projectGroupRepository.update>[1] = {};

    if (discount_percentage !== undefined) updateData.discount_percentage = discount_percentage;
    if (discount_usd !== undefined) updateData.discount_usd = discount_usd;
    if (services_percentage !== undefined) updateData.services_percentage = services_percentage;
    if (services_usd !== undefined) updateData.services_usd = services_usd;
    if (local_currency_code !== undefined) updateData.local_currency_code = local_currency_code;
    if (exchange_rate !== undefined) updateData.exchange_rate = exchange_rate;

    const updated = await projectGroupRepository.update(id, updateData);

    return c.json({
      data: updated,
      message: 'Invoice settings updated successfully',
    });
  } catch (error: unknown) {
    console.error('Update invoice settings error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /project-groups/:id/versions - Create new version from latest
// MUST come before /:id to avoid being caught as an ID
projectGroupRoutes.post('/:id/versions', authMiddleware, zValidator('json', createVersionSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const { version_name, source_project_id } = c.req.valid('json');

  try {
    // Check if group exists
    const ctx = getTenantCtx(c);
    const group = await projectGroupRepository.findById(id, ctx);
    if (!group) {
      return c.json({ error: 'Project group not found' }, 404);
    }

    // Validate that source_project_id belongs to this group
    const sourceProjectExists = group.versions.some((v) => v.id === source_project_id);
    if (!sourceProjectExists) {
      return c.json({ error: 'Source version not found in this group' }, 404);
    }

    // Check duplicate version name
    const duplicate = group.versions.some((v) => v.version_name === version_name);
    if (duplicate) {
      return c.json({ error: `A version named "${version_name}" already exists in this group` }, 400);
    }

    const tenantId = c.get('tenantId') as number;
    const newProject = await projectGroupRepository.createVersion(source_project_id, { version_name, source_project_id }, tenantId);

    return c.json({
      data: newProject,
      message: `Version '${version_name}' created`,
    }, 201);
  } catch (error: unknown) {
    console.error('Create version error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Source version not found')) {
      return c.json({ error: message }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /project-groups/:id - Delete entire group
projectGroupRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  const callerRole = c.get('userRole') as string;
  if (callerRole === 'user') {
    return c.json({ error: 'Forbidden - Users cannot delete project groups' }, 403);
  }

  try {
    const ctx = getTenantCtx(c);
    const group = await projectGroupRepository.findById(id, ctx);
    if (!group) {
      return c.json({ error: 'Project group not found' }, 404);
    }

    // Check if any version in the group has data (floorplans, BOM, etc.)
    const hasData = await projectRepository.groupHasData(id);
    if (hasData) {
      return c.json({ error: 'Cannot delete project group with versions that contain data. Please delete all versions first.' }, 400);
    }

    // Delete all empty versions in the group
    await projectRepository.deleteAllInGroup(id, ctx);

    await projectGroupRepository.delete(id);

    return c.json({
      message: 'Project group deleted successfully',
    });
  } catch (error) {
    console.error('Delete project group error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default projectGroupRoutes;
