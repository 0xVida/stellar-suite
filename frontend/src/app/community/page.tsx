import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { CommentSection } from "../../../components/CommentSection";
import { SupportForm } from "../../../components/SupportForm";
import { ContributorRecognition } from "../../../components/ContributorRecognition";

export default function CommunityPage() {
  return (
    <main id="community-page" className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16 md:px-12 md:py-24">
        <h1 className="mb-6 text-2xl font-bold text-stardust-white sm:text-3xl md:mb-8">
          Join the Stellar Suite Community
        </h1>

        <section id="forum" className="mb-12 sm:mb-14 md:mb-16">
          <h2 className="mb-3 text-lg font-semibold text-stardust-white sm:text-xl md:mb-4 md:text-2xl">
            Discussion Forum
          </h2>
          <p className="text-sm text-muted-silver sm:text-base">
            Our GitHub Discussions board is the best place to ask questions,
            share ideas, and get help from other users. You can participate
            directly on GitHub or use the embedded view below.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-border-subtle sm:mt-4">
            <iframe
              src="https://github.com/0xVida/stellar-suite/discussions"
              className="h-64 w-full sm:h-80 md:h-[400px]"
              title="GitHub Discussions"
            />
          </div>
        </section>

        <section id="support" className="mb-12 sm:mb-14 md:mb-16">
          <h2 className="mb-3 text-lg font-semibold text-stardust-white sm:text-xl md:mb-4 md:text-2xl">
            Support Tickets
          </h2>
          <p className="text-sm text-muted-silver sm:text-base">
            If you need one-on-one help, submit a ticket and we'll get back to
            you as soon as possible.
          </p>
          <div className="mt-4 sm:mt-5 md:mt-6">
            <SupportForm />
          </div>
        </section>

        <section id="guidelines" className="mb-12 sm:mb-14 md:mb-16">
          <h2 className="mb-3 text-lg font-semibold text-stardust-white sm:text-xl md:mb-4 md:text-2xl">
            Community Guidelines
          </h2>
          <p className="text-sm text-muted-silver sm:text-base">
            We strive for a friendly, inclusive environment. Please read our{' '}
            <Link
              href="/community/guidelines"
              className="text-blue-400 hover:underline"
            >
              full guidelines
            </Link>{' '}
            before posting.
          </p>
        </section>

        <section id="contributors" className="mb-12 sm:mb-14 md:mb-16">
          <h2 className="mb-3 text-lg font-semibold text-stardust-white sm:text-xl md:mb-4 md:text-2xl">
            Recognizing Contributors
          </h2>
          <p className="text-sm text-muted-silver sm:text-base">
            We appreciate everyone who helps improve Stellar Suite. Here are our
            top contributors (pulled from GitHub):
          </p>
          <div className="mt-4 sm:mt-5 md:mt-6">
            <ContributorRecognition />
          </div>
        </section>

        <section id="discussion" className="mb-16 sm:mb-20 md:mb-24">
          <h2 className="mb-3 text-lg font-semibold text-stardust-white sm:text-xl md:mb-4 md:text-2xl">
            Community Discussions
          </h2>
          <p className="text-sm text-muted-silver sm:text-base">
            Leave a quick comment below or browse what others are saying.
          </p>
          <div className="mt-4 sm:mt-5 md:mt-6">
            <CommentSection />
          </div>
        </section>
      </div>
      <Footer />
    </main>
  );
}
