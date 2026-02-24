"use client";

import { SearchProvider } from "@/lib/context/search-context";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/landing/Hero";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { DemoSection } from "@/components/landing/DemoSection";
import { TemplateGallery } from "@/components/landing/TemplateGallery";
import { CodeExamples } from "@/components/landing/CodeExamples";
import { ComparisonTool } from "@/components/landing/ComparisonTool";
import { CapabilityCalculator } from "@/components/landing/CapabilityCalculator";
import { ScreenshotGallery } from "@/components/landing/ScreenshotGallery";
import { AnimationShowcase } from "@/components/landing/AnimationShowcase";
import { SearchOverlay } from "@/components/landing/SearchOverlay";

export default function Home() {
  return (
    <SearchProvider>
      <Navbar />
      <main>
        <Hero />
        <FeatureGrid />
        <DemoSection />
        <TemplateGallery />
        <CodeExamples />
        <ComparisonTool />
        <AnimationShowcase />
        <CapabilityCalculator />
        <ScreenshotGallery />
      </main>
      <Footer />
      <SearchOverlay />
    </SearchProvider>
  );
}
