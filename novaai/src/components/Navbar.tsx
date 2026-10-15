import { Hexagon } from "lucide-react";
import { Reveal } from "./Reveal";

const LINKS = [
  { label: "Projects", sup: "6" },
  { label: "About" },
  { label: "Blog" },
  { label: "Contact" },
];

export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 w-full border-b border-white/15">
      <div className="flex items-center justify-between px-5 py-4 sm:px-8 md:px-12">
        <Reveal delay={0}>
          <a href="#" className="flex items-center gap-2 text-white">
            <Hexagon size={24} strokeWidth={1.5} />
            <span className="text-lg font-medium tracking-tight sm:text-xl">novaai</span>
          </a>
        </Reveal>

        <nav className="hidden items-center gap-8 md:flex lg:gap-10" aria-label="Main">
          {LINKS.map((link, i) => (
            <Reveal key={link.label} delay={100 + i * 100}>
              <a href="#" className="text-sm text-white/85 transition-colors duration-300 hover:text-white">
                {link.label}
                {link.sup && <sup className="ml-0.5 font-mono text-[10px] text-white/60">{link.sup}</sup>}
              </a>
            </Reveal>
          ))}
        </nav>

        <Reveal delay={500}>
          <a
            href="#"
            className="rounded-md border border-white/20 bg-white/15 px-4 py-2 text-xs text-white backdrop-blur-md transition-colors duration-300 hover:bg-white/25 sm:px-5 sm:text-sm"
          >
            Get Free Consultation
          </a>
        </Reveal>
      </div>
    </header>
  );
}
