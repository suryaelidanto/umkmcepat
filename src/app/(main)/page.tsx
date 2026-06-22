import { HomePromptForm } from "@/components/projects/HomePromptForm";

export default function HomePage() {
  return (
    <div className="bg-[#151515] text-surface-warm-white">
      <section className="relative isolate flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-spacing-14 sm:px-spacing-9 lg:px-spacing-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(21,21,21,1)_0%,rgba(21,21,21,0.95)_16%,rgba(33,55,90,0.9)_32%,rgba(71,119,239,0.92)_50%,rgba(236,126,229,0.94)_66%,rgba(255,31,128,0.98)_82%,rgba(255,94,39,1)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_18%,rgba(10,10,10,0.82)_0%,rgba(10,10,10,0.45)_18%,transparent_42%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-[#151515] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-44 bg-gradient-to-t from-[#ff5e27] via-[#ff1f80]/70 to-transparent" />

        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <h1 className="max-w-4xl text-balance text-[clamp(3rem,6vw,5.4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-surface-warm-white">
            Usahamu layak punya website. 100% gratis.
          </h1>
          <p className="mt-spacing-7 max-w-2xl text-balance text-lg leading-7 text-surface-warm-white/72 sm:text-xl">
            Ceritakan usahamu, lalu biarkan AI menyusunnya jadi halaman online
            yang profesional dan siap kamu bagikan.
          </p>

          <HomePromptForm />
        </div>
      </section>
    </div>
  );
}
