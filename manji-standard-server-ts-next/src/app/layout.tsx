export const metadata = {
  title: "manji-standard-server-ts-next",
  description: "Next.js + DDD scaffold",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
