import type { Metadata } from "next";
import "./globals.css";
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
      <body className="font-sans">
        <AuthProvider>
          <TopProgressBar />
          <WorkspaceFeedback />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}


