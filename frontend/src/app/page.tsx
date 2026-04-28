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

export default function Home() {
  return (
    <main id="main-content" className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <div className="animate-in fade-in slide-in-from-top-4 duration-700 ease-out">
        <Navbar />
      </div>
      <div className="animate-in fade-in zoom-in-95 duration-1000 delay-150 fill-mode-both ease-out">
        <AnnouncementBanner />
        <HeroSection />
      </div>
      <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300 fill-mode-both ease-out">
        <FeaturesSection />
      </div>
      <div className="animate-in fade-in duration-1000 delay-500 fill-mode-both ease-out">
        <ProductsSection />
        <NewsSection />
        <TrustSection />
        <TemplateGallery />
        <PricingTable />
        <CtaSection />
      </div>
      <div className="animate-in fade-in duration-1000 delay-700 fill-mode-both ease-out">
        <Footer />
      </div>
      <ScrollToTopButton />
    </main>
  );
}
