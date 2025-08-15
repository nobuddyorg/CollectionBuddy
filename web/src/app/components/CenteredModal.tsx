'use client';
import React from 'react';
import ReactDOM from 'react-dom';

export default function CenteredModal({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => onOpenChange(false)}
      />
      {/* Modal */}
      <div
        className={`fixed inset-0 z-[81] flex items-center justify-center p-4 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-base font-semibold">{title}</h3>
            <button
              className="rounded-md px-3 py-1 text-sm border"
              onClick={() => onOpenChange(false)}
              aria-label={closeLabel}
            >
              {closeLabel}
            </button>
          </div>
          <div className="p-4 overflow-auto">{children}</div>
        </div>
      </div>
    </>,
    document.body
  );
}
