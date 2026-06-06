import clsx from 'clsx';

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'h-8 w-8 animate-spin rounded-full border-4 border-silver-light border-t-navy',
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
