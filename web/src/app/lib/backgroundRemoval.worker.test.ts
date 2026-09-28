// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const handleRequest = vi.hoisted(() => vi.fn());
vi.mock('./backgroundRemovalJob', () => ({ handleRequest }));

describe('backgroundRemoval.worker', () => {
  it('answers each message from the page through postMessage', async () => {
    const postMessage = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {});
    handleRequest.mockImplementation(
      async (_request, reply: (answer: unknown) => void) => {
        reply({ kind: 'preloaded' });
      },
    );
    await import('./backgroundRemoval.worker');
    const request = {
      kind: 'preload',
      modelUrl: 'https://example.test/m.onnx',
    };

    window.onmessage!(new MessageEvent('message', { data: request }));

    expect(handleRequest).toHaveBeenCalledWith(request, expect.any(Function));
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ kind: 'preloaded' }),
    );
  });
});
