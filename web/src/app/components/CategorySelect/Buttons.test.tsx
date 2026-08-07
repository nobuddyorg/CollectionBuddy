// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AddButton,
  CollapseButton,
  DeleteButtonWithLabel,
  ExpandButton,
  ExportButton,
} from './Buttons';

describe('AddButton', () => {
  it('keeps its label and marks itself busy while creating', () => {
    render(
      <AddButton
        onClick={vi.fn()}
        disabled={false}
        isCreating={true}
        label="Add"
      />,
    );
    // The label stays put rather than being swapped for a glyph -- the
    // spinner joins it, so the control still says what it does mid-flight.
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toHaveTextContent('Add');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows its label and fires onClick when not creating', async () => {
    const onClick = vi.fn();
    render(
      <AddButton
        onClick={onClick}
        disabled={false}
        isCreating={false}
        label="Add"
      />,
    );
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toHaveTextContent('Add');
    expect(button.querySelector('.animate-spin')).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disables the button when disabled is true', () => {
    render(
      <AddButton
        onClick={vi.fn()}
        disabled={true}
        isCreating={false}
        label="Add"
      />,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});

// Replaced SetButton, which re-selected the already-selected category and
// collapsed the panel -- it never set anything.
describe('CollapseButton', () => {
  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<CollapseButton onClick={onClick} label="Close" />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('DeleteButtonWithLabel', () => {
  it('disables the button when disabled is true', () => {
    render(
      <DeleteButtonWithLabel
        onClick={vi.fn()}
        disabled={true}
        label="Delete"
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('fires onClick when enabled and clicked', async () => {
    const onClick = vi.fn();
    render(
      <DeleteButtonWithLabel
        onClick={onClick}
        disabled={false}
        label="Delete"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('ExportButton', () => {
  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(
      <ExportButton
        onClick={onClick}
        disabled={false}
        isExporting={false}
        label="Export"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps its label and marks itself busy while exporting', () => {
    render(
      <ExportButton
        onClick={vi.fn()}
        disabled={true}
        isExporting={true}
        label="Export"
      />,
    );
    const button = screen.getByRole('button', { name: 'Export' });
    // Named throughout, not replaced by a spinner: an export can run for
    // minutes, and a button that loses its label for that long stops
    // saying what is happening.
    expect(button).toHaveTextContent('Export');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('cannot be fired a second time while one export is running', async () => {
    const onClick = vi.fn();
    render(
      <ExportButton
        onClick={onClick}
        disabled={true}
        isExporting={true}
        label="Export"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ExpandButton', () => {
  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<ExpandButton onClick={onClick} label="Edit" />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
