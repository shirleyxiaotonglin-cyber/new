"use client";

export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <p className="text-lg font-medium text-gray-900">页面加载出错</p>
      <p className="max-w-md text-sm text-gray-600">{error.message || "请刷新或返回重试"}</p>
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
