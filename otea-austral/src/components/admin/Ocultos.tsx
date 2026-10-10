/** Campos que acompañan toda acción sobre una alerta: CSRF, id y versión vista. */
export function Ocultos({ csrf, id, version }: { csrf: string; id?: string; version?: number }) {
  return (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {version ? <input type="hidden" name="version" value={version} /> : null}
    </>
  );
}
