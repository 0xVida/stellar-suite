// src/components/ContactDialog.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Wraps the existing <ContactForm> in a Radix Dialog (shadcn/ui).
// Usage:
//   <ContactDialog />                     ← renders its own "Contact us" trigger button
//   <ContactDialog trigger={<button>} />  ← use a custom trigger element
//
// To wire up a real backend later, update the handleSubmit mock in ContactForm.tsx
// (look for "Mock API delay") and replace with your fetch/API call.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import {
  MessageSquare,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ─── Inline form (self-contained so the modal owns its own state) ─────────────

type FormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
};
type Status = "idle" | "loading" | "success" | "error";

function ContactModalForm({ onSuccess }: { onSuccess?: () => void }) {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [feedback, setFeedback] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const validate = (): boolean => {
    const e: Partial<FormData> = {};
    if (!formData.name.trim()) e.name = "Name is required.";
    if (!formData.email.trim()) {
      e.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      e.email = "Enter a valid email address.";
    }
    if (!formData.message.trim()) e.message = "Message is required.";
    if (formData.message.length > 500)
      e.message = "Message cannot exceed 500 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) {
      setStatus("success");
      setFeedback("Message sent!");
      return;
    }
    if (!validate()) return;

    setStatus("loading");
    setFeedback("");

    try {
      // ── TODO: replace with real API call ──────────────────────────────────
      // await fetch("/api/contact", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(formData),
      // });
      await new Promise((res) => setTimeout(res, 1500));
      // ─────────────────────────────────────────────────────────────────────

      setStatus("success");
      setFeedback("Thank you! We'll get back to you soon.");
      setFormData({ name: "", email: "", subject: "", message: "" });
      onSuccess?.();
    } catch {
      setStatus("error");
      setFeedback("Something went wrong. Please try again later.");
    }
  };

  const field =
    "w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background disabled:opacity-50";
  const fieldError = "border-destructive focus:ring-destructive";
  const fieldNormal = "border-border";

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <div>
          <p className="font-display font-bold text-foreground text-lg">
            Message sent!
          </p>
          <p className="mt-1 text-sm text-muted-foreground font-body">
            {feedback}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Honeypot */}
      <div className="hidden" aria-hidden="true">
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {/* Name + Email */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="modal-name"
            className="text-xs font-semibold text-foreground font-display"
          >
            Name <span className="text-destructive">*</span>
          </label>
          <input
            id="modal-name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            placeholder="Your name"
            disabled={status === "loading"}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "modal-name-err" : undefined}
            className={`${field} ${errors.name ? fieldError : fieldNormal}`}
          />
          {errors.name && (
            <p
              id="modal-name-err"
              className="text-xs text-destructive flex items-center gap-1"
            >
              <AlertCircle className="h-3 w-3 flex-shrink-0" /> {errors.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="modal-email"
            className="text-xs font-semibold text-foreground font-display"
          >
            Email <span className="text-destructive">*</span>
          </label>
          <input
            id="modal-email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@example.com"
            disabled={status === "loading"}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "modal-email-err" : undefined}
            className={`${field} ${errors.email ? fieldError : fieldNormal}`}
          />
          {errors.email && (
            <p
              id="modal-email-err"
              className="text-xs text-destructive flex items-center gap-1"
            >
              <AlertCircle className="h-3 w-3 flex-shrink-0" /> {errors.email}
            </p>
          )}
        </div>
      </div>

      {/* Subject (optional) */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="modal-subject"
          className="text-xs font-semibold text-foreground font-display"
        >
          Subject{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          id="modal-subject"
          name="subject"
          type="text"
          value={formData.subject}
          onChange={handleChange}
          placeholder="How can we help?"
          disabled={status === "loading"}
          className={`${field} ${fieldNormal}`}
        />
      </div>

      {/* Message */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="modal-message"
          className="text-xs font-semibold text-foreground font-display"
        >
          Message <span className="text-destructive">*</span>
        </label>
        <textarea
          id="modal-message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          rows={4}
          placeholder="Tell us more..."
          disabled={status === "loading"}
          maxLength={500}
          aria-invalid={!!errors.message}
          aria-describedby={
            errors.message ? "modal-message-err" : "modal-message-count"
          }
          className={`${field} resize-none ${errors.message ? fieldError : fieldNormal}`}
        />
        <div className="flex items-center justify-between">
          {errors.message ? (
            <p
              id="modal-message-err"
              className="text-xs text-destructive flex items-center gap-1"
            >
              <AlertCircle className="h-3 w-3 flex-shrink-0" /> {errors.message}
            </p>
          ) : (
            <span />
          )}
          <p
            id="modal-message-count"
            className={`text-xs ml-auto ${formData.message.length >= 480 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {formData.message.length}/500
          </p>
        </div>
      </div>

      {/* Global error */}
      {status === "error" && feedback && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {feedback}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "loading"}
        className="btn-primary w-full mt-1"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          "Send Message"
        )}
      </button>
    </form>
  );
}

// ─── Dialog wrapper ───────────────────────────────────────────────────────────

type Props = {
  /** Optional custom trigger. Defaults to a "Contact us" button. */
  trigger?: React.ReactNode;
  /** Extra classes on the default trigger button */
  triggerClassName?: string;
};

export function ContactDialog({ trigger, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);

  const defaultTrigger = (
    <button
      onClick={() => setOpen(true)}
      className={`text-sm text-muted-foreground transition-colors hover:text-foreground font-body ${triggerClassName ?? ""}`}
    >
      Contact us
    </button>
  );

  return (
    <>
      {/* Trigger */}
      <span onClick={() => setOpen(true)} style={{ cursor: "pointer" }}>
        {trigger ?? defaultTrigger}
      </span>

      {/* Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border-border bg-background p-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogHeader>
                  <DialogTitle className="text-base font-display font-bold text-foreground leading-none">
                    Contact us
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground font-body mt-0.5">
                    We typically reply within 1–2 business days.
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>
          </div>

          {/* Form body */}
          <div className="px-6 py-6">
            <ContactModalForm
              onSuccess={() => {
                // Auto-close after 2.5 s on success
                setTimeout(() => setOpen(false), 2500);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
