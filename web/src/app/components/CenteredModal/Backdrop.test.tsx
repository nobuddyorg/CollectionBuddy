// @vitest-environment jsdom
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Backdrop } from './Backdrop';

describe('Backdrop', () => {
  it('hands a click to its handler', async () => {
    const onClick = vi.fn();
    const { container } = render(<Backdrop onClick={onClick} />);

    await userEvent.click(container.firstElementChild as HTMLElement);

    expect(onClick).toHaveBeenCalled();
  });
});
