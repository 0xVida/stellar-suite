import { ArrowRight, Sparkles, TerminalSquare } from "lucide-react";

export function Hero() {
    return (
        <section className="relative overflow-hidden bg-[#0A0A0A] px-6 py-24 sm:py-32 lg:px-8 min-h-[90vh] flex flex-col justify-center">
            {/* Rich Background Gradients & Glow Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-x-0 -top-40 transform-gpu overflow-hidden blur-[120px] sm:-top-80 pointer-events-none">
                    <div
                        className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] via-[#9089fc] to-[#4ade80] opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
                        style={{
                            clipPath:
                                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
                        }}
                    />
                </div>
            </div>

            <div className="relative z-10 mx-auto max-w-5xl text-center">
                {/* Premium Glassmorphic Badge */}
                <div
                    className="mb-8 flex justify-center opacity-0 animate-fade-in-up"
                    style={{ animationDelay: "0ms" }}
                >
                    <div className="relative rounded-full px-5 py-2 text-sm font-medium leading-6 text-zinc-300 glass-panel hover:bg-white/10 transition-colors duration-300 flex items-center gap-2 group cursor-default">
                        <Sparkles size={16} className="text-indigo-400 group-hover:text-pink-400 transition-colors" />
                        <span>The ultimate developer toolkit for Stellar.</span>
                    </div>
                </div>

                {/* Hero Headline */}
                <h1
                    className="text-5xl font-extrabold tracking-tight text-white sm:text-7xl lg:text-[5rem] leading-[1.1] opacity-0 animate-fade-in-up"
                    style={{ animationDelay: "150ms" }}
                >
                    Build, deploy, and manage<br className="hidden sm:block" />
                    {" "}
                    <span className="text-gradient">
                        Smart Contracts
                    </span>
                    {" "}
                    <br className="hidden sm:block" />
                    from your editor.
                </h1>

                {/* Refined Value Proposition */}
                <p
                    className="mt-8 text-lg md:text-xl leading-relaxed text-zinc-400 max-w-3xl mx-auto opacity-0 animate-fade-in-up"
                    style={{ animationDelay: "300ms" }}
                >
                    Stop context switching between your IDE and the terminal. Stellar Suite brings the power of the Stellar CLI directly into a highly interactive VS Code experience. Focus on what truly matters: writing flawless code.
                </p>

                {/* High-Impact Calls To Action */}
                <div
                    className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 opacity-0 animate-fade-in-up"
                    style={{ animationDelay: "450ms" }}
                >
                    <a
                        href="https://marketplace.visualstudio.com/items?itemName=stellar-suite.stellar-suite"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto rounded-xl bg-white px-8 py-4 text-base font-semibold text-zinc-950 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center gap-2"
                    >
                        <TerminalSquare size={20} className="text-indigo-600" />
                        Install Extension
                        <ArrowRight size={18} className="text-zinc-500 ml-1 group-hover:translate-x-1 transition-transform" />
                    </a>

                    <a
                        href="https://github.com/0xVida/stellar-suite"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto rounded-xl px-8 py-4 text-base font-semibold text-white glass-panel hover:bg-white/10 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center gap-2"
                    >
                        View Documentation
                    </a>
                </div>
            </div>

            {/* Bottom Glow */}
            <div className="absolute inset-x-0 bottom-0 -z-10 transform-gpu overflow-hidden blur-[120px] pointer-events-none">
                <div className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] via-[#9089fc] to-[#4ade80] opacity-20 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]" />
            </div>
        </section>
    );
}
