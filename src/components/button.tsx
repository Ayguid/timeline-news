'use client';

import { useRef, useState } from 'react';

/**
 * Reusable Button with built-in pending state — shows a spinner and disables
 * itself while the async `action` is running, so users can't double-submit
 * (toggle a source/topic twice, etc.).
 *
 * props:
 *   children   label (shown when not loading)
 *   onClick    (e) => void | Promise<void>  — promise resolves => loading clears
 *   loading    force a loading state (e.g. parent-controlled), default false
 *   variant    'primary' | 'ghost' | 'danger' | 'pill'
 *   size       'sm' | 'md'
 *   disabled   extra disable condition (in addition to while-loading)
 *   title, className, style  pass-through
 */
export type ButtonProps = {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
  type?: 'button' | 'submit';
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger' | 'pill';
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function Button({
  children,
  onClick,
  type = 'button',
  loading = false,
  variant = 'primary',
  size = 'md',
  disabled = false,
  title,
  className,
  style,
}: ButtonProps) {
  const busyRef = useRef(false);
  const [internalLoading, setInternalLoading] = useState(false);

  const isLoading = loading || internalLoading;

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (busyRef.current) return; // swallow re-entry while one task is in flight
    if (!onClick) return;
    busyRef.current = true;
    setInternalLoading(true);
    try {
      await onClick(e);
    } finally {
      busyRef.current = false;
      setInternalLoading(false);
    }
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled || isLoading}
      title={title}
      className={[variant === 'primary' ? '' : `btn-${variant}`, className ?? ''].join(' ').trim()}
      style={style}
    >
      {isLoading ? <Spinner size={size === 'sm' ? 9 : 11} /> : children}
    </button>
  );
}

/** Small inline spinner. Color follows currentColor (set via button color). */
export function Spinner({ size = 11 }: { size?: number }) {
  return (
    <span
      className="spinner"
      aria-hidden
      style={{ width: size, height: size, display: 'inline-block', verticalAlign: '-2px' }}
    />
  );
}

/**
 * Tracks which async task is in flight so callers can coordinate buttons
 * (e.g. only one toggle at a time across a list). Used with plain <button>s
 * that need manual control, or to pass `loading` to <Button>.
 */
export function usePending<T extends string = string>() {
  const [pendingId, setPendingId] = useState<T | null>(null);
  const busy = useRef(false);

  async function run(id: T, task: () => Promise<unknown>): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setPendingId(id);
    try {
      await task();
    } finally {
      busy.current = false;
      setPendingId(null);
    }
  }

  return { pendingId, run, isPending: (id: T) => pendingId === id };
}