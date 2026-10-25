import type { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'book'
  | 'chart'
  | 'trophy'
  | 'user'
  | 'bell'
  | 'help'
  | 'more'
  | 'check'
  | 'alert'
  | 'clock'
  | 'x-circle'
  | 'minus-circle'
  | 'external';

const paths: Record<IconName, ReactNode> = {
  home: <path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z" />,
  book: <path d="M4 4h7a3 3 0 0 1 1 .2V20a3 3 0 0 0-1-.2H4zM20 4h-7a3 3 0 0 0-1 .2V20a3 3 0 0 1 1-.2h7z" />,
  chart: <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8" />,
  trophy: <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4M12 14v4M8 21h8" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0z" />,
  bell: <path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" />,
  help: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="4" />,
  check: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6" />,
  alert: <path d="M12 3 2 20h20zM12 10v5M12 18v.01" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />,
  'x-circle': <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6" />,
  'minus-circle': <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8" />,
  external: <path d="M14 4h6v6M20 4 10 14M18 14v6H4V6h6" />,
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** Decorative inline icon. Always hidden from assistive tech; pair it with visible or accessible text. */
export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
