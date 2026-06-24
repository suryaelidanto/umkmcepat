import { MainChrome } from "@/components/common/MainChrome";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainChrome>{children}</MainChrome>;
}
