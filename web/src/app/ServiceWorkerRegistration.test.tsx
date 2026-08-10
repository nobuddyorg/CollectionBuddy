// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ServiceWorkerRegistration } from './ServiceWorkerRegistration';

describe('ServiceWorkerRegistration', () => {
  it('renders nothing', () => {
    // jsdom has no serviceWorker support, so useServiceWorker's own guard
    // is what keeps this from touching a real registration call --
    // registration behavior itself is covered by useServiceWorker.test.ts.
    const { container } = render(<ServiceWorkerRegistration />);
    expect(container).toBeEmptyDOMElement();
  });
});
