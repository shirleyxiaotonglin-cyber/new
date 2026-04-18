/**
 * 启动 Next 开发服务；若 PORT（默认 3000）被占用则顺延尝试，避免 EADDRINUSE。
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const nextCli = join(dirname(require.resolve("next/package.json")), "dist/bin/next");

function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.unref();
    s.once("error", () => resolve(false));
    s.listen(port, "0.0.0.0", () => {
      s.close(() => resolve(true));
    });
  });
}

async function pickPort(preferred, maxAttempts = 15) {
  for (let i = 0; i < maxAttempts; i++) {
    const p = preferred + i;
    // eslint-disable-next-line no-await-in-loop
    if (await portFree(p)) return p;
  }
  throw new Error(
    `无法在 ${preferred}-${preferred + maxAttempts - 1} 找到可用端口。请关闭占用进程或执行: lsof -i :3000`,
  );
}

const preferred = parseInt(process.env.PORT ?? "3000", 10);
const port = await pickPort(Number.isFinite(preferred) ? preferred : 3000);

if (port !== preferred) {
  console.info(`\n⚠  端口 ${preferred} 已被占用，已改用 http://localhost:${port}`);
} else {
  console.info(`\n▸  开发地址: http://localhost:${port}`);
}
console.info(`
   -----------------------------------------
   • 请只用这一地址访问；换端口会重新登录（Cookie 按端口区分）。
   • 自检: http://localhost:${port}/api/health
          http://localhost:${port}/api/diagnostics
   • 打不开 / 白屏 / Chunk 报错：在项目根目录执行  npm run recover  再  npm run dev
   -----------------------------------------
`);

const child = spawn(process.execPath, [nextCli, "dev", "-p", String(port)], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
