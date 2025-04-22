export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto flex h-16 items-center justify-center px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-muted-foreground flex flex-wrap justify-center items-center gap-x-2 gap-y-1 px-4">
          <span>
            Follow saya untuk mendapatkan tools legendary lainnya 👉 {" "}
            <a
              href="https://www.linkedin.com/in/cintarasuryaelidanto/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:underline underline-offset-4"
            >
              Cintara Surya Elidanto
            </a>
          </span>
          <span className="hidden sm:inline">|</span>
          <span className="inline-block">
            <a
              href="http://support.tokko.online/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4 hover:text-foreground"
            >
              Bantu tokko.online supaya tetap gratis di sini &#9749;
            </a>
          </span>
        </p>
      </div>
    </footer>
  );
}
