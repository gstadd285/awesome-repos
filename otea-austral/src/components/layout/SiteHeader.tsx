import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export function SiteHeader() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-6">
      <Link href="/" aria-label="Otea Austral, inicio" className="rounded-badge">
        <Logo />
      </Link>
    </header>
  );
}
