import { Footer } from "@/components/common/Footer";
import { Header } from "@/components/common/Header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-surface-warm-white">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
