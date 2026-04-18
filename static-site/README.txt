static-site — 纯 HTML 官网（静态托管）
=====================================

• index.html / login.html  使用 Tailwind CSS（CDN），无构建步骤。
• 登录、免费开始 等链接指向 **同目录下的 login.html**，再跳到本机 Next（避免 /login 在静态服务器上 404）。

⚠ 不要用绝对路径 /login 托管纯静态站——静态服务器上没有该文件，会 404。

与 Next 应用一起部署（推荐）
----------------------------
将本目录放到 Next 项目的 public/ 下（可选），或直接放在同一域名根路径：
  访问  https://你的域名/          → Next 首页（会检测登录跳转）
  或    https://你的域名/static-site/index.html  → 纯静态官网

仅部署静态官网（GitHub Pages 等）
--------------------------------
1. 上传 static-site/ 内文件到仓库。
2. 编辑 index.html 底部 script，设置 var APP_HOME = 'https://你的-next-应用.vercel.app';

本地预览
--------
  npx --yes serve static-site -p 5500
  浏览器打开 http://localhost:5500

注意：登录、项目、数据库等功能必须在 Next.js 应用中运行（npm run dev）。
