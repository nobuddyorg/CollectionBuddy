import { createClient } from '@supabase/supabase-js';

import { expect, test } from '../test';
import { apiAs, context } from './helpers';

// The sweep's plan lists every collector's unreferenced photographs; only the Management API's read-only query may run it.
test.describe('orphan_sweep_plan (the orphan sweep query)', () => {
  const args = { max_objects: 10 };

  test('a signed-in collector cannot run it', async () => {
    const { token } = context();

    const { data, error, status } = await apiAs(token).rpc(
      'orphan_sweep_plan',
      args,
    );
    expect(data).toBeNull();
    expect(error!.message).toBe(
      'permission denied for function orphan_sweep_plan',
    );
    expect(status).toBe(403);
  });

  test('a visitor with no session cannot run it', async () => {
    const anon = createClient(
      process.env.E2E_SUPABASE_URL!,
      process.env.E2E_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const { data, error, status } = await anon.rpc('orphan_sweep_plan', args);
    expect(data).toBeNull();
    expect(error!.message).toBe(
      'permission denied for function orphan_sweep_plan',
    );
    expect(status).toBe(401);
  });
});
