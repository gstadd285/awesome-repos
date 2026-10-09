/** Retícula tenue y foco de luz cónico cálido detrás del hero. Decorativo. */
export function Atmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="bg-grid absolute inset-0" />
      <div className="bg-spotlight absolute inset-x-0 top-0 h-[720px]" />
    </div>
  );
}
