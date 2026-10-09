import { Atmosphere } from "@/components/home/Atmosphere";
import { Hero } from "@/components/home/Hero";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default function Home() {
  return (
    <>
      <div className="relative isolate">
        <Atmosphere />
        <SiteHeader />
        <main id="contenido">
          <Hero />
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
