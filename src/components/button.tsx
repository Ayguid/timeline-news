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
 * Tracks which async tasks are in flight. Each task id is tracked
 * individually — so toggling one source disables/spins ONLY that button,
 * while other buttons stay usable. Guards against *re-entry of the same id*
 * (double-click the same button does nothing), but does NOT globally block
 * unrelated buttons.
 */
export function usePending<T extends string = string>() {
  const [pending, setPending] = useState<ReadonlySet<T>>(new Set());
  const active = useRef<Set<T>>(new Set());

  async function run(id: T, task: () => Promise<unknown>): Promise<void> {
    if (active.current.has(id)) return; // this id already running — swallow
    active.current.add(id);
    setPending(new Set(active.current));
    try {
      await task();
    } finally {
      active.current.delete(id);
      setPending(new Set(active.current));
    }
  }

  const isPending = (id: T) => pending.has(id);
  return { pending, run, isPending, isAnythingPending: pending.size > 0 };
}