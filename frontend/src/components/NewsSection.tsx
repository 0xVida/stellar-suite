import { ArrowUpRight } from "lucide-react";

const news = [
  {
    title: "Stellar Kit 1.0: Build, deploy & simulate in VS Code",
    description: "The first stable release brings one-click deployment, transaction simulation, and full contract management to your editor.",
    span: "col-span-1 row-span-2",
  },
  {
    title: "Why developers are switching to Stellar Kit",
    description: "From memorizing terminal commands to clicking a button — see how Stellar Kit transforms the Soroban workflow.",
    span: "col-span-1 row-span-1",
  },
  {
    title: "Deploy NFTs on Soroban in under 60 seconds",
    description: "A step-by-step guide using Stellar Kit to scaffold, build, and deploy an NFT contract to testnet.",
    span: "col-span-1 row-span-1",
  },
  {
    title: "Simulate easily with Stellar Kit",
    description: "Simulate transactions easily with Stellar Kit's intuitive interface.",
    span: "col-span-1 row-span-1",
  },
];

const NewsSection = () => {
  return (
    <section className="section-padding">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold font-display text-primary mb-2">● What&apos;s new</p>
          <h2 className="text-3xl md:text-5xl font-display font-extrabold tracking-tight text-foreground">
            Making news, making impact
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
          {/* Large card */}
          <div className="md:row-span-2 rounded-2xl p-8 flex flex-col justify-between min-h-[320px]" style={{ background: "hsl(var(--news-card))", color: "hsl(var(--news-card-foreground))" }}>
            <div>
              <h3 className="text-xl font-display font-bold mb-3 leading-snug">{news[0].title}</h3>
              <p className="text-sm opacity-80 leading-relaxed">{news[0].description}</p>
            </div>
            <div className="flex justify-end mt-6">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </div>
          </div>

          {/* Medium card */}
          <div className="rounded-2xl p-8 flex flex-col justify-between" style={{ background: "hsl(var(--news-card))", color: "hsl(var(--news-card-foreground))" }}>
            <div>
              <h3 className="text-lg font-display font-bold mb-2 leading-snug">{news[1].title}</h3>
              <p className="text-sm opacity-80 leading-relaxed">{news[1].description}</p>
            </div>
            <div className="flex justify-end mt-4">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </div>
          </div>

          {/* Two stacked on right */}
          <div className="md:row-span-2 flex flex-col gap-4">
            <div className="rounded-2xl p-8 flex flex-col justify-between flex-1" style={{ background: "hsl(var(--news-card))", color: "hsl(var(--news-card-foreground))" }}>
              <div>
                <h3 className="text-lg font-display font-bold mb-2 leading-snug">{news[2].title}</h3>
                <p className="text-sm opacity-80 leading-relaxed">{news[2].description}</p>
              </div>
              <div className="flex justify-end mt-4">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
              </div>
            </div>
            <div className="rounded-2xl p-8 flex flex-col justify-between flex-1" style={{ background: "hsl(var(--news-card))", color: "hsl(var(--news-card-foreground))" }}>
              <div>
                <h3 className="text-lg font-display font-bold mb-2 leading-snug">{news[3].title}</h3>
                <p className="text-sm opacity-80 leading-relaxed">{news[3].description}</p>
              </div>
              <div className="flex justify-end mt-4">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
              </div>
            </div>
          </div>

          {/* Bottom card under medium */}
        </div>
      </div>
    </section>
  );
};

export default NewsSection;
