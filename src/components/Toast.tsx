type ToastProps = {
  message: string;
};

export function Toast({ message }: ToastProps) {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 max-w-[min(22rem,calc(100%-2rem))] rounded-md border border-[#e2b8ac] bg-[#fff8f6] px-3 py-2 text-sm text-[#79372c] shadow-sm dark:border-[#6b3932] dark:bg-[#281817] dark:text-[#ffc9bf]">
      {message}
    </div>
  );
}
