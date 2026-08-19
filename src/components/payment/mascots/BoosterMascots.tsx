export type MascotState = "idle" | "selected" | "launching";

interface MascotProps {
  state?: MascotState;
  className?: string;
}

/**
 * Pocket Mascot: The Eager Scarf Otter
 * - idle: Cute friendly face with orange scarf.
 * - selected: Cheerful "^ ^" eyes, cute blushing cheeks, thumbs up with sparkling star.
 * - launching: Sprint Dash pose with wind trails and flying scarf!
 */
export function PocketMascot({
  state = "idle",
  className = "size-12",
}: MascotProps) {
  const isSelected = state === "selected" || state === "launching";
  const isLaunching = state === "launching";

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300 ${
        isLaunching
          ? "scale-125 -translate-x-1 -translate-y-1 animate-pulse"
          : isSelected
            ? "scale-110 -rotate-2"
            : "hover:scale-105"
      }`}
    >
      {/* Background Soft Glow */}
      {isSelected && (
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="#f97316"
          fillOpacity={isLaunching ? "0.3" : "0.15"}
        />
      )}

      {/* Wind Trails when Launching */}
      {isLaunching && (
        <g
          stroke="#f97316"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.8"
        >
          <path d="M10 38H2M14 48H4M8 58H1" className="animate-ping" />
          <path d="M85 75L94 82M82 85L90 91" />
        </g>
      )}

      {/* Ears */}
      <circle cx={isLaunching ? "24" : "26"} cy="30" r="10" fill="#92623b" />
      <circle cx={isLaunching ? "24" : "26"} cy="30" r="6" fill="#d99f73" />
      <circle cx={isLaunching ? "72" : "74"} cy="30" r="10" fill="#92623b" />
      <circle cx={isLaunching ? "72" : "74"} cy="30" r="6" fill="#d99f73" />

      {/* Head */}
      <ellipse
        cx="50"
        cy={isLaunching ? "44" : "46"}
        rx="28"
        ry="24"
        fill="#a47148"
      />

      {/* Face Muzzle Patch */}
      <ellipse
        cx="50"
        cy={isLaunching ? "51" : "53"}
        rx="18"
        ry="13"
        fill="#ecd0b2"
      />

      {/* Eyes & Expression */}
      {isLaunching ? (
        <>
          <path
            d="M37 40L44 43M44 40L37 43"
            stroke="#1c1c1c"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M57 43L64 40M57 40L64 43"
            stroke="#1c1c1c"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <ellipse
            cx="32"
            cy="49"
            rx="5"
            ry="3"
            fill="#f43f5e"
            fillOpacity="0.7"
          />
          <ellipse
            cx="68"
            cy="49"
            rx="5"
            ry="3"
            fill="#f43f5e"
            fillOpacity="0.7"
          />
        </>
      ) : isSelected ? (
        <>
          <path
            d="M38 41C38 37 44 37 44 41"
            stroke="#1c1c1c"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M56 41C56 37 62 37 62 41"
            stroke="#1c1c1c"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <ellipse
            cx="33"
            cy="50"
            rx="5"
            ry="3"
            fill="#f43f5e"
            fillOpacity="0.5"
          />
          <ellipse
            cx="67"
            cy="50"
            rx="5"
            ry="3"
            fill="#f43f5e"
            fillOpacity="0.5"
          />
        </>
      ) : (
        <>
          <circle cx="41" cy="41" r="3.8" fill="#1c1c1c" />
          <circle cx="42.5" cy="39.5" r="1.3" fill="#ffffff" />
          <circle cx="59" cy="41" r="3.8" fill="#1c1c1c" />
          <circle cx="60.5" cy="39.5" r="1.3" fill="#ffffff" />
        </>
      )}

      {/* Nose */}
      <ellipse
        cx="50"
        cy={isLaunching ? "47" : "49"}
        rx="4.5"
        ry="3.2"
        fill="#1c1c1c"
      />

      {/* Mouth */}
      {isLaunching ? (
        <path
          d="M43 51C46 58 54 58 57 51Z"
          fill="#e11d48"
          stroke="#1c1c1c"
          strokeWidth="2"
        />
      ) : isSelected ? (
        <path
          d="M45 53C47 57 53 57 55 53"
          stroke="#1c1c1c"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M46 53C48 55 52 55 54 53"
          stroke="#1c1c1c"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}

      {/* Body / Torso */}
      <ellipse cx="50" cy="74" rx="20" ry="16" fill="#a47148" />
      <ellipse cx="50" cy="76" rx="13" ry="11" fill="#ecd0b2" />

      {/* Orange Scarf */}
      <path
        d={
          isLaunching
            ? "M28 58C36 63 64 63 72 58C74 61 68 66 50 66C32 66 26 61 28 58Z"
            : "M30 60C36 65 64 65 70 60C72 63 68 68 50 68C32 68 28 63 30 60Z"
        }
        fill="#f97316"
      />
      {/* Scarf Tail */}
      <path
        d={
          isLaunching
            ? "M54 64C62 66 75 64 86 58C78 68 66 72 52 68L54 64"
            : "M54 66C56 71 58 76 60 80C56 81 53 80 51 75L53 66"
        }
        fill="#ea580c"
      />

      {/* Thumbs-up or Sprint Hand */}
      {isLaunching ? (
        <g>
          <ellipse cx="78" cy="52" rx="6" ry="5" fill="#a47148" />
          <ellipse cx="22" cy="68" rx="6" ry="5" fill="#a47148" />
        </g>
      ) : isSelected ? (
        <g className="animate-bounce">
          <ellipse cx="74" cy="62" rx="5" ry="4" fill="#a47148" />
          <path
            d="M75 60L77 54C78 52 80 53 80 55L78 61"
            stroke="#a47148"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M85 45L86.5 48.5L90 49L87.5 51.5L88 55L85 53.5L82 55L82.5 51.5L80 49L83.5 48.5L85 45Z"
            fill="#facc15"
          />
        </g>
      ) : null}
    </svg>
  );
}

/**
 * Starter Mascot: The Hardworking Shopkeeper Otter
 * - idle: Waving with apron.
 * - selected: Jumping excitement, energy spark badge in hand.
 * - launching: Energy Overdrive charging leap with twin lightning bolts!
 */
export function StarterMascot({
  state = "idle",
  className = "size-12",
}: MascotProps) {
  const isSelected = state === "selected" || state === "launching";
  const isLaunching = state === "launching";

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300 ${
        isLaunching
          ? "scale-125 translate-y-[-4px] animate-pulse"
          : isSelected
            ? "scale-110 rotate-2"
            : "hover:scale-105"
      }`}
    >
      {/* Background Soft Glow */}
      {isSelected && (
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="#ea580c"
          fillOpacity={isLaunching ? "0.32" : "0.18"}
        />
      )}

      {/* Lightning energy burst if launching */}
      {isLaunching && (
        <g fill="#facc15" stroke="#d97706" strokeWidth="1">
          <path
            d="M12 25L8 38H16L11 50L22 36H15L18 25H12Z"
            className="animate-bounce"
          />
          <path
            d="M88 25L84 38H92L87 50L98 36H91L94 25H88Z"
            className="animate-bounce"
          />
        </g>
      )}

      {/* Ears */}
      <circle cx="26" cy="28" r="9.5" fill="#8c5830" />
      <circle cx="26" cy="28" r="5.5" fill="#d99f73" />
      <circle cx="74" cy="28" r="9.5" fill="#8c5830" />
      <circle cx="74" cy="28" r="5.5" fill="#d99f73" />

      {/* Head */}
      <ellipse cx="50" cy="44" rx="27" ry="23" fill="#9e663a" />

      {/* Shopkeeper Cap */}
      <path d="M32 30C35 18 65 18 68 30C68 33 32 33 32 30Z" fill="#059669" />
      <path d="M28 32C35 28 65 28 72 32C74 34 26 34 28 32Z" fill="#047857" />
      <circle cx="50" cy="24" r="2.5" fill="#facc15" />

      {/* Face Muzzle Patch */}
      <ellipse cx="50" cy="51" rx="17" ry="12" fill="#ecd0b2" />

      {/* Eyes & Expression */}
      {isLaunching ? (
        <>
          <path
            d="M37 36L44 42M37 42L44 36"
            stroke="#f59e0b"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M56 36L63 42M56 42L63 36"
            stroke="#f59e0b"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M43 49C43 57 57 57 57 49Z"
            fill="#e11d48"
            stroke="#1c1c1c"
            strokeWidth="2"
          />
        </>
      ) : isSelected ? (
        <>
          <path
            d="M39 39C39 35 45 35 45 39"
            stroke="#1c1c1c"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M55 39C55 35 61 35 61 39"
            stroke="#1c1c1c"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M44 50C44 56 56 56 56 50Z"
            fill="#e11d48"
            stroke="#1c1c1c"
            strokeWidth="2"
          />
          <ellipse
            cx="33"
            cy="48"
            rx="4.5"
            ry="2.5"
            fill="#fb7185"
            fillOpacity="0.6"
          />
          <ellipse
            cx="67"
            cy="48"
            rx="4.5"
            ry="2.5"
            fill="#fb7185"
            fillOpacity="0.6"
          />
        </>
      ) : (
        <>
          <circle cx="41" cy="39" r="3.5" fill="#1c1c1c" />
          <circle cx="42.5" cy="37.5" r="1.2" fill="#ffffff" />
          <circle cx="59" cy="39" r="3.5" fill="#1c1c1c" />
          <circle cx="60.5" cy="37.5" r="1.2" fill="#ffffff" />
          <path
            d="M46 51C48 53 52 53 54 51"
            stroke="#1c1c1c"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Nose */}
      <ellipse cx="50" cy="46" rx="4" ry="3" fill="#1c1c1c" />

      {/* Body & Shopkeeper Apron */}
      <ellipse cx="50" cy="73" rx="19" ry="15" fill="#9e663a" />
      <path
        d="M38 60L40 85C40 86 60 86 60 85L62 60C56 61 44 61 38 60Z"
        fill="#059669"
      />
      <path
        d="M41 57L44 62M59 57L56 62"
        stroke="#047857"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="45" y="70" width="10" height="8" rx="2" fill="#047857" />

      {/* Energy Bolt Hands */}
      {isLaunching ? (
        <g className="animate-spin">
          <circle cx="50" cy="74" r="7" fill="#facc15" />
          <path d="M50 68L47 74H52L49 80L55 73H50L53 68H50Z" fill="#ea580c" />
        </g>
      ) : isSelected ? (
        <g className="animate-pulse">
          <ellipse cx="72" cy="55" rx="5" ry="5" fill="#9e663a" />
          <path
            d="M74 48L69 55H73L70 62L77 54H73L76 48H74Z"
            fill="#f59e0b"
            stroke="#d97706"
            strokeWidth="1"
          />
        </g>
      ) : (
        <ellipse cx="73" cy="54" rx="4.5" ry="4.5" fill="#9e663a" />
      )}
    </svg>
  );
}

/**
 * Popular Mascot: The Superhero / High-Flyer Otter (Best Seller)
 * - idle: Confident superhero cape pose.
 * - selected: Hero cape billowing, glowing chest badge, golden sparks.
 * - launching: Super Sonic flight pose with thruster flames & superhero takeoff!
 */
export function PopularMascot({
  state = "idle",
  className = "size-12",
}: MascotProps) {
  const isSelected = state === "selected" || state === "launching";
  const isLaunching = state === "launching";

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300 ${
        isLaunching
          ? "scale-130 -translate-y-2 rotate-[-6deg] animate-pulse"
          : isSelected
            ? "scale-115 -rotate-1"
            : "hover:scale-105"
      }`}
    >
      {/* Background Radiance Glow */}
      {isSelected && (
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="#f59e0b"
          fillOpacity={isLaunching ? "0.35" : "0.22"}
        />
      )}

      {/* Rocket Flames when launching */}
      {isLaunching && (
        <g className="animate-bounce">
          <path d="M42 85L50 99L58 85Z" fill="#f97316" />
          <path d="M46 85L50 94L54 85Z" fill="#facc15" />
        </g>
      )}

      {/* Flowing Red Superhero Cape */}
      <path
        d={
          isLaunching
            ? "M20 38C4 50 6 92 18 96C30 80 34 60 36 48M80 38C96 50 94 92 82 96C70 80 66 60 64 48"
            : isSelected
              ? "M24 45C10 52 8 82 22 88C32 75 35 60 36 50M76 45C90 52 92 82 78 88C68 75 65 60 64 50"
              : "M28 48C18 55 16 78 26 84C32 74 34 62 36 52M72 48C82 55 84 78 74 84C68 74 66 62 64 52"
        }
        fill="#e11d48"
        stroke="#be123c"
        strokeWidth="1.5"
      />

      {/* Ears */}
      <circle cx="26" cy="27" r="9.5" fill="#784620" />
      <circle cx="26" cy="27" r="5.5" fill="#e89d6e" />
      <circle cx="74" cy="27" r="9.5" fill="#784620" />
      <circle cx="74" cy="27" r="5.5" fill="#e89d6e" />

      {/* Head */}
      <ellipse cx="50" cy="43" rx="27" ry="23" fill="#8f5728" />

      {/* Hero Mask */}
      <path
        d="M30 38C34 32 46 32 49 38C50 39 50 39 51 38C54 32 66 32 70 38C72 44 65 48 57 46C53 45 51 43 50 43C49 43 47 45 43 46C35 48 28 44 30 38Z"
        fill="#0284c7"
      />
      <circle cx="41" cy="38" r="4.5" fill="#ffffff" />
      <circle cx="59" cy="38" r="4.5" fill="#ffffff" />

      {/* Eyes & Smirk */}
      {isLaunching ? (
        <>
          <circle cx="41" cy="38" r="3" fill="#facc15" />
          <circle cx="59" cy="38" r="3" fill="#facc15" />
          <path
            d="M44 50C48 58 56 58 58 50Z"
            fill="#e11d48"
            stroke="#1c1c1c"
            strokeWidth="2"
          />
        </>
      ) : isSelected ? (
        <>
          <circle cx="42" cy="38" r="2.5" fill="#0f172a" />
          <circle cx="43" cy="37" r="1" fill="#ffffff" />
          <circle cx="60" cy="38" r="2.5" fill="#0f172a" />
          <circle cx="61" cy="37" r="1" fill="#ffffff" />
          <path
            d="M45 52C48 57 55 56 57 52"
            stroke="#1c1c1c"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="41" cy="38" r="2.5" fill="#0f172a" />
          <circle cx="42" cy="37" r="1" fill="#ffffff" />
          <circle cx="59" cy="38" r="2.5" fill="#0f172a" />
          <circle cx="60" cy="37" r="1" fill="#ffffff" />
          <path
            d="M47 52C49 54 53 54 55 52"
            stroke="#1c1c1c"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Nose */}
      <ellipse cx="50" cy="47" rx="3.8" ry="2.8" fill="#1c1c1c" />

      {/* Body & Hero Suit */}
      <ellipse cx="50" cy="72" rx="19" ry="15" fill="#8f5728" />
      <path
        d="M36 58C42 62 58 62 64 58C66 72 63 85 50 85C37 85 34 72 36 58Z"
        fill="#0284c7"
      />

      {/* Glowing Star Energy Emblem */}
      <g className={isSelected ? "animate-spin" : ""}>
        <path
          d="M50 64L52 69L57 69.5L53.5 73L54.5 78L50 75.5L45.5 78L46.5 73L43 69.5L48 69L50 64Z"
          fill="#facc15"
        />
      </g>
    </svg>
  );
}

/**
 * Max Mascot: The Sultan / Juragan Besar Otter (Max Tier)
 * - idle: Royal crown, relaxed billionaire smile.
 * - selected: Sparkling golden crown, gold coin shower.
 * - launching: Sultan Hyperdrive flying on golden throne cloud with diamond flashes!
 */
export function MaxMascot({
  state = "idle",
  className = "size-12",
}: MascotProps) {
  const isSelected = state === "selected" || state === "launching";
  const isLaunching = state === "launching";

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} transition-all duration-300 ${
        isLaunching
          ? "scale-130 translate-y-[-4px] animate-pulse"
          : isSelected
            ? "scale-115 rotate-1"
            : "hover:scale-105"
      }`}
    >
      {/* Background Prestige Glow */}
      {isSelected && (
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="#eab308"
          fillOpacity={isLaunching ? "0.38" : "0.25"}
        />
      )}

      {/* Ears */}
      <circle cx="26" cy="30" r="9.5" fill="#693c18" />
      <circle cx="26" cy="30" r="5.5" fill="#d99f73" />
      <circle cx="74" cy="30" r="9.5" fill="#693c18" />
      <circle cx="74" cy="30" r="5.5" fill="#d99f73" />

      {/* Head */}
      <ellipse cx="50" cy="46" rx="27" ry="23" fill="#804a1f" />

      {/* Golden Crown of the Juragan */}
      <path
        d="M34 26L38 15L50 22L62 15L66 26C58 28 42 28 34 26Z"
        fill="#eab308"
        stroke="#ca8a04"
        strokeWidth="1.5"
      />
      <circle cx="38" cy="15" r="2" fill="#ef4444" />
      <circle cx="50" cy="22" r="2.5" fill="#3b82f6" />
      <circle cx="62" cy="15" r="2" fill="#ef4444" />
      <circle cx="50" cy="26" r="1.5" fill="#ffffff" />

      {/* Face Muzzle Patch */}
      <ellipse cx="50" cy="53" rx="17" ry="12" fill="#ecd0b2" />

      {/* Eyes with Cool Glasses or Confident Spark */}
      {isSelected ? (
        <>
          <rect x="31" y="38" width="16" height="10" rx="3" fill="#1e293b" />
          <rect x="53" y="38" width="16" height="10" rx="3" fill="#1e293b" />
          <path d="M47 42H53" stroke="#1e293b" strokeWidth="2.5" />
          <path
            d="M34 40L43 46"
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M56 40L65 46"
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M44 54C48 59 56 58 58 53"
            stroke="#1c1c1c"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="41" cy="42" r="3.5" fill="#1c1c1c" />
          <circle cx="42.5" cy="40.5" r="1.2" fill="#ffffff" />
          <circle cx="59" cy="42" r="3.5" fill="#1c1c1c" />
          <circle cx="60.5" cy="40.5" r="1.2" fill="#ffffff" />
          <path
            d="M46 54C48 56 52 56 54 54"
            stroke="#1c1c1c"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Nose */}
      <ellipse cx="50" cy="49" rx="3.8" ry="2.8" fill="#1c1c1c" />

      {/* Body / Luxury Robe with Golden Trims */}
      <ellipse cx="50" cy="74" rx="19" ry="15" fill="#804a1f" />
      <path
        d="M34 62C42 66 58 66 66 62C68 76 64 86 50 86C36 86 32 76 34 62Z"
        fill="#4338ca"
      />
      <path
        d="M42 62C46 72 54 72 58 62"
        stroke="#facc15"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle
        cx="50"
        cy="70"
        r="3.5"
        fill="#eab308"
        stroke="#ca8a04"
        strokeWidth="1"
      />

      {/* Gold Coin Showers */}
      {isSelected && (
        <g className="animate-bounce">
          <circle
            cx="80"
            cy="42"
            r="4.5"
            fill="#facc15"
            stroke="#ca8a04"
            strokeWidth="1"
          />
          <path
            d="M80 40V44M78.5 42H81.5"
            stroke="#92400e"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <circle
            cx="20"
            cy="46"
            r="3.5"
            fill="#facc15"
            stroke="#ca8a04"
            strokeWidth="1"
          />
          {isLaunching && (
            <circle
              cx="50"
              cy="94"
              r="5"
              fill="#facc15"
              stroke="#ca8a04"
              strokeWidth="1"
            />
          )}
        </g>
      )}
    </svg>
  );
}

/**
 * Waiting / Pending Mascot: The Polite Cashier Otter (Plea / Begging with Cute Invoice Card)
 * - Holds payment card, sparkles in eyes, politely nodding and waiting for user payment!
 */
export function WaitingPaymentMascot({
  className = "size-20",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} animate-pulse`}
    >
      {/* Background Soft Glow */}
      <circle cx="60" cy="60" r="56" fill="#f97316" fillOpacity="0.15" />

      {/* Ears */}
      <circle cx="34" cy="36" r="11" fill="#92623b" />
      <circle cx="34" cy="36" r="6.5" fill="#d99f73" />
      <circle cx="86" cy="36" r="11" fill="#92623b" />
      <circle cx="86" cy="36" r="6.5" fill="#d99f73" />

      {/* Head */}
      <ellipse cx="60" cy="52" rx="30" ry="25" fill="#a47148" />
      <ellipse cx="60" cy="60" rx="19" ry="14" fill="#ecd0b2" />

      {/* Big Cute Puppy / Begging Eyes with 3 Sparkles */}
      <circle cx="48" cy="48" r="6" fill="#1c1c1c" />
      <circle cx="50" cy="46" r="2.2" fill="#ffffff" />
      <circle cx="46" cy="51" r="1.2" fill="#ffffff" />

      <circle cx="72" cy="48" r="6" fill="#1c1c1c" />
      <circle cx="74" cy="46" r="2.2" fill="#ffffff" />
      <circle cx="70" cy="51" r="1.2" fill="#ffffff" />

      {/* Cute Blushing Cheeks */}
      <ellipse
        cx="38"
        cy="58"
        rx="6"
        ry="3.5"
        fill="#f43f5e"
        fillOpacity="0.5"
      />
      <ellipse
        cx="82"
        cy="58"
        rx="6"
        ry="3.5"
        fill="#f43f5e"
        fillOpacity="0.5"
      />

      {/* Nose & Cute Shy Smile */}
      <ellipse cx="60" cy="55" rx="4.5" ry="3.2" fill="#1c1c1c" />
      <path
        d="M54 60C57 64 63 64 66 60"
        stroke="#1c1c1c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Body */}
      <ellipse cx="60" cy="85" rx="22" ry="18" fill="#a47148" />
      <ellipse cx="60" cy="88" rx="14" ry="12" fill="#ecd0b2" />

      {/* Holding Payment Invoice / Card */}
      <g className="animate-bounce">
        <rect
          x="42"
          y="74"
          width="36"
          height="28"
          rx="4"
          fill="#ffffff"
          stroke="#f97316"
          strokeWidth="2"
        />
        {/* Payment Card Stripes / Details */}
        <rect x="46" y="80" width="28" height="4" rx="1" fill="#1c1c1c" />
        <rect x="46" y="88" width="12" height="3" rx="0.5" fill="#f97316" />
        <rect x="62" y="88" width="12" height="3" rx="0.5" fill="#e2e8f0" />
        <rect x="46" y="94" width="20" height="2" rx="0.5" fill="#cbd5e1" />

        {/* Both hands grasping the payment card */}
        <ellipse cx="38" cy="84" rx="5" ry="4" fill="#a47148" />
        <ellipse cx="82" cy="84" rx="5" ry="4" fill="#a47148" />
      </g>
    </svg>
  );
}

/**
 * Success Mascot: Party Champion Otter (Victory Celebration)
 * - Jumping joy, party hat, confetti & star sparks!
 */
export function SuccessMascot({
  className = "size-20",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} animate-bounce`}
    >
      {/* Background Radiance */}
      <circle cx="60" cy="60" r="56" fill="#10b981" fillOpacity="0.2" />

      {/* Confetti & Golden Stars */}
      <g fill="#facc15">
        <path d="M22 24L24 28L28 28.5L25 31L26 35L22 33L18 35L19 31L16 28.5L20 28L22 24Z" />
        <path d="M98 24L100 28L104 28.5L101 31L102 35L98 33L94 35L95 31L92 28.5L96 28L98 24Z" />
        <circle cx="30" cy="48" r="3" fill="#f43f5e" />
        <circle cx="90" cy="48" r="3" fill="#0284c7" />
        <circle cx="20" cy="68" r="2.5" fill="#10b981" />
        <circle cx="100" cy="68" r="2.5" fill="#f59e0b" />
      </g>

      {/* Party Hat */}
      <path d="M50 24L60 6L70 24Z" fill="#f43f5e" />
      <circle cx="60" cy="6" r="3.5" fill="#facc15" />
      <path d="M52 20L68 12M55 23L65 17" stroke="#ffffff" strokeWidth="1.5" />

      {/* Ears */}
      <circle cx="34" cy="36" r="11" fill="#92623b" />
      <circle cx="34" cy="36" r="6.5" fill="#d99f73" />
      <circle cx="86" cy="36" r="11" fill="#92623b" />
      <circle cx="86" cy="36" r="6.5" fill="#d99f73" />

      {/* Head */}
      <ellipse cx="60" cy="50" rx="30" ry="25" fill="#a47148" />
      <ellipse cx="60" cy="58" rx="19" ry="14" fill="#ecd0b2" />

      {/* Joy Curved Eyes "^ ^" */}
      <path
        d="M46 45C46 39 54 39 54 45"
        stroke="#1c1c1c"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M66 45C66 39 74 39 74 45"
        stroke="#1c1c1c"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Big Victory Open Smile */}
      <path
        d="M50 56C50 67 70 67 70 56Z"
        fill="#e11d48"
        stroke="#1c1c1c"
        strokeWidth="2.5"
      />
      <ellipse
        cx="36"
        cy="55"
        rx="6"
        ry="3.5"
        fill="#fb7185"
        fillOpacity="0.7"
      />
      <ellipse
        cx="84"
        cy="55"
        rx="6"
        ry="3.5"
        fill="#fb7185"
        fillOpacity="0.7"
      />

      {/* Nose */}
      <ellipse cx="60" cy="53" rx="4.5" ry="3.2" fill="#1c1c1c" />

      {/* Body & Victory Arms Raised */}
      <ellipse cx="60" cy="84" rx="22" ry="18" fill="#a47148" />
      <ellipse cx="60" cy="86" rx="14" ry="12" fill="#ecd0b2" />

      {/* Arms in "V" celebration */}
      <ellipse
        cx="30"
        cy="62"
        rx="6"
        ry="10"
        fill="#a47148"
        transform="rotate(-30 30 62)"
      />
      <ellipse
        cx="90"
        cy="62"
        rx="6"
        ry="10"
        fill="#a47148"
        transform="rotate(30 90 62)"
      />
    </svg>
  );
}

export function BoosterMascot({
  packId,
  state = "idle",
  className = "size-12",
}: {
  packId: string;
  state?: MascotState;
  className?: string;
}) {
  switch (packId) {
    case "pocket":
      return <PocketMascot state={state} className={className} />;
    case "starter":
      return <StarterMascot state={state} className={className} />;
    case "popular":
      return <PopularMascot state={state} className={className} />;
    case "max":
      return <MaxMascot state={state} className={className} />;
    default:
      return <StarterMascot state={state} className={className} />;
  }
}
