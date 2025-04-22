import { Button } from "@/components/ui/button";
import { Coffee, Linkedin } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-background py-4">
      <div className="container mx-auto flex flex-col sm:flex-row h-auto sm:h-16 items-center justify-center px-4 sm:px-6 lg:px-8 gap-4">
        <div className="flex items-center justify-center gap-x-4">
          <Button variant="outline" size="sm" asChild>
            <Link
              href="https://www.linkedin.com/in/cintarasuryaelidanto/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Linkedin className="h-4 w-4 mr-1.5" /> Follow LinkedIn
            </Link>
          </Button>

          <Button variant="outline" size="sm" asChild>
            <Link
              href="http://support.tokko.online/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Coffee className="h-4 w-4 mr-1.5" /> Support Developer
            </Link>
          </Button>
        </div>
      </div>
    </footer>
  );
}
