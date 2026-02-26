"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export interface TicketData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export function SupportForm() {
  const [form, setForm] = useState<TicketData>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    // simple validation
    if (!form.name || !form.email || !form.subject || !form.message) {
      setStatus("error");
      setErrorMessage("All fields are required.");
      return;
    }

    try {
      const res = await fetch("/api/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        throw new Error("Network response was not ok");
      }

      setStatus("success");
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMessage("Failed to submit ticket. Please try again later.");
    }
  };

  return (
    <div className="w-full max-w-md rounded-lg border border-border-subtle bg-slate-gray p-4 shadow-sm sm:p-6">
      <h3 className="text-base font-semibold text-stardust-white sm:text-lg">Submit a Support Ticket</h3>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3 sm:space-y-4">
        <div>
          <label htmlFor="name" className="sr-only">
            Name
          </label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Your name"
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-3 py-2 text-sm text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:px-4 sm:text-base"
            required
          />
        </div>
        <div>
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@example.com"
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-3 py-2 text-sm text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:px-4 sm:text-base"
            required
          />
        </div>
        <div>
          <label htmlFor="subject" className="sr-only">
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            value={form.subject}
            onChange={handleChange}
            placeholder="Subject"
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-3 py-2 text-sm text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:px-4 sm:text-base"
            required
          />
        </div>
        <div>
          <label htmlFor="message" className="sr-only">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            value={form.message}
            onChange={handleChange}
            placeholder="Describe your issue or question..."
            className="w-full rounded-md border border-border-subtle bg-cosmic-navy px-3 py-2 text-sm text-stardust-white placeholder:text-muted-silver focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:px-4 sm:text-base"
            required
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          className="flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:text-base"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : status === "success" ? (
            "Sent!"
          ) : (
            "Submit Ticket"
          )}
        </button>
        {status === "error" && errorMessage && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {errorMessage}
          </p>
        )}
        {status === "success" && (
          <p className="mt-2 text-sm text-green-400">
            Your ticket has been received. We'll get back to you shortly.
          </p>
        )}
      </form>
    </div>
  );
}
