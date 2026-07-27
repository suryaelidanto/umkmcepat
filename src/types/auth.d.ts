import "@auth/core/types";

declare module "@auth/core/types" {
  interface Session {
    user?: {
      admin?: boolean;
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
