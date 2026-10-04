type ToastProps = {
  message: string;
};

export function Toast({ message }: ToastProps) {
  return (
    <div role="alert" className="pointer-events-none absolute bottom-4 right-4 max-w-[min(22rem,calc(100%-2rem))] rounded-md border border-[var(--error-border)] bg-[var(--error-surface)] px-3 py-2 text-sm text-[var(--error-text)] shadow-sm">
      {message}
    </div>
  );
}
