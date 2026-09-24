// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderCard } from './ItemCard.test-support';

describe('ItemCard drag-and-drop upload', () => {
  beforeEach(() => {
    // Pins the locale so the labels don't depend on jsdom's navigator.language default.
    window.localStorage.setItem('lang', 'en');
  });

  it('hands a dropped file to onUpload', () => {
    const handlers = renderCard();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const card = screen.getByTestId('item-card');
    fireEvent.drop(card, { dataTransfer: { files: [file] } });
    expect(handlers.onUpload).toHaveBeenCalledWith(file);
  });

  it('highlights the card while a file is dragged over it', () => {
    renderCard();
    const card = screen.getByTestId('item-card');
    fireEvent.dragEnter(card);
    expect(card.className).toMatch(/outline-foreground/);
    fireEvent.dragLeave(card);
    expect(card.className).not.toMatch(/outline-foreground/);
  });

  // A toggle on either event would drop the highlight as the drag crosses into a child element.
  it('keeps the highlight while the drag crosses a child element', () => {
    renderCard();
    const card = screen.getByTestId('item-card');
    fireEvent.dragEnter(card); // enters the card
    fireEvent.dragEnter(card); // enters a child within it
    fireEvent.dragLeave(card); // leaves that child, still over the card
    expect(card.className).toMatch(/outline-foreground/);
    fireEvent.dragLeave(card); // leaves the card itself
    expect(card.className).not.toMatch(/outline-foreground/);
  });

  it('does not highlight the card while an upload is in flight', () => {
    renderCard({}, { pendingUploads: 1 });
    const card = screen.getByTestId('item-card');
    fireEvent.dragEnter(card);
    expect(card.className).not.toMatch(/outline-foreground/);
  });

  it('does not highlight a read-only (shared) card', () => {
    renderCard({}, { readOnly: true });
    const card = screen.getByTestId('item-card');
    fireEvent.dragEnter(card);
    expect(card.className).not.toMatch(/outline-foreground/);
  });

  // A drop is allowed only if something cancels dragover; fireEvent's return value reports that.
  it('marks the card a valid drop target while dragging over it', () => {
    renderCard();
    const card = screen.getByTestId('item-card');
    expect(fireEvent.dragOver(card)).toBe(false);
  });

  it('refuses to become a drop target while an upload is in flight', () => {
    renderCard({}, { pendingUploads: 1 });
    const card = screen.getByTestId('item-card');
    expect(fireEvent.dragOver(card)).toBe(true);
  });

  it('refuses to become a drop target on a read-only (shared) card', () => {
    renderCard({}, { readOnly: true });
    const card = screen.getByTestId('item-card');
    expect(fireEvent.dragOver(card)).toBe(true);
  });

  it('leaves drag-leave alone while an upload is in flight', () => {
    renderCard({}, { pendingUploads: 1 });
    const card = screen.getByTestId('item-card');
    expect(fireEvent.dragLeave(card)).toBe(true);
  });

  it('leaves drag-leave alone on a read-only (shared) card', () => {
    renderCard({}, { readOnly: true });
    const card = screen.getByTestId('item-card');
    expect(fireEvent.dragLeave(card)).toBe(true);
  });

  it('ignores a drop while an upload is in flight', () => {
    const handlers = renderCard({}, { pendingUploads: 1 });
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const card = screen.getByTestId('item-card');
    fireEvent.drop(card, { dataTransfer: { files: [file] } });
    expect(handlers.onUpload).not.toHaveBeenCalled();
  });

  it('ignores a drop on a read-only (shared) card', () => {
    const handlers = renderCard({}, { readOnly: true });
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const card = screen.getByTestId('item-card');
    fireEvent.drop(card, { dataTransfer: { files: [file] } });
    expect(handlers.onUpload).not.toHaveBeenCalled();
  });
});
