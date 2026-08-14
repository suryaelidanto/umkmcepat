export type MobileNavAuthStatus =
  "authenticated" | "loading" | "unauthenticated";

export type MobileNavPrimaryItem = {
  href: string;
  icon: "account" | "home" | "waitlist";
  label: string;
};

export type MobileNavOverflowItem = {
  href: string;
  label: string;
};

export type MobileNavModel = {
  overflow: MobileNavOverflowItem[];
  primary: MobileNavPrimaryItem[];
};

export function shouldRenderMobileNav(status: MobileNavAuthStatus): boolean {
  return status === "authenticated";
}

export function resolveMobileNavModel(input: {
  isAdmin: boolean;
  waitlisted: boolean;
}): MobileNavModel {
  const primary = input.waitlisted
    ? [
        { href: "/", icon: "home" as const, label: "Beranda" },
        { href: "/waitlist", icon: "waitlist" as const, label: "Antrean" },
      ]
    : [
        { href: "/", icon: "home" as const, label: "Beranda" },
        { href: "/profile", icon: "account" as const, label: "Akun" },
      ];

  const overflow: MobileNavOverflowItem[] = [
    { href: "/privacy", label: "Privasi" },
    { href: "/terms", label: "Syarat" },
  ];

  if (input.isAdmin) {
    overflow.push({ href: "/admin", label: "Admin" });
  }

  return { overflow, primary };
}
