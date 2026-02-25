"use client";

import screenshotSimulate from "@/assets/screenshot-simulate.png";
import screenshotDeploy from "@/assets/screenshot-deploy.png";
import { useState } from "react";

const HeroSection = () => {
  const [activeShot, setActiveShot] = useState<"simulate" | "deploy">("simulate");

  return (
    <section className="pt-40 pb-20 px-6" style={{ background: "hsl(var(--hero-bg))" }}>
      <div className="container mx-auto max-w-4xl text-center">
        {/* Heading */}
        <h1
          className="text-4xl sm:text-5xl md:text-7xl font-display font-extrabold leading-[1.08] tracking-tight mb-6 animate-fade-up"
          style={{ color: "hsl(var(--hero-foreground))" }}
        >
          Find out what's possible
          <br />
          when Soroban connects
        </h1>

        {/* Subtitle */}
        <p
          className="text-lg md:text-xl font-body max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up opacity-80"
          style={{ color: "hsl(var(--hero-foreground))", animationDelay: "0.1s" }}
        >
          Whether you're building smart contracts or deploying to Stellar, Stellar Suite
          makes it easier to build, deploy, and simulate — all from VS Code.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <a
            href="https://marketplace.visualstudio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-base"
          >
            Install Extension
          </a>
          <a href="#features" className="btn-outline-light text-base">
            Explore Features
          </a>
        </div>
      </div>

      {/* Screenshot tabs */}
      <div className="container mx-auto max-w-5xl mt-16 animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <div className="flex justify-center gap-3 mb-6">
          <button
            onClick={() => setActiveShot("simulate")}
            className={`rounded-full px-5 py-2 text-sm font-semibold font-display transition-all duration-200 border ${
              activeShot === "simulate"
                ? "border-white/40 bg-white/10 text-white"
                : "border-transparent text-white/60 hover:text-white/90"
            }`}
          >
            Simulation
          </button>
          <button
            onClick={() => setActiveShot("deploy")}
            className={`rounded-full px-5 py-2 text-sm font-semibold font-display transition-all duration-200 border ${
              activeShot === "deploy"
                ? "border-white/40 bg-white/10 text-white"
                : "border-transparent text-white/60 hover:text-white/90"
            }`}
          >
            Deployment
          </button>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <img
            src={activeShot === "simulate" ? screenshotSimulate.src : screenshotDeploy.src}
            alt={`Stellar Suite VS Code extension — ${activeShot === "simulate" ? "transaction simulation" : "contract deployment"}`}
            className="w-full"
          />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
