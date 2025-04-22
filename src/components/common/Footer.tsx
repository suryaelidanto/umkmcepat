import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto flex h-16 items-center justify-center px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-muted-foreground flex flex-wrap justify-center items-center gap-x-2 gap-y-1 px-4">
          <span>
            &copy; {currentYear} Dibuat oleh{
              " "
            }
            <Link
              href="https://github.com/suryaelidanto/tokko.online"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4"
            >
              @suryaelidanto
            </Link>
            . Open Source & Gratis.
          </span>
          <span className="hidden sm:inline">|</span>
          <span className="inline-block">
            Suka dengan tokko.online?{
              " "
            }
            <Link
              href="https://support.tokko.online/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Dukung pengembangan &#9749;
            </Link>
            .
          </span>
           <span className="hidden sm:inline">|</span>
           <span className="flex gap-x-2">
            <Link href="/privacy" className="font-medium underline underline-offset-4 hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="font-medium underline underline-offset-4 hover:text-foreground">Terms</Link>
           </span>
        </p>
      </div>
    </footer>
  );
} 