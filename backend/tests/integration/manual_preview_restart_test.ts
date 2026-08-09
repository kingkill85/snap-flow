import { assertEquals, assertMatch } from '@std/assert';
import { startRestartableBackend } from '../restart-server-fixture.ts';

Deno.test('manual preview smoke survives restart and cleans project group', async () => {
  const server = await startRestartableBackend();
  try {
    let token = await server.login();
    const createdResponse = await server.request('/api/projects', {
      method: 'POST', token,
      body: { customer_name: 'PREVIEW-SMOKE-RESTART', version_name: 'Manual preview' },
    });
    assertEquals(createdResponse.status, 201);
    const created = (await createdResponse.json()).data;
    assertMatch(String(created.id), /^[1-9]\d*$/);
    assertMatch(String(created.project_group_id), /^[1-9]\d*$/);

    await server.restart();
    token = await server.login();
    assertEquals((await server.request(`/api/projects/${created.id}`, { token })).status, 200);
    assertEquals((await server.request(
      `/api/project-groups/${created.project_group_id}`, { token })).status, 200);

    assertEquals((await server.request(`/api/project-groups/${created.project_group_id}`, {
      method: 'DELETE', token,
    })).status, 200);
    assertEquals((await server.request(`/api/projects/${created.id}`, { token })).status, 404);
    assertEquals((await server.request(
      `/api/project-groups/${created.project_group_id}`, { token })).status, 404);

    // Recovery cleanup after normal cleanup remains bounded to the group route.
    assertEquals((await server.request(`/api/project-groups/${created.project_group_id}`, {
      method: 'DELETE', token,
    })).status, 404);
    assertEquals((await server.request(`/api/projects/${created.id}`, { token })).status, 404);
    assertEquals((await server.request(
      `/api/project-groups/${created.project_group_id}`, { token })).status, 404);
  } finally {
    await server.stop();
  }
});
