import { assertEquals } from '@std/assert';
import { z } from 'zod';
import { zodToJsonSchema } from '../../src/services/mcp/zod-to-json-schema.ts';

Deno.test('zodToJsonSchema', async (t) => {
  await t.step('optional string field', () => {
    const s = z.object({ query: z.string().optional() });
    assertEquals(zodToJsonSchema(s), {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    });
  });

  await t.step('required positive int', () => {
    const s = z.object({ project_id: z.number().int().positive() });
    assertEquals(zodToJsonSchema(s), {
      type: 'object',
      properties: { project_id: { type: 'integer', minimum: 0 } },
      required: ['project_id'],
      additionalProperties: false,
    });
  });

  await t.step('multiple fields with constraints', () => {
    const s = z.object({
      query: z.string().optional(),
      category_id: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    });
    const result = zodToJsonSchema(s) as Record<string, unknown>;
    const props = result.properties as Record<string, unknown>;
    assertEquals(props.query, { type: 'string' });
    assertEquals(props.category_id, { type: 'integer', minimum: 0 });
    assertEquals(props.limit, { type: 'integer', minimum: 1, maximum: 100 });
    assertEquals(result.required, undefined); // all optional
  });
});
