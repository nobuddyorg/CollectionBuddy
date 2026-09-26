import { describe, expect, it } from 'vitest';

import { isTransientUploadError } from './importPhoto';

describe('isTransientUploadError', () => {
  // storage-js reports a request that never got an answer without any status.
  it('retries a failure that got no response at all', () => {
    expect(isTransientUploadError({})).toBe(true);
  });

  it('retries a rate limit and a server error, by HTTP status or by Storage code', () => {
    expect(isTransientUploadError({ status: 429, statusCode: '429' })).toBe(
      true,
    );
    expect(isTransientUploadError({ status: 500, statusCode: '500' })).toBe(
      true,
    );
    expect(
      isTransientUploadError({ status: 502, statusCode: 'Bad Gateway' }),
    ).toBe(true);
    expect(isTransientUploadError({ status: 400, statusCode: '503' })).toBe(
      true,
    );
  });

  // Storage answers a duplicate, an oversize file or a policy refusal with HTTP 400 and the real code in the body.
  it('gives up at once on a refusal no retry can change', () => {
    for (const statusCode of ['400', '403', '409', '413', '415']) {
      expect(isTransientUploadError({ status: 400, statusCode })).toBe(false);
    }
    expect(isTransientUploadError({ status: 403, statusCode: '403' })).toBe(
      false,
    );
    expect(
      isTransientUploadError({ status: 400, statusCode: 'InvalidRequest' }),
    ).toBe(false);
    expect(isTransientUploadError({ status: 400 })).toBe(false);
  });

  it('draws the line at 500, and counts only 429 among the 4xx', () => {
    expect(isTransientUploadError({ status: 499, statusCode: '499' })).toBe(
      false,
    );
    expect(isTransientUploadError({ status: 428, statusCode: '428' })).toBe(
      false,
    );
    expect(isTransientUploadError({ status: 430, statusCode: '430' })).toBe(
      false,
    );
  });
});
