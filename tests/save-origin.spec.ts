import { expect, test } from '@playwright/test';

const path = '/api/journeys/f6415d57-e8fd-438b-81bd-3e01eccb1057/actions';
const writes = [
  { path, method: 'POST' },
  { path: '/api/journeys', method: 'POST' },
  { path: path.replace('/actions', ''), method: 'DELETE' },
  { path: path.replace('/actions', '/images'), method: 'POST' },
  { path: '/api/profile', method: 'PATCH' },
  { path: '/api/profile/avatar', method: 'POST' },
];

test('same-origin actions reach authentication; unrelated origins are rejected', async ({ request, baseURL }) => {
  // Empty payload and anonymous context cannot create a save record.
  for (const endpoint of writes) {
    const local = await request.fetch(endpoint.path, { method: endpoint.method, headers: { Origin: baseURL! }, data: {} });
    expect(local.status(), endpoint.path).toBe(401);
    for (const origin of ['https://unrelated.example', baseURL!.includes('localhost') ? 'http://192.168.1.4:3000' : 'http://localhost:3000']) {
      const rejected = await request.fetch(endpoint.path, { method: endpoint.method, headers: { Origin: origin }, data: {} });
      expect(rejected.status(), endpoint.path).toBe(403);
    }
  }
});
