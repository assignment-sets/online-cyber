import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "onlineCyber — Staff Terminal",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30 text-foreground">{children}</div>
  );
}
