"use client";

import { Section, SectionHeader } from "@/components/ui/Section";
import { Users, Github, MessageCircle } from "lucide-react";

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-cosmic-navy pt-20">
      <Section>
        <SectionHeader
          title="Join the Community"
          subtitle="Connect with other developers, share your projects, and help shape the future of Stellar Suite."
        />

        <div className="grid gap-8 md:grid-cols-3">
          {/* Discord Card */}
          <div className="flex flex-col items-center rounded-xl border border-border-subtle bg-slate-gray p-8 text-center shadow-lg transition-transform hover:scale-105">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#5865F2] text-white">
              <MessageCircle className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-stardust-white">Discord</h3>
            <p className="mb-6 text-muted-silver">
              Chat with the team and community in real-time. Get help and share your work.
            </p>
            <a
              href="https://discord.gg/stellar"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto rounded-full bg-[#5865F2] px-6 py-2 font-medium text-white transition-colors hover:bg-[#4752C4]"
            >
              Join Server
            </a>
          </div>

          {/* GitHub Discussions Card */}
          <div className="flex flex-col items-center rounded-xl border border-border-subtle bg-slate-gray p-8 text-center shadow-lg transition-transform hover:scale-105">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#333] text-white">
              <Github className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-stardust-white">
              GitHub Discussions
            </h3>
            <p className="mb-6 text-muted-silver">
              Ask questions, propose features, and discuss the roadmap on our repository.
            </p>
            <a
              href="https://github.com/stellar/stellar-suite/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto rounded-full bg-[#333] px-6 py-2 font-medium text-white transition-colors hover:bg-[#24292e]"
            >
              Join Discussion
            </a>
          </div>

          {/* Forum Card */}
          <div className="flex flex-col items-center rounded-xl border border-border-subtle bg-slate-gray p-8 text-center shadow-lg transition-transform hover:scale-105">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white">
              <Users className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-stardust-white">
              Community Forum
            </h3>
            <p className="mb-6 text-muted-silver">
              Deep dive into technical topics, tutorials, and long-form discussions.
            </p>
            <a
              href="#"
              className="mt-auto rounded-full bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Visit Forum
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}
