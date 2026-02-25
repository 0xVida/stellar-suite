"use client";

import { Section, SectionHeader } from "@/components/ui/Section";
import { NewsletterForm } from "@/components/NewsletterForm";
import { ContactForm } from "@/components/ContactForm";
import { SocialShareButtons } from "@/components/SocialShareButtons";
import { CommentSection } from "@/components/CommentSection";

export default function FeaturesDemoPage() {
  return (
    <div className="min-h-screen bg-cosmic-navy pt-20">
      <Section>
        <SectionHeader
          title="Engagement Features Demo"
          subtitle="A showcase of all user engagement components."
        />

        <div className="grid gap-12">
          {/* Newsletter Section */}
          <div className="rounded-xl border border-border-subtle bg-slate-gray p-8">
            <h2 className="mb-4 text-2xl font-bold text-stardust-white">
              1. Newsletter Signup
            </h2>
            <div className="flex justify-center">
              <NewsletterForm />
            </div>
          </div>

          {/* Contact Form Section */}
          <div className="rounded-xl border border-border-subtle bg-slate-gray p-8">
            <h2 className="mb-4 text-2xl font-bold text-stardust-white">
              2. Contact Form
            </h2>
            <div className="flex justify-center">
              <ContactForm />
            </div>
          </div>

          {/* Social Share Section */}
          <div className="rounded-xl border border-border-subtle bg-slate-gray p-8">
            <h2 className="mb-4 text-2xl font-bold text-stardust-white">
              3. Social Sharing Buttons
            </h2>
            <SocialShareButtons
              title="Check out Stellar Suite features!"
              url="https://stellar-suite.com/features"
            />
          </div>

          {/* Comments Section */}
          <div className="rounded-xl border border-border-subtle bg-slate-gray p-8">
            <h2 className="mb-4 text-2xl font-bold text-stardust-white">
              4. Blog Comments
            </h2>
            <CommentSection />
          </div>
        </div>
      </Section>
    </div>
  );
}
