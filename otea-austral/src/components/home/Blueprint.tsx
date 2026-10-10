/**
 * Plano técnico isométrico: retícula de puntos, cotas y rumbos de horizonte,
 * con una gota de metal líquido. Decorativo.
 */
export function Blueprint({ className = "" }: { className?: string }) {
  return (
    <div className={`plano ${className}`} aria-hidden="true">
      <div className="plano-superficie reticula-puntos" />
      {/* Cotas que sobresalen del plano, como en un dibujo técnico. */}
      <span className="plano-cota -top-[6%] left-[-8%] h-px w-[116%]" />
      <span className="plano-cota -bottom-[6%] left-[-8%] h-px w-[116%]" />
      <span className="plano-cota top-[-8%] -left-[6%] h-[116%] w-px" />
      <span className="plano-cota top-[-8%] -right-[6%] h-[116%] w-px" />
      <span className="plano-etiqueta -top-[11%] left-[2%]">000°</span>
      <span className="plano-etiqueta -top-[11%] right-[2%]">090°</span>
      <span className="plano-etiqueta -bottom-[11%] right-[2%]">180°</span>
      <span className="plano-etiqueta -bottom-[11%] left-[2%]">270°</span>
      <span className="plano-etiqueta top-[46%] -right-[19%]">33°27′ S</span>
      <span className="gota" />
    </div>
  );
}
