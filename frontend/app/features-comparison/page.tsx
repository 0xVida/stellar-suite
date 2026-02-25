import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FeaturesComparison } from "@/components/features/FeaturesComparison";

export const metadata: Metadata = {
  title: "Features Comparison - Stellar Suite vs CLI",
  description: "See how Stellar Suite VS Code Extension improves your Soroban smart contract development workflow compared to standard CLI tools.",
};

export default function FeaturesComparisonPage() {
  return (
    <>
      <Navbar />
      <main className="bg-cosmic-navy min-h-screen">
        <FeaturesComparison />
      </main>
      <Footer />
    </>
  );
}
