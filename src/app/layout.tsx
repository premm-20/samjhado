import type { Metadata } from "next";
import { Caveat, Geist, Instrument_Serif } from "next/font/google";
import "katex/dist/katex.min.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const hand = Caveat({ variable: "--font-hand", subsets: ["latin"], weight: ["500", "600", "700"] });
const display = Instrument_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "SamjhaDo · Book samjho whiteboard pe",
  description: "Upload any book, select what you don't understand, and an AI teacher explains it on a whiteboard in Hinglish.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${hand.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
