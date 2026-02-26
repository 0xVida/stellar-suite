import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ContributorRecognition } from "../../../../components/ContributorRecognition";

export default function ContributorsPage() {
  return (
    <main id="community-contributors" className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16 md:px-12 md:py-24">
        <h1 className="mb-4 text-2xl font-bold text-stardust-white sm:text-3xl md:mb-8">
          Contributors
        </h1>
        <p className="text-sm text-muted-silver sm:text-base">
          Individuals who have contributed code, documentation, or support to
          Stellar Suite. Thank you for making this project better!
        </p>
        <div className="mt-4 sm:mt-5 md:mt-6">
          <ContributorRecognition />
        </div>
      </div>
      <Footer />
    </main>
  );
}
