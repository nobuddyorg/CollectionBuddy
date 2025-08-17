'use client';

import React from 'react';
import ReactDOM from 'react-dom';

export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(children, document.body);
}
