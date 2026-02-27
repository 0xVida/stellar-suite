import Link from "next/link";

const Footer = () => {
  return (
    <footer className="border-t border-border py-8 px-6">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-body text-muted-foreground">Stellar Kit (prev. Stellar Suite) — Built for Stellar developers</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-body text-muted-foreground">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
          <a href="https://stellar.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Stellar</a>
          <a href="https://soroban.stellar.org" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Soroban Docs</a>
          <Link href="/changelog" className="hover:text-foreground transition-colors">Changelog</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
