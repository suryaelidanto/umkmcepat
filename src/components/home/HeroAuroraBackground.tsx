export function HeroAuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="hero-aurora-orbs absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="hero-aurora-orb hero-aurora-orb-1" />
      <div className="hero-aurora-orb hero-aurora-orb-2" />
      <div className="hero-aurora-orb hero-aurora-orb-3" />
      <div className="hero-aurora-orb hero-aurora-orb-core" />
      <div className="hero-aurora-static-vignette" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#151515] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-aurora-orange via-aurora-rose/58 to-transparent" />
    </div>
  );
}
