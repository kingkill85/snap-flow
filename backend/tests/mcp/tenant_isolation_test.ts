import { assert, assertEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { projectRepository } from '../../src/repositories/project.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { listProjectsTool } from '../../src/services/mcp/tools/list-projects.ts';
import type { CreateTenantDTO, CreateUserDTO, CreateProjectDTO } from '../../src/models/index.ts';

Deno.test('Tenant A cannot see Tenant B projects via MCP', async () => {
  await setupTestDatabase();
  clearDatabase();

  const tenantA = await tenantRepository.create({ name: 'A' } as CreateTenantDTO);
  const tenantB = await tenantRepository.create({ name: 'B' } as CreateTenantDTO);
  const userA = await userRepository.create({
    email: 'isolationA@example.com', password_hash: 'x', role: 'user',
    full_name: 'A', tenant_id: tenantA.id,
  } as CreateUserDTO & { password_hash: string });

  await projectRepository.create({
    version_name: 'A-project', customer_name: 'Ax', tenant_id: tenantA.id,
  } as CreateProjectDTO);
  await projectRepository.create({
    version_name: 'B-secret', customer_name: 'Bx', tenant_id: tenantB.id,
  } as CreateProjectDTO);

  const tokenA = await generateToken(userA.id, userA.email, userA.role, userA.tenant_id);
  const result = await listProjectsTool.handler({ query: undefined }, { app, accessToken: tokenA });

  assertEquals(result.isError, undefined);
  const text = result.content[0].text;
  assert(text.includes('A-project'), 'must include own-tenant project');
  assert(!text.includes('B-secret'), 'must NOT include other-tenant project (cross-tenant leak!)');
});
