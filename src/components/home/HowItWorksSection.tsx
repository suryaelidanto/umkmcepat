import { useEffect, useState } from "react";

import { SectionContainer } from "@/components/common/layout/PageContainer";
import { HOW_IT_WORKS_STEPS } from "@/components/home/how-it-works-data";
import { ScrollReveal } from "@/components/home/ScrollReveal";

const AUTO_PLAY_INTERVAL = 5000;

function StepVisual({
  stepId,
}: {
  stepId: (typeof HOW_IT_WORKS_STEPS)[number]["id"];
}) {
  const step = HOW_IT_WORKS_STEPS.find((candidate) => candidate.id === stepId);
  if (!step) {
    return null;
  }

  if (step.id === "describe") {
    return (
      <div className="flex size-full items-center justify-center p-3 sm:p-5">
        <div className="relative max-h-full max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_44px_-12px_rgba(0,0,0,0.35)]">
          <img
            src={step.imageSrc[0]}
            alt={step.imageAlt}
            className="max-h-[330px] w-auto max-w-full object-contain sm:max-h-[400px] lg:max-h-[440px]"
          />
        </div>
      </div>
    );
  }

  if (step.id === "generate") {
    return (
      <div className="flex size-full items-center justify-center p-3 sm:p-5">
        <div className="relative max-h-full w-full max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_44px_-12px_rgba(0,0,0,0.35)]">
          <img
            src={step.imageSrc[0]}
            alt={step.imageAlt}
            className="max-h-[330px] w-full object-contain sm:max-h-[400px] lg:max-h-[440px]"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex size-full max-w-full flex-col items-center justify-center gap-3.5 p-3 sm:gap-4 sm:p-5">
      <div className="max-h-[250px] w-full max-w-[560px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_44px_-12px_rgba(0,0,0,0.2)] sm:max-h-[330px]">
        <img
          src={step.imageSrc[0]}
          alt={step.imageAlt}
          className="size-full max-h-[250px] w-full object-contain sm:max-h-[330px]"
        />
      </div>
      <div className="w-full max-w-[300px] overflow-hidden rounded-xl border border-border bg-primary p-1.5 shadow-md sm:max-w-[380px]">
        <img
          src={step.imageSrc[1]}
          alt="Tautan website publik yang siap dibagikan"
          className="h-auto w-full object-contain"
        />
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const activeStep = HOW_IT_WORKS_STEPS[activeIndex] ?? HOW_IT_WORKS_STEPS[0];

  useEffect(() => {
    if (isPaused) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HOW_IT_WORKS_STEPS.length);
    }, AUTO_PLAY_INTERVAL);

    return () => clearInterval(timer);
  }, [isPaused, activeIndex]);

  return (
    <SectionContainer
      id="cara-kerja"
      size="default"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <ScrollReveal>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Tiga langkah mudah
          </h2>
          <p className="mt-spacing-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Tanpa coding, tanpa desainer. Cukup ceritakan usahamu dan biarkan
            kami yang membuatkan websitenya.
          </p>
        </div>
      </ScrollReveal>

      <div className="mt-spacing-10 grid items-center gap-spacing-8 lg:mt-spacing-12 lg:grid-cols-[400px_1fr] lg:gap-spacing-12">
        <ScrollReveal delay={0.08}>
          <ol className="flex flex-col gap-spacing-3 sm:gap-spacing-3.5">
            {HOW_IT_WORKS_STEPS.map((step, index) => {
              const isActive = index === activeIndex;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveIndex(index);
                    }}
                    aria-current={isActive ? "step" : undefined}
                    className={`group flex w-full cursor-pointer items-start gap-spacing-4 rounded-2xl p-spacing-4 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary sm:p-spacing-4.5 ${
                      isActive
                        ? "bg-card shadow-xs"
                        : "bg-transparent hover:bg-muted/40 hover:translate-x-1"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl font-mono text-xs font-bold transition-all duration-200 sm:size-8.5 ${
                        isActive
                          ? "bg-accent-orange text-white shadow-xs scale-105"
                          : "bg-muted text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground"
                      }`}
                    >
                      {step.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block text-base font-semibold tracking-tight transition-colors duration-200 sm:text-lg ${
                          isActive
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      >
                        {step.title}
                      </span>
                      <span
                        className={`mt-1 block text-xs leading-relaxed transition-colors duration-200 sm:text-sm ${
                          isActive
                            ? "text-muted-foreground"
                            : "text-muted-foreground/70"
                        }`}
                      >
                        {step.description}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </ScrollReveal>

        <ScrollReveal delay={0.16}>
          <div className="flex flex-col items-center gap-spacing-4">
            <div className="relative flex h-[360px] w-full max-w-full items-center justify-center overflow-hidden rounded-[26px] border border-black/8 bg-black/[0.02] p-2 dark:border-white/8 dark:bg-white/[0.02] sm:h-[440px] sm:p-4 lg:h-[480px]">
              <div
                key={activeStep.id}
                className="panel-step-in flex size-full max-w-full items-center justify-center overflow-hidden"
              >
                <StepVisual stepId={activeStep.id} />
              </div>
            </div>

            {/* Step indicator dots */}
            <div
              className="flex items-center gap-2"
              role="tablist"
              aria-label="Pilih langkah"
            >
              {HOW_IT_WORKS_STEPS.map((step, idx) => {
                const isCurrent = idx === activeIndex;
                return (
                  <button
                    key={`dot-${step.id}`}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    aria-label={`Langkah ${step.number}: ${step.title}`}
                    aria-current={isCurrent ? "true" : undefined}
                    className={`h-2 rounded-full cursor-pointer transition-all duration-300 ${
                      isCurrent
                        ? "w-8 bg-accent-orange"
                        : "w-2.5 bg-black/20 hover:bg-black/40 dark:bg-white/20 dark:hover:bg-white/40"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </SectionContainer>
  );
}
