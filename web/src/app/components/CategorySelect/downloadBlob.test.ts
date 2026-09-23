// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { downloadBlob } from './downloadBlob';

describe('downloadBlob', () => {
  let createObjectURL: Mock<(obj: Blob) => string>;
  let revokeObjectURL: Mock<(url: string) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clicks a temporary anchor pointed at the blob, under the given filename', () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const blob = new Blob(['content']);

    downloadBlob(blob, 'archive.zip');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.href).toBe('blob:fake-url');
    expect(anchor.download).toBe('archive.zip');
  });

  it('removes the anchor from the document once clicked', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const before = document.body.children.length;

    downloadBlob(new Blob(['x']), 'a.zip');

    expect(document.body.children.length).toBe(before);
  });

  it('revokes the object URL on the next tick, not synchronously', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['x']), 'a.zip');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });
});
