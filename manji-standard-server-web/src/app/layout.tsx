// 手書き: App Router ルートレイアウト(生成物ではない — アプリの外枠)。
import type { ReactNode } from "react";

export const metadata = {
  title: "manji-standard-server-web",
  description: "契約(proto)→UI 生成のフロントエンド",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
