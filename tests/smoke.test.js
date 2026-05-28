import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('marketing-command smoke', () => {
  it('root returns non-500', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBeLessThan(500);
  });

  it('tools page returns non-500', async () => {
    const res = await request(app).get('/tools');
    expect(res.status).toBeLessThan(500);
  });

  it('admin dashboard redirects when not authenticated', async () => {
    const res = await request(app).get('/admin-dashboard');
    expect([302, 401]).toContain(res.status);
  });

  it('no secrets leak in root response', async () => {
    const res = await request(app).get('/');
    const body = String(res.text || '');
    const secretPatterns = [/api_key/i, /private_key/i];
    for (const pat of secretPatterns) {
      expect(pat.test(body)).toBe(false);
    }
  });
});
