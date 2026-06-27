const baseGradient =
  "radial-gradient(circle at 50% 0%, rgba(21,21,21,1) 0%, rgba(21,21,21,0.95) 16%, rgba(33,55,90,0.9) 32%, rgba(71,119,239,0.92) 50%, rgba(236,126,229,0.94) 66%, rgba(255,31,128,0.98) 82%, rgba(255,94,39,1) 100%)";

const shiftedGradient =
  "radial-gradient(circle at 46% 4%, rgba(21,21,21,1) 0%, rgba(21,21,21,0.92) 14%, rgba(40,64,108,0.92) 31%, rgba(92,142,255,0.9) 49%, rgba(224,114,236,0.88) 65%, rgba(255,45,144,0.92) 82%, rgba(255,110,48,0.94) 100%)";

const warmDrift =
  "radial-gradient(ellipse at 24% 76%, rgba(255,31,128,0.34), transparent 34%)";

const coolDrift =
  "radial-gradient(ellipse at 78% 32%, rgba(84,137,255,0.32), transparent 36%)";

export function HeroAuroraBackground() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: baseGradient }} />
      <div
        className="hero-aurora-shift absolute inset-[-6%]"
        style={{ background: shiftedGradient }}
      />
      <div
        className="hero-aurora-drift absolute inset-[-12%] mix-blend-screen"
        style={{ background: `${warmDrift}, ${coolDrift}` }}
      />
      <div
        className="hero-aurora-vignette absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 18%, rgba(10,10,10,0.82) 0%, rgba(10,10,10,0.45) 18%, transparent 42%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#151515] to-transparent" />
      <div className="hero-aurora-bottom absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#ff5e27] via-[#ff1f80]/70 to-transparent" />
    </div>
  );
}
