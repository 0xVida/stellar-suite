interface LogoProps {
  size?: number;
  className?: string;
}

const SorobanKitLogo = ({ size = 32, className = "" }: LogoProps) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Multicolor gradient: blue → purple → magenta */}
        <linearGradient
          id="stellar-logo-gradient"
          x1="0"
          y1="0"
          x2="40"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="hsl(228, 76%, 55%)" />
          <stop offset="50%" stopColor="hsl(262, 68%, 58%)" />
          <stop offset="100%" stopColor="hsl(330, 75%, 55%)" />
        </linearGradient>
        <linearGradient
          id="stellar-s-gradient"
          x1="8"
          y1="8"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="hsl(228, 76%, 62%)" />
          <stop offset="100%" stopColor="hsl(262, 70%, 60%)" />
        </linearGradient>
      </defs>

      {/* Outer circle — Stellar emblem ring */}
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        stroke="url(#stellar-logo-gradient)"
        strokeWidth="3"
      />

      {/* Stylized S — two curves (top loop + bottom loop) */}
      <path
        d="M 25 10.5
           C 14 10.5 11 16 15 19
           C 19 21.5 24 20.5 26 19.5
           M 26 20.5
           C 24 22 18 24 14 22.5
           C 10 21 11 26 16 28
           C 22 30 27 28 27 28"
        fill="none"
        stroke="url(#stellar-s-gradient)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Two horizontal bars through the S */}
      <rect
        x="9"
        y="16.8"
        width="22"
        height="2"
        rx="1"
        transform="rotate(-3 20 17.8)"
        fill="url(#stellar-logo-gradient)"
      />
      <rect
        x="9"
        y="21.2"
        width="22"
        height="2"
        rx="1"
        transform="rotate(-3 20 22.2)"
        fill="url(#stellar-logo-gradient)"
      />
    </svg>
  );
};

export default SorobanKitLogo;
