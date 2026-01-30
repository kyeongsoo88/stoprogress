import "./globals.css";

export const metadata = {
  title: "STO 매출 진척율 대시보드",
  description: "2026 매출 진척율 및 YoY 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}


