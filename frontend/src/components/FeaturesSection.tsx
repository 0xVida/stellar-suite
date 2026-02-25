import { Rocket, Play, FileCode, Terminal, Shield, Zap } from "lucide-react";

const features = [
  { icon: Rocket, title: "One-Click Deploy", description: "Deploy smart contracts to testnet or mainnet directly from VS Code." },
  { icon: Play, title: "Transaction Simulation", description: "Test and simulate Soroban transactions before deploying to the blockchain." },
  { icon: FileCode, title: "Contract Scaffolding", description: "Create and manage Soroban projects with built-in templates and tooling." },
  { icon: Terminal, title: "No CLI Needed", description: "Every Stellar command runs inside VS Code — no terminal switching required." },
  { icon: Shield, title: "Integrated Testing", description: "Run contract tests with real-time feedback and inline error reporting." },
  { icon: Zap, title: "Lightning Fast", description: "Optimized builds, deploys, and simulations that happen in seconds." },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="section-padding bg-muted/50">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-display font-extrabold tracking-tight text-foreground">
            Everything you need to build on Soroban
          </h2>
          <p className="mt-4 text-lg font-body text-muted-foreground max-w-2xl mx-auto">
            A complete toolkit that replaces the Stellar CLI with a visual, intuitive experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-background p-8 hover:shadow-lg transition-shadow duration-300"
            >
              <div className="mb-5 icon-box-md rounded-xl">
                <f.icon className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <h3 className="text-lg font-display font-bold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm font-body text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
