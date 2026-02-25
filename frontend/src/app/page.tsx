import Navbar from "@/components/Navbar";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import UseCasesSection from "@/components/UseCasesSection";
import NewsSection from "@/components/NewsSection";
import TrustSection from "@/components/TrustSection";
import CtaSection from "@/components/CtaSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AnnouncementBanner />
      <HeroSection />
      <FeaturesSection />
      <UseCasesSection />
      <NewsSection />
      <TrustSection />
      <CtaSection />
      <Footer />
    </div>
  );
}
