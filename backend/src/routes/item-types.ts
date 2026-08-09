import { type Context, Hono, type Next } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { adminMiddleware, authMiddleware } from "../middleware/auth.ts";
import { itemTypeRepository } from "../repositories/item-type.ts";
import {
  ZoningConflictError,
  zoningParameterRepository,
  ZoningValidationError,
} from "../repositories/zoning-parameter.ts";

const itemTypeRoutes = new Hono();

const createItemTypeSchema = z.object({
  name: z.string().min(1).max(100),
  abbreviation: z.string().min(1).max(10),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().optional(),
});

const updateItemTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  abbreviation: z.string().min(1).max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.number()),
}).strict();
const parameterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  sort_order: z.number().int().nonnegative().optional(),
}).strict();
const parameterUpdateSchema = parameterSchema.partial().refine((value) =>
  Object.keys(value).length > 0
);
const parameterReorderSchema = z.object({
  ids: z.array(z.number().int().positive()),
}).strict();
const emptyParameterActionSchema = z.object({}).strict();
const optionalEmptyParameterActionBody = async (c: Context, next: Next) => {
  const rawBody = await c.req.raw.clone().text();
  if (!rawBody.trim()) return await next();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({
      error: "Invalid request body",
      details: { field: "body", message: "Expected valid JSON" },
    }, 400);
  }
  const result = emptyParameterActionSchema.safeParse(body);
  if (!result.success) {
    return c.json({
      error: "Invalid request body",
      details: result.error.flatten(),
    }, 400);
  }
  return await next();
};
const positiveId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};
const parameterError = (c: Context, error: unknown) => {
  if (error instanceof ZoningConflictError) {
    return c.json({ error: error.message, code: "PARAMETER_IN_USE" }, 409);
  }
  if (error instanceof ZoningValidationError) {
    return c.json({ error: error.message, details: { field: "name" } }, 400);
  }
  console.error("Zoning parameter error:", error);
  return c.json({ error: "Internal server error" }, 500);
};

// GET /item-types - List all
itemTypeRoutes.get("/", authMiddleware, async (c) => {
  try {
    const includeInactive = c.req.query("include_inactive") === "true";
    const types = await itemTypeRepository.findAll(includeInactive);
    return c.json({ data: types });
  } catch (error) {
    console.error("List item types error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /item-types - Create (admin)
itemTypeRoutes.post(
  "/",
  authMiddleware,
  adminMiddleware,
  zValidator("json", createItemTypeSchema),
  async (c) => {
    const { name, abbreviation, color, sort_order } = c.req.valid("json");
    try {
      const existing = await itemTypeRepository.findByName(name);
      if (existing) {
        return c.json({
          error: "Item type with this name already exists",
        }, 400);
      }
      const createData: {
        name: string;
        abbreviation: string;
        color?: string;
        sort_order?: number;
      } = { name, abbreviation };
      if (color !== undefined) createData.color = color;
      if (sort_order !== undefined) createData.sort_order = sort_order;
      const type = await itemTypeRepository.create(createData);
      return c.json(
        { data: type, message: "Item type created successfully" },
        201,
      );
    } catch (error) {
      console.error("Create item type error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// PATCH /item-types/reorder - MUST be before /:id routes
itemTypeRoutes.patch(
  "/reorder",
  authMiddleware,
  adminMiddleware,
  zValidator("json", reorderSchema),
  async (c) => {
    const { ids } = c.req.valid("json");
    try {
      await itemTypeRepository.reorder(ids);
      const types = await itemTypeRepository.findAll(true);
      return c.json({ data: types });
    } catch (error) {
      console.error("Reorder item types error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// Nested zoning routes must precede the /:id catch-all.
itemTypeRoutes.get("/:id/zoning-parameters", authMiddleware, async (c) => {
  const id = positiveId(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  if (!await itemTypeRepository.findById(id)) {
    return c.json({ error: "Product Type not found" }, 404);
  }
  const includeInactive = c.req.query("include_inactive") === "true" &&
    c.get("userRole") === "admin";
  return c.json({
    data: zoningParameterRepository.findAll(id, includeInactive),
  });
});

itemTypeRoutes.post(
  "/:id/zoning-parameters",
  authMiddleware,
  adminMiddleware,
  zValidator("json", parameterSchema),
  (c) => {
    const id = positiveId(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    try {
      const data = c.req.valid("json");
      return c.json({
        data: zoningParameterRepository.create(id, data.name, data.sort_order),
      }, 201);
    } catch (error) {
      return parameterError(c, error);
    }
  },
);

itemTypeRoutes.patch(
  "/:id/zoning-parameters/reorder",
  authMiddleware,
  adminMiddleware,
  zValidator("json", parameterReorderSchema),
  (c) => {
    const id = positiveId(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    try {
      return c.json({
        data: zoningParameterRepository.reorder(id, c.req.valid("json").ids),
      });
    } catch (error) {
      return parameterError(c, error);
    }
  },
);

itemTypeRoutes.put(
  "/:id/zoning-parameters/:parameterId",
  authMiddleware,
  adminMiddleware,
  zValidator("json", parameterUpdateSchema),
  (c) => {
    const id = positiveId(c.req.param("id"));
    const parameterId = positiveId(c.req.param("parameterId"));
    if (!id || !parameterId) return c.json({ error: "Invalid ID" }, 400);
    try {
      const input = c.req.valid("json");
      const data: { name?: string; sort_order?: number } = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.sort_order !== undefined) data.sort_order = input.sort_order;
      const parameter = zoningParameterRepository.update(id, parameterId, data);
      return parameter
        ? c.json({ data: parameter })
        : c.json({ error: "Parameter not found" }, 404);
    } catch (error) {
      return parameterError(c, error);
    }
  },
);

for (const action of ["activate", "deactivate"] as const) {
  itemTypeRoutes.patch(
    `/:id/zoning-parameters/:parameterId/${action}`,
    authMiddleware,
    adminMiddleware,
    optionalEmptyParameterActionBody,
    (c) => {
      const id = positiveId(c.req.param("id"));
      const parameterId = positiveId(c.req.param("parameterId"));
      if (!id || !parameterId) return c.json({ error: "Invalid ID" }, 400);
      try {
        const parameter = zoningParameterRepository.setActive(
          id,
          parameterId,
          action === "activate",
        );
        return parameter
          ? c.json({ data: parameter })
          : c.json({ error: "Parameter not found" }, 404);
      } catch (error) {
        return parameterError(c, error);
      }
    },
  );
}

itemTypeRoutes.delete(
  "/:id/zoning-parameters/:parameterId",
  authMiddleware,
  adminMiddleware,
  (c) => {
    const id = positiveId(c.req.param("id"));
    const parameterId = positiveId(c.req.param("parameterId"));
    if (!id || !parameterId) return c.json({ error: "Invalid ID" }, 400);
    try {
      return zoningParameterRepository.delete(id, parameterId)
        ? c.json({ message: "Parameter deleted" })
        : c.json({ error: "Parameter not found" }, 404);
    } catch (error) {
      return parameterError(c, error);
    }
  },
);

// GET /item-types/:id
itemTypeRoutes.get("/:id", authMiddleware, async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    const type = await itemTypeRepository.findById(id);
    if (!type) return c.json({ error: "Item type not found" }, 404);
    return c.json({ data: type });
  } catch (error) {
    console.error("Get item type error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /item-types/:id - Update (admin)
itemTypeRoutes.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  zValidator("json", updateItemTypeSchema),
  async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
    const { name, abbreviation, color, sort_order, is_active } = c.req.valid(
      "json",
    );
    try {
      if (name) {
        const existing = await itemTypeRepository.findByName(name);
        if (existing && existing.id !== id) {
          return c.json({
            error: "Item type with this name already exists",
          }, 400);
        }
      }
      const updateData: Record<string, string | number | boolean> = {};
      if (name !== undefined) updateData.name = name;
      if (abbreviation !== undefined) updateData.abbreviation = abbreviation;
      if (color !== undefined) updateData.color = color;
      if (sort_order !== undefined) updateData.sort_order = sort_order;
      if (is_active !== undefined) updateData.is_active = is_active;
      const type = await itemTypeRepository.update(id, updateData);
      if (!type) return c.json({ error: "Item type not found" }, 404);
      return c.json({ data: type, message: "Item type updated successfully" });
    } catch (error) {
      console.error("Update item type error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// DELETE /item-types/:id (admin)
itemTypeRoutes.delete("/:id", authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    const type = await itemTypeRepository.findById(id);
    if (!type) return c.json({ error: "Item type not found" }, 404);
    await itemTypeRepository.delete(id);
    return c.json({ message: "Item type deleted successfully" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot delete")) {
      return c.json({ error: error.message }, 400);
    }
    console.error("Delete item type error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /item-types/:id/deactivate (admin)
itemTypeRoutes.patch(
  "/:id/deactivate",
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
    try {
      const type = await itemTypeRepository.deactivate(id);
      if (!type) return c.json({ error: "Item type not found" }, 404);
      return c.json({ data: type, message: "Item type deactivated" });
    } catch (error) {
      console.error("Deactivate item type error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// PATCH /item-types/:id/activate (admin)
itemTypeRoutes.patch(
  "/:id/activate",
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);
    try {
      const type = await itemTypeRepository.activate(id);
      if (!type) return c.json({ error: "Item type not found" }, 404);
      return c.json({ data: type, message: "Item type activated" });
    } catch (error) {
      console.error("Activate item type error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

export { itemTypeRoutes };
