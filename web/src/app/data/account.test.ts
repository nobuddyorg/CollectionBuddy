import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import { deleteOwnAccount, listOwnImagePaths } from './account';

type PageCall = { args: [string, unknown[]][]; limit: unknown };

// A PostgREST builder that records each page's chain and answers it with `resolve(pageIndex)`.
function mockOwnImagesQuery(
  resolve: (page: number) => { data: unknown[] | null; error: unknown },
) {
  const pages: PageCall[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  let page: PageCall;
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      page.args.push([method, args]);
      return builder;
    };
  builder.select = (...args: unknown[]) => {
    page = { args: [['select', args]], limit: undefined };
    return builder;
  };
  builder.eq = record('eq');
  builder.gt = record('gt');
  builder.order = record('order');
  builder.limit = (limit: unknown) => {
    page.limit = limit;
    return builder;
  };
  builder.overrideTypes = () => {
    pages.push(page);
    return Promise.resolve(resolve(pages.length - 1));
  };
  const from = vi.fn().mockReturnValue(builder);
  vi.spyOn(supabase, 'from').mockImplementation(from);
  return { from, pages };
}

const photo = (n: number, thumb = true) => ({
  id: `photo-${String(n).padStart(4, '0')}`,
  path_full: `uid/item-${n}/full.webp`,
  path_thumb: thumb ? `uid/item-${n}/thumb.webp` : null,
});

function mockStorageRemove(result: { error: unknown } = { error: null }) {
  const remove = vi.fn().mockResolvedValue({ data: [], ...result });
  const bucket = vi.fn().mockReturnValue({ remove });
  vi.spyOn(supabase.storage, 'from').mockImplementation(bucket);
  return { bucket, remove };
}

function mockRpc(result: { error: unknown } = { error: null }) {
  const rpc = vi.fn().mockResolvedValue({ data: null, ...result });
  vi.spyOn(supabase, 'rpc').mockImplementation(rpc);
  return rpc;
}

function mockSignOut() {
  return vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('listOwnImagePaths', () => {
  it("reads the user's own photograph rows in id order and names both sizes of each", async () => {
    const { from, pages } = mockOwnImagesQuery(() => ({
      data: [photo(1), photo(2, false)],
      error: null,
    }));

    const listed = await listOwnImagePaths('uid');

    expect(listed).toEqual({
      data: [
        'uid/item-1/full.webp',
        'uid/item-1/thumb.webp',
        'uid/item-2/full.webp',
      ],
      error: null,
    });
    expect(from).toHaveBeenCalledWith('images');
    expect(pages).toEqual([
      {
        args: [
          ['select', ['id, path_full, path_thumb']],
          ['eq', ['user_id', 'uid']],
          ['order', ['id']],
        ],
        limit: 1000,
      },
    ]);
  });

  it('walks past the row cap, each page after the last id read', async () => {
    const full = Array.from({ length: 1000 }, (_, index) => photo(index));
    const { pages } = mockOwnImagesQuery((page) => ({
      data: page === 0 ? full : [photo(1000)],
      error: null,
    }));

    const listed = await listOwnImagePaths('uid');

    expect(listed.data).toHaveLength(2002);
    expect(pages).toHaveLength(2);
    expect(pages[1].args).toEqual([
      ['select', ['id, path_full, path_thumb']],
      ['eq', ['user_id', 'uid']],
      ['gt', ['id', full[999].id]],
      ['order', ['id']],
    ]);
  });

  // A partial list would read as "these are all its photographs", and the rest would stay stored.
  it('hands back a failed page instead of the paths read before it', async () => {
    const boom = new Error('page failed');
    const full = Array.from({ length: 1000 }, (_, index) => photo(index));
    mockOwnImagesQuery((page) =>
      page === 0 ? { data: full, error: null } : { data: null, error: boom },
    );

    expect(await listOwnImagePaths('uid')).toEqual({ data: null, error: boom });
  });
});

describe('deleteOwnAccount', () => {
  it('removes the photographs, then deletes the account, then ends the session in this browser', async () => {
    mockOwnImagesQuery(() => ({ data: [photo(1)], error: null }));
    const { bucket, remove } = mockStorageRemove();
    const rpc = mockRpc();
    const signOut = mockSignOut();

    expect(await deleteOwnAccount('uid')).toEqual({ error: null });

    expect(bucket).toHaveBeenCalledWith('item-images');
    expect(remove).toHaveBeenCalledWith([
      'uid/item-1/full.webp',
      'uid/item-1/thumb.webp',
    ]);
    expect(rpc).toHaveBeenCalledWith('delete_own_account');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[0],
    );
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it('deletes an account without photographs without calling Storage', async () => {
    mockOwnImagesQuery(() => ({ data: [], error: null }));
    const { remove } = mockStorageRemove();
    const rpc = mockRpc();
    mockSignOut();

    expect(await deleteOwnAccount('uid')).toEqual({ error: null });
    expect(remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('touches nothing when the photographs cannot be listed', async () => {
    const boom = new Error('list failed');
    mockOwnImagesQuery(() => ({ data: null, error: boom }));
    const { remove } = mockStorageRemove();
    const rpc = mockRpc();
    const signOut = mockSignOut();

    expect(await deleteOwnAccount('uid')).toEqual({ error: boom });
    expect(remove).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps the account when Storage refuses, so its rows still name what is left', async () => {
    const refusal = new Error('storage down');
    mockOwnImagesQuery(() => ({ data: [photo(1)], error: null }));
    mockStorageRemove({ error: refusal });
    const rpc = mockRpc();
    const signOut = mockSignOut();

    expect(await deleteOwnAccount('uid')).toEqual({ error: refusal });
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps the session when the account delete is refused', async () => {
    const refused = { code: 'PT409', message: 'photographs are still stored' };
    mockOwnImagesQuery(() => ({ data: [], error: null }));
    mockStorageRemove();
    mockRpc({ error: refused });
    const signOut = mockSignOut();

    expect(await deleteOwnAccount('uid')).toEqual({ error: refused });
    expect(signOut).not.toHaveBeenCalled();
  });
});
