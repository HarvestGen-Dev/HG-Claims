import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
export const dynamic = "force-dynamic";
import { AuthProvider } from "@/lib/auth/context";
import { TopProgressBar } from "@/components/layout/TopProgressBar";
import { WorkspaceFeedback } from "@/components/layout/WorkspaceFeedback";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "New Life Expense Claim Management System",
  description: "Digital expense claim, approval workflow, and reimbursement system for New Life Community Church",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <TopProgressBar />
          <WorkspaceFeedback />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}


