export function Hero() {
  return (
    <section className="relative flex min-h-[90vh] flex-col items-center justify-center bg-cosmic-navy px-6 pt-14 text-center">
      {/* Subtle gradient orb */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2">
        <div className="h-[320px] w-[320px] rounded-full bg-electric-cyan/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-slate-gray/40 px-3 py-1 text-xs text-muted-silver">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          VS Code Extension — v0.1.0
        </div>

        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-stardust-white sm:text-4xl md:text-5xl">
          Smart Contract Development{" "}
          <span className="text-electric-cyan">Made Simple</span>
        </h1>

        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted-silver">
          Build, deploy, and simulate Soroban smart contracts on Stellar —
          entirely from VS Code. No context switching, no CLI flags to memorize.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="https://marketplace.visualstudio.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-[var(--radius)] bg-electric-cyan px-5 text-sm font-medium text-cosmic-navy transition-opacity hover:opacity-90"
          >
            Install Extension
          </a>
          <a
            href="#features"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius)] border border-border-subtle px-5 text-sm text-muted-silver transition-colors hover:border-electric-cyan/30 hover:text-stardust-white"
          >
            Explore Features
          </a>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-cosmic-navy to-transparent" />
    </section>
  );
}
