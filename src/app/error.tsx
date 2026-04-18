"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6">
      <p className="text-lg font-medium text-gray-900">出错了</p>
      <p className="max-w-md text-center text-sm text-gray-600">{error.message}</p>
      <button
        type="button"
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        onClick={() => reset()}
      >
        重试
      </button>
    </div>
  );
}
