import type { Metadata } from "next";
import "./globals.css";
import { Bricolage_Grotesque, Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const headings = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
export const dynamic = "force-dynamic";
import { AuthProvider } from "@/lib/auth/context";
import { TopProgressBar } from "@/components/layout/TopProgressBar";
import { WorkspaceFeedback } from "@/components/layout/WorkspaceFeedback";

export const metadata: Metadata = {
  title: "Harvest Generation | Claims Management",
  description: "Digital expense claim, approval workflow, and reimbursement system for Harvest Generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${headings.variable} font-sans`}>
        <AuthProvider>
          <TopProgressBar />
          <WorkspaceFeedback />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}


