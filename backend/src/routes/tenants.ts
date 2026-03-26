import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';
import { TenantRepository } from '../repositories/tenant.ts';
import { projectRepository } from '../repositories/project.ts';
import { userRepository } from '../repositories/user.ts';

const tenantRoutes = new Hono();
const tenantRepo = new TenantRepository();

// All tenant routes require admin role
tenantRoutes.use('/*', authMiddleware, adminMiddleware);

// GET /tenants - List all tenants
tenantRoutes.get('/', async (c) => {
  const tenants = await tenantRepo.findAll();
  return c.json({ data: tenants });
});

// GET /tenants/:id - Get single tenant
tenantRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const tenant = await tenantRepo.findById(id);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  return c.json({ data: tenant });
});

// POST /tenants - Create a new partner tenant
tenantRoutes.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ error: 'Tenant name is required' }, 400);
  }

  const existing = await tenantRepo.findByName(body.name.trim());
  if (existing) {
    return c.json({ error: 'A tenant with this name already exists' }, 409);
  }

  const tenant = await tenantRepo.create({
    name: body.name.trim(),
    is_distributor: body.is_distributor ? 1 : 0,
  });
  return c.json({ data: tenant }, 201);
});

// PUT /tenants/:id - Update a tenant
tenantRoutes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const tenant = await tenantRepo.findById(id);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  const body = await c.req.json();
  const updateData: { name?: string; is_active?: number; is_distributor?: number } = {};
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.is_active !== undefined) updateData.is_active = body.is_active;
  if (body.is_distributor !== undefined) updateData.is_distributor = body.is_distributor;

  const updated = await tenantRepo.update(id, updateData);
  return c.json({ data: updated });
});

// DELETE /tenants/:id - Delete tenant (hard delete if no projects, soft delete otherwise)
tenantRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const tenant = await tenantRepo.findById(id);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  if (tenant.is_distributor) {
    return c.json({ error: 'Cannot delete a distributor tenant' }, 403);
  }

  // Check if tenant has projects
  const projects = await projectRepository.findAllByTenant(id);
  if (projects.length > 0) {
    return c.json({
      error: `Cannot delete tenant with ${projects.length} project(s). Remove all projects first or deactivate the tenant instead.`,
    }, 400);
  }

  // No projects — hard delete users and tenant
  const users = await userRepository.findAllByTenant(id);
  for (const user of users) {
    await userRepository.delete(user.id);
  }
  await tenantRepo.delete(id);

  return c.json({ message: 'Tenant deleted successfully' });
});

export default tenantRoutes;
