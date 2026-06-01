import Navbar from "@/components/Navbar";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import ProductsSection from "@/components/ProductsSection";
import NewsSection from "@/components/NewsSection";
import TrustSection from "@/components/TrustSection";
import CtaSection from "@/components/CtaSection";
import Footer from "@/components/Footer";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import { TemplateGallery } from "@/components/templates/TemplateGallery";
import { PricingTable } from "@/components/pricing/PricingTable";
import { Reveal } from "@/components/Reveal";
import { ScrollProgress } from "@/components/ScrollProgress";

/**
 * Marketing landing page for the Stellar developer community.
 *
 * Above the fold (Navbar, Announcement, Hero) animates in on load for an
 * immediate, polished first impression. Everything below the fold is wrapped in
 * <Reveal> so each section fades and rises into view as the visitor scrolls —
 * a sleek, performant micro-animation built on a single IntersectionObserver
 * per section (no animation library), honouring prefers-reduced-motion.
 */
export default function Home() {
  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-hidden bg-background text-foreground"
    >
      <ScrollProgress />

      <div className="animate-in fade-in slide-in-from-top-4 duration-700 ease-out">
        <Navbar />
      </div>

      <div className="animate-in fade-in zoom-in-95 fill-mode-both delay-150 duration-1000 ease-out">
        <AnnouncementBanner />
        <HeroSection />
      </div>

      <Reveal>
        <FeaturesSection />
      </Reveal>
      <Reveal>
        <ProductsSection />
      </Reveal>
      <Reveal>
        <NewsSection />
      </Reveal>
      <Reveal>
        <TrustSection />
      </Reveal>
      <Reveal>
        <TemplateGallery />
      </Reveal>
      <Reveal>
        <PricingTable />
      </Reveal>
      <Reveal>
        <CtaSection />
      </Reveal>

      <div className="animate-in fade-in fill-mode-both delay-300 duration-1000 ease-out">
        <Footer />
      </div>

      <ScrollToTopButton />
    </main>
  );
}
