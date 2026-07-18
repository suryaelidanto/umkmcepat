import type { SVGProps } from "react";

type MascotComp = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

const viewBox = "0 0 64 64";

// "Kopi" — a coffee cup character, warm and grounded. Chosen mascot for
// UMKM Cepat's onboarding guide: maps to the warung / café / barista world
// of Indonesian small business, reads at favicon + tooltip sizes.
export function KopiMascot(props: SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle
        cx="32"
        cy="32"
        r="31"
        fill="#0d0d0c"
        stroke="rgba(255,255,255,0.08)"
      />
      <path
        d="M20 22 Q20 8 24 8 M28 22 Q28 6 32 6 M36 22 Q36 8 40 8"
        stroke="#e8c8a0"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M18 22 H46 L43 52 Q43 56 39 56 H25 Q21 56 21 52 Z"
        fill="#7a4a22"
      />
      <path
        d="M46 26 Q54 26 54 33 Q54 40 46 40"
        stroke="#7a4a22"
        strokeWidth="3.4"
        fill="none"
      />
      <circle cx="28" cy="33" r="2.6" fill="#fff" />
      <circle cx="38" cy="33" r="2.6" fill="#fff" />
      <circle cx="28.6" cy="32.4" r="1" fill="#0d0d0c" />
      <circle cx="38.6" cy="32.4" r="1" fill="#0d0d0c" />
      <path
        d="M28 42 Q33 46 38 42"
        stroke="#3a2410"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export const OnboardingMascot: MascotComp = KopiMascot;
