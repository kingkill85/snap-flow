import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';
import { getDb } from '../../src/config/database.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');


async function getAuthToken(): Promise<string> {
  clearDatabase();

  // Create user
  const passwordHash = hashPassword('password123');
  await userRepository.create({
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'tenant_admin',
    tenant_id: 1,
  });

  // Login
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  return loginData.data.accessToken;
}

Deno.test('Project - can create project', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Test Customer',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.customer_name, 'Test Customer');
  assertExists(data.data.id);
});

Deno.test('Project - can create project without status', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Default Status Customer',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertExists(data.data.id);
});

Deno.test('Project - cannot create project without customer_name', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_email: 'test@example.com',
    }),
  });

  assertEquals(response.status, 400);
});

Deno.test('Project - can list projects', async () => {
  const token = await getAuthToken();

  // Create a project
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'List Test Customer',
    }),
  });

  const response = await testRequest('/api/projects', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(Array.isArray(data.data), true);
});

Deno.test('Project - can search projects', async () => {
  const token = await getAuthToken();

  // Create projects
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'John Doe',
    }),
  });

  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Jane Smith',
    }),
  });

  // Search by customer name
  const response = await testRequest('/api/projects?search=John Doe', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(Array.isArray(data.data), true);
  // Should find the searchable project
  const found = data.data.some((p: { customer_name: string }) => p.customer_name === 'John Doe');
  assertEquals(found, true);
});

Deno.test('Project - can get single project', async () => {
  const token = await getAuthToken();

  // Create a project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Single Get Customer',
    }),
  });

  const createData = await parseJSON(createResponse);
  const projectId = createData.data.id;

  // Get the project
  const response = await testRequest(`/api/projects/${projectId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.customer_name, 'Single Get Customer');
});

Deno.test('Project - get non-existent project returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects/99999', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Project not found');
});

Deno.test('Project - can update project', async () => {
  const token = await getAuthToken();

  // Create a project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Update Test Customer',
    }),
  });

  const createData = await parseJSON(createResponse);
  const projectId = createData.data.id;

  // Update the project (version_name only)
  const response = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      version_name: 'v2',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.version_name, 'v2');
});

Deno.test('Project - update non-existent project returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects/99999', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      version_name: 'v99',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Project not found');
});

Deno.test('Project - can delete project (admin)', async () => {
  const token = await getAuthToken();

  // Create first project version
  const createResponse1 = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Delete Test Customer',
      version_name: 'v1',
    }),
  });
  assertEquals(createResponse1.status, 201);

  const createData1 = await parseJSON(createResponse1);
  const projectId = createData1.data.id;

  // Create a second version via the project-groups API
  const createVersionResponse = await testRequest(`/api/project-groups/${createData1.data.project_group_id}/versions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      version_name: 'v2',
      source_project_id: projectId,
    }),
  });
  assertEquals(createVersionResponse.status, 201);

  // Now delete the first version — should succeed since it's not the last
  const deleteResponse = await testRequest(`/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  assertEquals(deleteResponse.status, 200);
});

Deno.test('Project - delete non-existent project returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects/99999', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Project not found');
});

Deno.test('Project - can create projects for different customers', async () => {
  const token = await getAuthToken();

  // Create first project for Customer A
  const response1 = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Customer A',
    }),
  });

  assertEquals(response1.status, 201);

  // Create second project with same name for Customer B
  const response2 = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Customer B',
    }),
  });

  assertEquals(response2.status, 201);
});

Deno.test('Project - can create project with all customer fields', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Complete Customer',
      customer_email: 'john@example.com',
      customer_phone: '+1 234 567 8900',
      customer_address: '123 Main St, City, Country',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.customer_name, 'Complete Customer');
  assertEquals(data.data.customer_email, 'john@example.com');
  assertEquals(data.data.customer_phone, '+1 234 567 8900');
  assertEquals(data.data.customer_address, '123 Main St, City, Country');
});

Deno.test('Project - cannot access without auth', async () => {
  const response = await testRequest('/api/projects');
  assertEquals(response.status, 401);
});

// ── Delete Tests ─────────────────────────────────────────────────

Deno.test('Project - can delete a non-last version', async () => {
  const token = await getAuthToken();

  // Create group with v1
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ customer_name: 'Delete Version Test' }),
  });
  assertEquals(createResponse.status, 201);
  const projectData = await parseJSON(createResponse);
  const groupId = projectData.data.project_group_id;

  // Create v2
  const v2Response = await testRequest(`/api/project-groups/${groupId}/versions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ version_name: 'v2', source_project_id: projectData.data.id }),
  });
  assertEquals(v2Response.status, 201);
  const v2Data = await parseJSON(v2Response);

  // Delete v1 - should succeed (not the last version)
  const deleteResponse = await testRequest(`/api/projects/${projectData.data.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  assertEquals(deleteResponse.status, 200);

  // Verify v2 still exists
  const getResponse = await testRequest(`/api/projects/${v2Data.data.id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(getResponse.status, 200);
});

Deno.test('Project - cannot delete the only version', async () => {
  const token = await getAuthToken();

  // Create group with single version
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ customer_name: 'Last Version Test' }),
  });
  assertEquals(createResponse.status, 201);
  const projectData = await parseJSON(createResponse);

  // Delete the only version - should fail (must delete the group instead)
  const deleteResponse = await testRequest(`/api/projects/${projectData.data.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  assertEquals(deleteResponse.status, 400);
  const data = await parseJSON(deleteResponse);
  assertEquals(data.error.includes('only version'), true);
});

Deno.test('Project Group - cannot delete group if versions have data', async () => {
  const token = await getAuthToken();

  // Create group with version
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ customer_name: 'Group Deletion Test' }),
  });
  assertEquals(createResponse.status, 201);
  const projectData = await parseJSON(createResponse);
  const groupId = projectData.data.project_group_id;
  const projectId = projectData.data.id;

  // Directly insert a floorplan (data) to block group deletion
  const db = getDb();
  db.query(
    'INSERT INTO floorplans (project_id, name, image_path, sort_order) VALUES (?, ?, ?, ?)',
    [projectId, 'Test Floorplan', 'floorplans/test123.png', 0]
  );

  // Delete the group - should be blocked because version has data
  const deleteResponse = await testRequest(`/api/project-groups/${groupId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  assertEquals(deleteResponse.status, 400);
  const data = await parseJSON(deleteResponse);
  assertEquals(data.error.includes('Cannot delete project group'), true);

  // Data should still exist
  const floorplans = db.queryEntries('SELECT 1 FROM floorplans WHERE project_id = ?', [projectId]);
  assertEquals(floorplans.length, 1, 'floorplans should still exist');
});

Deno.test('Project Group - can delete empty group', async () => {
  const token = await getAuthToken();

  // Create group with version but NO data
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ customer_name: 'Empty Group Test' }),
  });
  assertEquals(createResponse.status, 201);
  const projectData = await parseJSON(createResponse);
  const groupId = projectData.data.project_group_id;
  const _projectId = projectData.data.id;

  // No floorplans, BOM, etc. - group is empty
  // Delete the group - should succeed
  const deleteResponse = await testRequest(`/api/project-groups/${groupId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  assertEquals(deleteResponse.status, 200);

  // Verify the group and version are gone
  const db = getDb();
  const projects = db.queryEntries('SELECT 1 FROM projects WHERE project_group_id = ?', [groupId]);
  assertEquals(projects.length, 0, 'projects should be deleted');

  const groups = db.queryEntries('SELECT 1 FROM project_groups WHERE id = ?', [groupId]);
  assertEquals(groups.length, 0, 'project_group should be deleted');
});

Deno.test('Project Group - cannot delete non-existent group', async () => {
  const token = await getAuthToken();

  const deleteResponse = await testRequest('/api/project-groups/99999', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  assertEquals(deleteResponse.status, 404);
  const data = await parseJSON(deleteResponse);
  assertEquals(data.error, 'Project group not found');
});

Deno.test('Project Group - user cannot delete group', async () => {
  clearDatabase();

  // Create user with role 'user'
  const userHash = hashPassword('userpass');
  await userRepository.create({
    email: 'user@example.com',
    password_hash: userHash,
    role: 'user',
    tenant_id: 1,
  });

  // Login as regular user
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'userpass' }),
  });
  const loginData = await parseJSON(loginResponse);
  const userToken = loginData.data.accessToken;

  // Create group as tenant_admin
  const adminHash = hashPassword('adminpass');
  await userRepository.create({
    email: 'admin2@example.com',
    password_hash: adminHash,
    role: 'tenant_admin',
    tenant_id: 1,
  });

  const adminLogin = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin2@example.com', password: 'adminpass' }),
  });
  const adminData = await parseJSON(adminLogin);
  const adminToken = adminData.data.accessToken;

  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ customer_name: 'User Deletion Test' }),
  });
  const groupData = await parseJSON(createResponse);

  // Regular user tries to delete group - should be 403
  const deleteResponse = await testRequest(`/api/project-groups/${groupData.data.project_group_id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${userToken}` },
  });

  assertEquals(deleteResponse.status, 403);
  const data = await parseJSON(deleteResponse);
  assertEquals(data.error, 'Forbidden - Users cannot delete project groups');
});
