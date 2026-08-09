import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.ts";
import { areaRepository } from "../repositories/area.ts";

const areaRoutes = new Hono();

// Validation schemas
const createAreaSchema = z.object({
  floorplan_id: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  name: z.string().optional(),
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
}).strict();

const updateAreaSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  revision: z.number().int().nonnegative().optional(),
  applicable_parameter_ids: z.array(z.number().int().positive()).optional(),
  zoning_values: z.array(
    z.object({
      parameter_id: z.number().int().positive(),
      value: z.number().int().min(0).max(9999),
    }).strict(),
  ).optional(),
}).strict().superRefine((value, ctx) => {
  const zoningFields = [
    value.revision,
    value.applicable_parameter_ids,
    value.zoning_values,
  ];
  if (
    zoningFields.some((entry) => entry !== undefined) &&
    zoningFields.some((entry) => entry === undefined)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "revision, applicable_parameter_ids and zoning_values are required together",
    });
  }
});

const updateVerticesSchema = z.object({
  vertices: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
}).strict();

const access = (c: { get(key: string): unknown }) => ({
  role: c.get("userRole") as string,
  tenantId: c.get("tenantId") as number,
});

// GET /areas - List areas for a floorplan
areaRoutes.get("/", authMiddleware, async (c) => {
  try {
    const floorplanId = c.req.query("floorplan_id");

    if (!floorplanId) {
      return c.json({ error: "Missing floorplan_id query parameter" }, 400);
    }

    const id = Number(floorplanId);
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid floorplan_id" }, 400);
    }
    if (!areaRepository.canAccessFloorplan(id, access(c))) {
      return c.json({ error: "Floorplan not found" }, 404);
    }
    const areas = await areaRepository.findByFloorplan(id, access(c));
    return c.json({ data: areas });
  } catch (error) {
    console.error("List areas error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /areas/:id - Get single area
areaRoutes.get("/:id", authMiddleware, async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  try {
    const area = await areaRepository.findById(id, access(c));
    if (!area) {
      return c.json({ error: "Area not found" }, 404);
    }

    return c.json({ data: area });
  } catch (error) {
    console.error("Get area error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /areas - Create area
areaRoutes.post(
  "/",
  authMiddleware,
  zValidator("json", createAreaSchema),
  async (c) => {
    const data = c.req.valid("json");

    try {
      if (
        !areaRepository.canAccessFloorplan(data.floorplan_id, access(c))
      ) return c.json({ error: "Floorplan not found" }, 404);
      const area = await areaRepository.create({
        floorplan_id: data.floorplan_id,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        name: data.name,
        color: data.color,
        opacity: data.opacity,
      });

      // Recheck containment — new area might cover existing items
      await areaRepository.recheckContainment(data.floorplan_id);

      return c.json({
        data: area,
        message: "Area created successfully",
      }, 201);
    } catch (error) {
      console.error("Create area error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// PUT /areas/:id - Update area properties
areaRoutes.put(
  "/:id",
  authMiddleware,
  zValidator("json", updateAreaSchema),
  async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }
    const data = c.req.valid("json");

    try {
      const existingArea = await areaRepository.findById(id, access(c));
      if (!existingArea) {
        return c.json({ error: "Area not found" }, 404);
      }

    const area = await areaRepository.updateProperties(id, data, access(c));

      return c.json({
        data: area,
        message: "Area updated successfully",
      });
    } catch (error) {
      if (
        error instanceof Error && error.message.startsWith("ZONING_CONFLICT:")
      ) {
        return c.json({
          error: error.message.slice(17),
          code: "RELOAD_REQUIRED",
        }, 409);
      }
      if (
        error instanceof Error && error.message.startsWith("ZONING_VALIDATION:")
      ) {
        return c.json({
          error: error.message.slice(19),
          details: { field: "zoning_values" },
        }, 400);
      }
      console.error("Update area error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// PUT /areas/:id/vertices - Replace all vertices
areaRoutes.put(
  "/:id/vertices",
  authMiddleware,
  zValidator("json", updateVerticesSchema),
  async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }
    const { vertices } = c.req.valid("json");

    try {
      const existingArea = await areaRepository.findById(id, access(c));
      if (!existingArea) {
        return c.json({ error: "Area not found" }, 404);
      }

      const area = await areaRepository.updateVertices(id, vertices);

      // Recheck containment — area shape changed
      await areaRepository.recheckContainment(existingArea.floorplan_id);

      return c.json({
        data: area,
        message: "Area vertices updated successfully",
      });
    } catch (error) {
      console.error("Update area vertices error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// DELETE /areas/:id - Delete area
areaRoutes.delete("/:id", authMiddleware, async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  try {
    const area = await areaRepository.findById(id, access(c));
    if (!area) {
      return c.json({ error: "Area not found" }, 404);
    }

    await areaRepository.delete(id);

    return c.json({
      message: "Area deleted successfully",
    });
  } catch (error) {
    console.error("Delete area error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default areaRoutes;
