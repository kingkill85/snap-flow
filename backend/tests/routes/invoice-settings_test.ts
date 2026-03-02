import { assertEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import after database setup
const { userRepository } = await import('../../src/repositories/user.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');

async function getAuthToken(): Promise<string> {
  clearDatabase();
  
  // Create user
  const passwordHash = hashPassword('password123');
  await userRepository.create({
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'user',
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

Deno.test('PUT /projects/:id/invoice-settings - should update invoice settings', async () => {
  const token = await getAuthToken();
  
  // Create a test project
  const project = await projectRepository.create({
    name: 'Test Project',
    customer_name: 'Test Customer',
  });
  
  try {
    const response = await testRequest(`/api/projects/${project.id}/invoice-settings`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        discount_percentage: 10,
        discount_usd: 100,
        services_percentage: 5,
        services_usd: 50,
        exchange_rate: 280,
        local_currency_code: 'PKR',
      }),
    });
    
    assertEquals(response.status, 200);
    
    const data = await parseJSON(response);
    assertEquals(data.data.discount_percentage, 10);
    assertEquals(data.data.discount_usd, 100);
    assertEquals(data.data.services_percentage, 5);
    assertEquals(data.data.services_usd, 50);
    assertEquals(data.data.exchange_rate, 280);
    assertEquals(data.data.local_currency_code, 'PKR');
  } finally {
    await projectRepository.delete(project.id);
    clearDatabase();
  }
});

Deno.test('PUT /projects/:id/invoice-settings - should return 404 for non-existent project', async () => {
  const token = await getAuthToken();
  
  const response = await testRequest('/api/projects/99999/invoice-settings', {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      discount_percentage: 10,
      discount_usd: 100,
    }),
  });
  
  assertEquals(response.status, 404);
  
  const data = await parseJSON(response);
  assertEquals(data.error, 'Project not found');
});

Deno.test('PUT /projects/:id/invoice-settings - should handle partial updates', async () => {
  const token = await getAuthToken();
  
  const project = await projectRepository.create({
    name: 'Test Project Partial',
    customer_name: 'Test Customer',
  });
  
  try {
    // First update
    await testRequest(`/api/projects/${project.id}/invoice-settings`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        discount_percentage: 10,
        discount_usd: 100,
      }),
    });
    
    // Partial update
    const response = await testRequest(`/api/projects/${project.id}/invoice-settings`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        services_usd: 200,
      }),
    });
    
    assertEquals(response.status, 200);
    
    const data = await parseJSON(response);
    assertEquals(data.data.discount_percentage, 10); // Should retain old value
    assertEquals(data.data.discount_usd, 100); // Should retain old value
    assertEquals(data.data.services_usd, 200); // Should be updated
  } finally {
    await projectRepository.delete(project.id);
    clearDatabase();
  }
});

Deno.test('GET /projects/:id/invoice-calculation - should return calculated invoice', async () => {
  const token = await getAuthToken();
  
  const project = await projectRepository.create({
    name: 'Test Project Calc',
    customer_name: 'Test Customer',
  });
  
  // Update invoice settings
  await projectRepository.updateInvoiceSettings(project.id, {
    discount_percentage: 10,
    discount_usd: 100,
    services_percentage: 5,
    services_usd: 50,
    exchange_rate: 280,
    local_currency_code: 'PKR',
  });
  
  try {
    const response = await testRequest(`/api/projects/${project.id}/invoice-calculation`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
      },
    });
    
    assertEquals(response.status, 200);
    
    const data = await parseJSON(response);
    assertEquals(typeof data.data.bomTotal, 'number');
    assertEquals(typeof data.data.grandTotalUsd, 'number');
    assertEquals(typeof data.data.grandTotalLocal, 'number');
  } finally {
    await projectRepository.delete(project.id);
    clearDatabase();
  }
});

Deno.test('GET /currency/exchange-rate/:code - should return exchange rate', async () => {
  const token = await getAuthToken();
  
  const response = await testRequest('/api/currency/exchange-rate/PKR', {
    headers: { 
      'Authorization': `Bearer ${token}`,
    },
  });
  
  assertEquals(response.status, 200);
  
  const data = await parseJSON(response);
  assertEquals(typeof data.data.rate, 'number');
  assertEquals(data.data.rate > 0, true);
  assertEquals(data.data.currencyCode, 'PKR');
});
