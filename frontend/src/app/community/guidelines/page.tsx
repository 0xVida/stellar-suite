import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function GuidelinesPage() {
  return (
    <main id="community-guidelines" className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16 md:px-12 md:py-24">
        <h1 className="mb-6 text-2xl font-bold text-stardust-white sm:text-3xl md:mb-8">
          Community Guidelines
        </h1>

        <article className="prose prose-invert space-y-6">
          <p>To keep our community welcoming and constructive, please follow
          these guidelines:</p>

          <ul>
            <li>Be respectful and courteous to others.</li>
            <li>Keep questions and discussions on-topic (Stellar Suite &amp;
            Soroban).</li>
            <li>No harassment, hate speech, or abusive language.</li>
            <li>Search existing threads before creating duplicates.</li>
            <li>Use clear titles and provide sufficient detail in issues or
            tickets.</li>
            <li>Avoid posting sensitive information such as private keys or
            credentials.</li>
            <li>Moderators may remove comments or threads that violate our
            policies.</li>
            <li>Contribue code and documentation under the project license;</li>
            <li>Have fun and help others learn!</li>
          </ul>

          <p>If you encounter a problem or see someone breaking the rules,
          please report it using the <em>Support Ticket</em> form.</p>
        </article>
      </div>
      <Footer />
    </main>
  );
}
