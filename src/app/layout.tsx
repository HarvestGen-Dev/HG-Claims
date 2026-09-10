import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
export const dynamic = "force-dynamic";
import { AuthProvider } from "@/lib/auth/context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NewLife Expense Claim Management System (NLCC)",
  description: "Digital expense claim, approval workflow, and reimbursement system for NewLife Community Church",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
