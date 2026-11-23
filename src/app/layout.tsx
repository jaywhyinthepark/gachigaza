import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BNK 카풀",
  description: "동기들과 함께 이동하는 간편 카풀 게시판",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
