/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // mss-protoc-gen が生成するファイルは Node.js ESM 互換のために `.js` 拡張子で
  // 相対 import する。webpack にその `.js` → `.ts` 解決を教える。
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
