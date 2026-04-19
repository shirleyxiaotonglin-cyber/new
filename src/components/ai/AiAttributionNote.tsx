type Props = { model: string };

/**
 * 在智能功能区域标明：通过 OpenRouter 接入大语言模型，以及当前配置的模型 id（与服务器环境一致）。
 */
export function AiAttributionNote({ model }: Props) {
  return (
    <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
      <span className="text-gray-600">AI 接入：</span>
      <a
        href="https://openrouter.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-red-700 underline-offset-2 hover:underline"
      >
        OpenRouter
      </a>
      <span className="text-gray-400">（第三方模型聚合服务）</span>
      <span className="mx-1.5">·</span>
      <span className="text-gray-600">模型标识：</span>
      <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] text-gray-800">
        {model}
      </code>
      <span className="text-gray-400">
        （形如 <code className="rounded bg-gray-50 px-0.5 font-mono text-[10px]">厂商/模型名</code>，与 OpenRouter 控制台一致）
      </span>
    </p>
  );
}
