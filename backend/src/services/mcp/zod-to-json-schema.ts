import { z } from 'zod';

/**
 * Minimal Zod → JSON Schema converter, sufficient for the four v0 MCP tools.
 * Covers: top-level z.object with flat fields of z.string, z.number with
 * .int()/.positive()/.min()/.max() constraints, both optional and required.
 *
 * Does NOT handle nested objects, arrays, unions, transforms, etc. If we add
 * a tool that uses those, extend this or swap for the `zod-to-json-schema` npm
 * package.
 */
export function zodToJsonSchema(schema: z.ZodType): unknown {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const field = fieldSchema as z.ZodType;
      properties[key] = convertField(field);
      if (!(field instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    const result: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) result.required = required;
    result.additionalProperties = false;
    return result;
  }
  return { type: 'object' };
}

function convertField(field: z.ZodType): Record<string, unknown> {
  let inner: z.ZodType = field;
  if (field instanceof z.ZodOptional) {
    inner = field.unwrap() as z.ZodType;
  }
  if (inner instanceof z.ZodString) {
    return { type: 'string' };
  }
  if (inner instanceof z.ZodNumber) {
    const out: Record<string, unknown> = { type: 'integer' };
    // Inspect checks for min/max — Zod stores them on _def.checks
    const checks = (inner as unknown as { _def: { checks?: Array<{ kind: string; value?: number; inclusive?: boolean }> } })._def.checks ?? [];
    let isInt = false;
    for (const c of checks) {
      if (c.kind === 'int') isInt = true;
      if (c.kind === 'min' && typeof c.value === 'number') out.minimum = c.value;
      if (c.kind === 'max' && typeof c.value === 'number') out.maximum = c.value;
    }
    // If not declared int, switch to number
    if (!isInt) out.type = 'number';
    return out;
  }
  return {};
}
