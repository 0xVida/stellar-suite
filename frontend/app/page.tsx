import dynamic from 'next/dynamic';
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/landing/Hero";
import { FeatureGrid } from "@/components/landing/FeatureGrid";

// Lazy load heavy components below the fold
const DemoSection = dynamic(() => import("@/components/landing/DemoSection").then(mod => mod.DemoSection));
const TemplateGallery = dynamic(() => import("@/components/landing/TemplateGallery").then(mod => mod.TemplateGallery));
const CodeExamples = dynamic(() => import("@/components/landing/CodeExamples").then(mod => mod.CodeExamples));
const ComparisonTool = dynamic(() => import("@/components/landing/ComparisonTool").then(mod => mod.ComparisonTool));
const CapabilityCalculator = dynamic(() => import("@/components/landing/CapabilityCalculator").then(mod => mod.CapabilityCalculator));
const ScreenshotGallery = dynamic(() => import("@/components/landing/ScreenshotGallery").then(mod => mod.ScreenshotGallery));
const AnimationShowcase = dynamic(() => import("@/components/landing/AnimationShowcase").then(mod => mod.AnimationShowcase));

export default function Home() {
  return (
    <>
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
    </>
  );
}
