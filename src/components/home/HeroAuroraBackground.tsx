const heroGradient =
  "radial-gradient(circle at 50% 0%, rgba(21,21,21,1) 0%, rgba(21,21,21,0.95) 16%, rgba(33,55,90,0.9) 32%, rgba(71,119,239,0.92) 50%, rgba(236,126,229,0.94) 66%, rgba(255,31,128,0.98) 82%, rgba(255,94,39,1) 100%)";

const softDrift =
  "radial-gradient(ellipse at 24% 76%, rgba(255,31,128,0.22), transparent 34%), radial-gradient(ellipse at 78% 32%, rgba(84,137,255,0.2), transparent 36%)";

export function HeroAuroraBackground() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: heroGradient }} />
      <div className="absolute inset-0" style={{ background: softDrift }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 18%, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.38) 18%, transparent 42%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#151515] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#ff5e27] via-[#ff1f80]/58 to-transparent" />
    </div>
  );
}
