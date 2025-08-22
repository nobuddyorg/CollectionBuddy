import React from 'react';

export enum IconType {
  Google,
  Check,
  Trash,
  Edit,
  Coin,
  More,
  Close,
  Add,
  Pin,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Map,
  Gps,
  Frame,
}

interface IconProps extends React.SVGProps<SVGSVGElement> {
  icon: IconType;
  children?: React.ReactNode;
  rimId?: string;
}

export const Icon: React.FC<IconProps> = ({
  icon,
  rimId,
  children,
  ...props
}) => {
  switch (icon) {
    case IconType.Google:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" {...props}>
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
      );
    case IconType.Check:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...props}
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case IconType.Trash:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          {...props}
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    case IconType.Edit:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          {...props}
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      );
    case IconType.Coin:
      return (
        <svg viewBox="0 0 380 380" {...props}>
          <defs>
            <path
              id={rimId ?? 'rimTextPath'}
              d="M190,190 m-160,0 a160,160 0 1,1 320,0 a160,160 0 1,1 -320,0"
            />
          </defs>

          <circle
            cx="190"
            cy="190"
            r="180"
            fill="none"
            className="stroke-neutral-300 dark:stroke-neutral-700"
            strokeWidth="3"
            strokeDasharray="6 4"
            opacity="0.85"
          />
          <circle
            cx="190"
            cy="190"
            r="153"
            fill="none"
            className="stroke-neutral-300 dark:stroke-neutral-700"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.6"
          />

          <g
            transform="translate(190,135) scale(0.65,0.85)"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.9"
            className="stroke-neutral-300 dark:stroke-neutral-700"
          >
            <path d="M-128 0 L0 -64 L128 0 Z" />
            <line x1="-140" y1="0" x2="140" y2="0" />
            <line x1="-140" y1="10" x2="140" y2="10" />
            <rect x="-90" y="10" width="36" height="120" rx="4" />
            <rect x="-18" y="10" width="36" height="120" rx="4" />
            <rect x="54" y="10" width="36" height="120" rx="4" />
            <line x1="-82" y1="20" x2="-82" y2="122" opacity=".5" />
            <line x1="-72" y1="20" x2="-72" y2="122" opacity=".5" />
            <line x1="-62" y1="20" x2="-62" y2="122" opacity=".5" />
            <line x1="-10" y1="20" x2="-10" y2="122" opacity=".5" />
            <line x1="0" y1="20" x2="0" y2="122" opacity=".5" />
            <line x1="10" y1="20" x2="10" y2="122" opacity=".5" />
            <line x1="62" y1="20" x2="62" y2="122" opacity=".5" />
            <line x1="72" y1="20" x2="72" y2="122" opacity=".5" />
            <line x1="82" y1="20" x2="82" y2="122" opacity=".5" />
            <rect x="-150" y="132" width="300" height="22" />
            <rect x="-160" y="154" width="320" height="14" />
            <line x1="-170" y1="168" x2="170" y2="168" />
          </g>

          {children}
        </svg>
      );
    case IconType.More:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      );
    case IconType.Close:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          {...props}
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      );
    case IconType.Add:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...props}
        >
          <path d="M4 4h16v16H4z" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case IconType.Pin:
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path
            d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="12" cy="10" r="2" fill="currentColor" />
        </svg>
      );
    case IconType.ChevronLeft:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          {...props}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case IconType.ChevronRight:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          {...props}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
    case IconType.Plus:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...props}
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case IconType.Search:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...props}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case IconType.Map:
      return (
        <svg
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...props}
        >
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );
    case IconType.Gps:
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...props}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="22" x2="18" y1="12" y2="12" />
          <line x1="6" x2="2" y1="12" y2="12" />
          <line x1="12" y1="6" x2="12" y2="2" />
          <line x1="12" y1="22" x2="12" y2="18" />
        </svg>
      );
    case IconType.Frame:
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...props}
        >
          <path d="m21 21-6-6m6 6v-4m0 4h-4" />
          <path d="M3 3l6 6m-6-6v4m0-4h4" />
          <path d="M21 3l-6 6m6-6v4m0-4h-4" />
          <path d="M3 21l6-6m-6 6v-4m0 4h-4" />
        </svg>
      );
    default:
      return null;
  }
};

export default Icon;
