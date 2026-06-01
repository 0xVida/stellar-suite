import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { PricingTable } from "@/components/pricing/PricingTable";

export const metadata: Metadata = {
  title: "Pricing — Stellar Suite",
  description:
    "Simple, transparent pricing for Stellar developers. Start free, scale as you grow.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main id="main-content" className="pt-20 pb-20 px-4 sm:pt-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 mb-10 text-xs sm:text-sm font-body text-muted-foreground">
            <Link
              href="/"
              className="hover:text-foreground transition-colors"
            >
              Home
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-foreground">Pricing</span>
          </nav>

          {/* Hero */}
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-5">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-extrabold tracking-tight text-foreground leading-tight mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-base sm:text-lg font-body text-muted-foreground max-w-xl mx-auto">
              Start for free. Scale as you grow. No hidden fees, no surprises.
            </p>
          </div>

          <PricingTable />

          {/* Footer note */}
          <p className="text-center text-sm font-body text-muted-foreground mt-14">
            Have questions about plans?{" "}
            <Link
              href="/faq"
              className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
            >
              Browse the FAQ
            </Link>{" "}
            or reach out to our team.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
