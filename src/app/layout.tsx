import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "같이가자27행번",
  description: "BNK27행번 카풀게시판",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
