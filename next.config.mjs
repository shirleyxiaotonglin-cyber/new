/** @type {import('next').NextConfig} */
const nextConfig = {
  /** 减轻部分环境下 HMR / 监听不稳定；文件系统异常时可设环境变量 WATCH_POLL=1 */
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        aggregateTimeout: 800,
        ignored: ["**/node_modules/**", "**/.git/**"],
      };
      if (process.env.WATCH_POLL === "1") {
        config.watchOptions.poll = 1000;
      }
      /* 修改代码后出现 Cannot find module './xxx.js' chunk 时：DISABLE_WEBPACK_CACHE=1 npm run dev */
      if (!isServer && process.env.DISABLE_WEBPACK_CACHE === "1") {
        config.cache = false;
      }
    }
    return config;
  },
};

export default nextConfig;
