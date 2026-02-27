import { EXTENSION_ITEM_URL, EXTENSION_INSTALL_ID } from "@/lib/constants";

const CtaSection = () => {
  return (
    <section id="get-started" className="section-padding">
      <div className="container mx-auto max-w-3xl text-center">
        <h2 className="text-3xl md:text-5xl font-display font-black tracking-tight text-foreground mb-4">
          Start building in seconds
        </h2>
        <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
          Install the extension, open a Soroban project, and you&apos;re ready to deploy. No configuration required.
        </p>

        <div className="rounded-xl bg-muted border border-border px-6 py-4 font-mono text-sm text-foreground inline-block mb-10">
          <span className="text-muted-foreground select-none">$ </span>
          <span>ext install {EXTENSION_INSTALL_ID}</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={EXTENSION_ITEM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Install Free Extension
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
};

export default CtaSection;
