"use client";

import { useState } from "react";
import { Section, SectionHeader } from "@/components/ui/Section";
import { Loader2, Check, AlertCircle } from "lucide-react";

export default function ManageSubscriptionPage() {
  const [email, setEmail] = useState("user@example.com");
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    setStatus("success");
    setMessage("Preferences updated successfully.");
    setTimeout(() => setStatus("idle"), 3000);
  };

  const handleToggle = () => {
    setIsSubscribed(!isSubscribed);
  };

  return (
    <div className="min-h-screen bg-cosmic-navy pt-20">
      <Section className="flex justify-center">
        <div className="w-full max-w-lg rounded-xl border border-border-subtle bg-slate-gray p-8 shadow-lg">
          <SectionHeader
            title="Manage Subscription"
            subtitle="Update your email preferences and subscription status."
          />

          <form onSubmit={handleUpdate} className="space-y-6">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-stardust-white">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-4 py-2 text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-cosmic-navy/50 p-4">
              <div>
                <h4 className="font-medium text-stardust-white">Newsletter Subscription</h4>
                <p className="text-sm text-muted-silver">
                  Receive updates about new features and releases.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  isSubscribed ? "bg-blue-600" : "bg-gray-600"
                }`}
                role="switch"
                aria-checked={isSubscribed}
              >
                <span className="sr-only">Enable notifications</span>
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isSubscribed ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between pt-4">
              {status === "success" && (
                <div className="flex items-center text-green-400">
                  <Check className="mr-2 h-5 w-5" />
                  <span className="text-sm">{message}</span>
                </div>
              )}
              {status === "error" && (
                <div className="flex items-center text-red-400">
                  <AlertCircle className="mr-2 h-5 w-5" />
                  <span className="text-sm">Something went wrong.</span>
                </div>
              )}
              
              <button
                type="submit"
                disabled={status === "loading"}
                className="ml-auto flex items-center rounded-md bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </div>
      </Section>
    </div>
  );
}
