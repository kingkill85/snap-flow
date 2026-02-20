import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { floorplanRepository } from '../repositories/floorplan.ts';
import { projectRepository } from '../repositories/project.ts';
import { authMiddleware } from '../middleware/auth.ts';
import { uploadMiddleware } from '../middleware/upload.ts';
import { fileStorageService } from '../services/file-storage.ts';

// Extend Hono context types
declare module 'hono' {
  interface ContextVariableMap {
    uploadResult: { success: boolean; filePath?: string; error?: string; originalName?: string };
    formData: FormData;
  }
}

const floorplanRoutes = new Hono();

// Validation schemas
const createFloorplanSchema = z.object({
  project_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

const updateFloorplanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sort_order: z.number().int().optional(),
});

const reorderSchema = z.object({
  floorplan_ids: z.array(z.number().int().positive()),
});

// GET /floorplans - List all floorplans (for current project context)
floorplanRoutes.get('/', authMiddleware, async (c) => {
  try {
    const projectId = c.req.query('project_id');
    
    if (projectId) {
      const floorplans = await floorplanRepository.findByProject(parseInt(projectId));
      return c.json({ data: floorplans });
    }
    
    const floorplans = await floorplanRepository.findAll();
    return c.json({ data: floorplans });
  } catch (error) {
    console.error('List floorplans error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /floorplans/:id - Get single floorplan
floorplanRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  
  try {
    const floorplan = await floorplanRepository.findById(id);
    if (!floorplan) {
      return c.json({ error: 'Floorplan not found' }, 404);
    }
    
    return c.json({ data: floorplan });
  } catch (error) {
    console.error('Get floorplan error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /floorplans - Create floorplan with image upload
floorplanRoutes.post('/', authMiddleware, uploadMiddleware('floorplans'), async (c) => {
  try {
    const uploadResult = c.get('uploadResult');
    const formData = c.get('formData');

    if (!uploadResult || !uploadResult.success) {
      return c.json({ error: uploadResult?.error || 'Image upload failed' }, 400);
    }

    if (!formData) {
      return c.json({ error: 'No form data provided' }, 400);
    }

    const projectIdStr = formData.get('project_id')?.toString();
    const name = formData.get('name')?.toString();

    if (!projectIdStr || !name) {
      await fileStorageService.deleteFile(uploadResult.filePath!);
      return c.json({ error: 'Missing required fields: project_id, name' }, 400);
    }

    const project_id = parseInt(projectIdStr);

    // Check if project exists
    const project = await projectRepository.findById(project_id);
    if (!project) {
      await fileStorageService.deleteFile(uploadResult.filePath!);
      return c.json({ error: 'Project not found' }, 404);
    }

    // Create floorplan
    const floorplan = await floorplanRepository.create({
      project_id,
      name,
      image_path: uploadResult.filePath!,
    });

    return c.json({
      data: floorplan,
      message: 'Floorplan created successfully',
    }, 201);
  } catch (error) {
    console.error('Create floorplan error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /floorplans/:id - Update floorplan (with optional image upload)
floorplanRoutes.put('/:id', authMiddleware, uploadMiddleware('floorplans'), async (c) => {
  const id = parseInt(c.req.param('id'));
  const uploadResult = c.get('uploadResult');
  const formData = c.get('formData');

  try {
    const existingFloorplan = await floorplanRepository.findById(id);
    if (!existingFloorplan) {
      // Clean up uploaded file if floorplan doesn't exist
      if (uploadResult?.success && uploadResult.filePath) {
        await fileStorageService.deleteFile(uploadResult.filePath);
      }
      return c.json({ error: 'Floorplan not found' }, 404);
    }

    const updateData: { name?: string; sort_order?: number; image_path?: string } = {};

    // Handle form data fields
    if (formData) {
      const name = formData.get('name')?.toString();
      const sortOrderStr = formData.get('sort_order')?.toString();

      if (name !== undefined && name !== '') {
        updateData.name = name;
      }
      if (sortOrderStr !== undefined) {
        const sortOrder = parseInt(sortOrderStr);
        if (!isNaN(sortOrder)) {
          updateData.sort_order = sortOrder;
        }
      }

      // Handle new image upload
      if (uploadResult?.success && uploadResult.filePath) {
        // Delete old image file
        if (existingFloorplan.image_path) {
          await fileStorageService.deleteFile(existingFloorplan.image_path);
        }
        updateData.image_path = uploadResult.filePath;
      }
    }

    // Only update if there's data to update
    if (Object.keys(updateData).length === 0) {
      if (uploadResult?.success && uploadResult.filePath) {
        await fileStorageService.deleteFile(uploadResult.filePath);
      }
      return c.json({ error: 'No fields to update' }, 400);
    }

    const floorplan = await floorplanRepository.update(id, updateData);

    return c.json({
      data: floorplan,
      message: 'Floorplan updated successfully',
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (uploadResult?.success && uploadResult.filePath) {
      await fileStorageService.deleteFile(uploadResult.filePath);
    }
    console.error('Update floorplan error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /floorplans/:id - Delete floorplan
floorplanRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const floorplan = await floorplanRepository.findById(id);
    if (!floorplan) {
      return c.json({ error: 'Floorplan not found' }, 404);
    }

    // Delete image file
    if (floorplan.image_path) {
      await fileStorageService.deleteFile(floorplan.image_path);
    }

    await floorplanRepository.delete(id);
    
    return c.json({
      message: 'Floorplan deleted successfully',
    });
  } catch (error) {
    console.error('Delete floorplan error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /floorplans/reorder - Reorder floorplans
floorplanRoutes.patch('/reorder', authMiddleware, zValidator('json', reorderSchema), async (c) => {
  const { floorplan_ids } = c.req.valid('json');
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return c.json({ error: 'Missing project_id query parameter' }, 400);
  }

  try {
    await floorplanRepository.reorder(parseInt(projectId), floorplan_ids);
    
    return c.json({
      message: 'Floorplans reordered successfully',
    });
  } catch (error) {
    console.error('Reorder floorplans error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default floorplanRoutes;
