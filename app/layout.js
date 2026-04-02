import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const uiFont = DM_Sans({
  variable: "--font-ui",
  subsets: ["latin"]
});

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"]
});

export const metadata = {
  title: "Paste Logbook",
  description: "Paste-first markdown logbook with MongoDB cloud storage."
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className={`${uiFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}
