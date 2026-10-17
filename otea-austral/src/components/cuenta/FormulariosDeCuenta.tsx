"use client";

import { useState } from "react";
import {
  cambiarClaveAccion,
  cerrarOtrasSesionesAccion,
  cerrarSesionPorIdAccion,
  confirmarDosPasosAccion,
  desactivarDosPasosAccion,
  eliminarCuentaAccion,
  guardarPerfilAccion,
  iniciarDosPasosAccion,
  regenerarCodigosAccion,
  type EstadoFormulario,
} from "@/app/acciones/cuenta";
import { TEMA_DESCRIPCION } from "@/components/home/temas";
import { TEMAS, TEMA_ETIQUETA } from "@/lib/domain/temas";
import { secretoEnGrupos } from "@/lib/cuentas/formato-secreto";
import { CodigoQr } from "./CodigoQr";
import {
  AYUDA_CLAVE_NUEVA,
  AvisoDelFormulario,
  BotonEnviar,
  Campo,
  CampoClave,
  CLASE_CASILLA,
  CLASE_ENLACE,
  CLASE_ETIQUETA,
  CLASE_TARJETA,
  Casilla,
  useFormularioCuenta,
} from "./campos";

const Csrf = ({ valor }: { valor: string }) => <input type="hidden" name="csrf" value={valor} />;

/** Nombre, temas que sigue y si quiere el resumen de antes de la apertura. */
export function FormularioPerfil({
  csrf,
  nombre,
  temas,
  resumen,
}: {
  csrf: string;
  nombre: string | null;
  temas: string[];
  resumen: boolean;
}) {
  const f = useFormularioCuenta(guardarPerfilAccion);
  // Tras guardar, el servidor devuelve lo guardado; antes, lo que ya había.
  const valores = f.estado.valores;
  const nombreActual = typeof valores?.nombre === "string" ? valores.nombre : (nombre ?? "");
  const temasActuales = Array.isArray(valores?.temas) ? valores.temas : temas;
  const resumenActual = typeof valores?.resumen === "boolean" ? valores.resumen : resumen;
  return (
    <form action={f.despachar} aria-label="Perfil" className={CLASE_TARJETA}>
      <Csrf valor={csrf} />
      <Campo
        nombre="nombre"
        etiqueta="Cómo te llamamos"
        nota="(opcional)"
        autoComplete="nickname"
        requerido={false}
        maxLength={60}
        valor={nombreActual}
        error={f.error("nombre")}
        ayuda="Solo se usa para saludarte en esta página. Puede ser un apodo."
      />
      <fieldset className="mt-6">
        <legend className={CLASE_ETIQUETA}>Temas que sigues</legend>
        <p className="mt-2 text-sm leading-relaxed text-apoyo">Cuando abramos, las alertas de estos temas serán las primeras que veas.</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {TEMAS.map((tema) => (
            <li key={tema}>
              <label className="flex cursor-pointer items-start gap-3 rounded-badge p-3 linea-fina has-[:checked]:bg-fondo">
                <input type="checkbox" name="temas" value={tema} defaultChecked={temasActuales.includes(tema)} className={`${CLASE_CASILLA} mt-0.5`} />
                <span>
                  <span className="block text-sm font-semibold text-texto">{TEMA_ETIQUETA[tema]}</span>
                  <span className="block text-sm leading-snug text-apoyo">{TEMA_DESCRIPCION[tema]}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {f.error("temas") ? <p className="mt-2 text-sm font-medium text-texto">⚠ {f.error("temas")}</p> : null}
      </fieldset>
      <Casilla nombre="resumen" marcada={resumenActual} requerida={false} className="mt-6">
        Quiero recibir por correo el resumen de antes de la apertura del mercado, cuando esté disponible.
      </Casilla>
      <BotonEnviar enviando="Guardando…" className="mt-6">
        Guardar cambios
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
    </form>
  );
}

/** Cambiar la contraseña: pide la actual (y el código, si hay dos pasos). */
export function FormularioClave({ csrf, dosPasos }: { csrf: string; dosPasos: boolean }) {
  const f = useFormularioCuenta(cambiarClaveAccion);
  return (
    <form action={f.despachar} aria-label="Cambiar la contraseña" className={CLASE_TARJETA}>
      <Csrf valor={csrf} />
      <CampoClave nombre="actual" etiqueta="Tu contraseña actual" error={f.error("actual")} />
      <CampoClave nombre="nueva" etiqueta="Tu contraseña nueva" nueva error={f.error("nueva")} ayuda={AYUDA_CLAVE_NUEVA} className="mt-5" />
      <CampoClave nombre="repetir" etiqueta="Repite tu contraseña nueva" nueva error={f.error("repetir")} className="mt-5" />
      {dosPasos ? <CampoCodigo error={f.error("codigo")} className="mt-5" /> : null}
      <BotonEnviar enviando="Cambiando…" className="mt-6">
        Cambiar mi contraseña
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
    </form>
  );
}

/** Campo para el código de la app o uno de recuperación (acciones delicadas de una cuenta con dos pasos). */
function CampoCodigo({ error, className = "" }: { error?: string; className?: string }) {
  return (
    <Campo
      nombre="codigo"
      etiqueta="Código de tu app o de recuperación"
      autoComplete="one-time-code"
      maxLength={12}
      error={error}
      ayuda="Los seis dígitos de tu app de autenticación, o un código de recuperación."
      className={className}
    />
  );
}

/** Códigos de recuperación recién generados: se ven una sola vez. */
function CodigosDeRecuperacion({ codigos, titulo }: { codigos: string[]; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <section aria-labelledby="codigos-titulo" className="rounded-badge bg-fondo p-5 linea-fina">
      <h3 id="codigos-titulo" className="titular text-lg text-texto">
        {titulo}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-texto-suave">
        Cada código sirve <strong className="font-semibold text-texto">una sola vez</strong> para entrar si pierdes tu teléfono.
        Guárdalos en un lugar seguro (por ejemplo, en tu gestor de contraseñas): <strong className="font-semibold text-texto">no volverás a verlos</strong>.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-base text-texto" aria-label="Códigos de recuperación">
        {codigos.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(codigos.join("\n"))
            .then(() => setCopiado(true))
            .catch(() => setCopiado(false));
        }}
        className={`${CLASE_ENLACE} mt-4 text-sm`}
      >
        Copiar los códigos
      </button>
      <span role="status" className="ml-3 text-sm text-apoyo">
        {copiado ? "Copiados." : ""}
      </span>
    </section>
  );
}

/**
 * Verificación en dos pasos. Si está apagada: pide la contraseña, muestra el código QR y el secreto, y se activa al
 * confirmar con el primer código de la app (entonces entrega los códigos de recuperación). Si está activa: permite
 * generar códigos nuevos o apagarla, siempre con contraseña y código.
 */
export function PanelDosPasos(props: PropsPanelDosPasos) {
  return (
    <div className={CLASE_TARJETA}>
      <ContenidoDosPasos {...props} />
    </div>
  );
}

type PropsPanelDosPasos = {
  csrf: string;
  activa: boolean;
  /** Fecha de activación, ya formateada. */
  desde: string | null;
  codigosLibres: number;
  /** Configuración que quedó a medias (si se recarga la página), ya con su código QR. */
  pendiente: { secreto: string; uri: string; qr: { ruta: string; lado: number } | null } | null;
};

function ContenidoDosPasos({
  csrf,
  activa,
  desde,
  codigosLibres,
  pendiente,
}: PropsPanelDosPasos) {
  const inicio = useFormularioCuenta(iniciarDosPasosAccion);
  const confirmar = useFormularioCuenta(confirmarDosPasosAccion);
  const desactivar = useFormularioCuenta(desactivarDosPasosAccion);
  const regenerar = useFormularioCuenta(regenerarCodigosAccion);

  const codigosNuevos = confirmar.estado.codigos ?? regenerar.estado.codigos;
  const configuracion = inicio.estado.dosPasos ?? pendiente;

  if (codigosNuevos) {
    return (
      <div className="space-y-4">
        <AvisoDelFormulario estado={confirmar.estado.codigos ? confirmar.estado : regenerar.estado} />
        <CodigosDeRecuperacion
          codigos={codigosNuevos}
          titulo={confirmar.estado.codigos ? "Tus códigos de recuperación" : "Tus códigos de recuperación nuevos"}
        />
      </div>
    );
  }

  if (!activa && configuracion) {
    return (
      <form action={confirmar.despachar} aria-label="Confirmar la verificación en dos pasos" className="space-y-5">
        <Csrf valor={csrf} />
        <ol className="space-y-5 text-sm leading-relaxed text-texto-suave">
          <li>
            <strong className="font-semibold text-texto">1. Agrega Otea Austral a tu app de autenticación</strong> (Google Authenticator, Microsoft
            Authenticator, 1Password, Aegis…). Escanea el código con la cámara de la app:
            <div className="mt-3 flex flex-wrap items-start gap-6">
              {configuracion.qr ? (
                <CodigoQr ruta={configuracion.qr.ruta} lado={configuracion.qr.lado} etiqueta="Código QR para agregar Otea Austral a tu app de autenticación" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p>¿No puedes escanear? Escribe este secreto en tu app (tipo «basado en tiempo»):</p>
                <p className="mt-2 break-all rounded-badge bg-fondo px-3 py-2 font-mono text-base text-texto linea-fina" data-testid="secreto-dos-pasos">
                  {secretoEnGrupos(configuracion.secreto)}
                </p>
                <p className="mt-2">
                  En este mismo teléfono puedes{" "}
                  <a href={configuracion.uri} className={CLASE_ENLACE}>
                    abrir el enlace en tu app
                  </a>
                  .
                </p>
              </div>
            </div>
          </li>
          <li>
            <strong className="font-semibold text-texto">2. Escribe el código que muestra tu app</strong> para confirmar que quedó bien.
            <Campo
              nombre="codigo"
              etiqueta="Código de seis dígitos"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={7}
              error={confirmar.error("codigo")}
              className="mt-3 max-w-xs"
            />
          </li>
        </ol>
        <BotonEnviar enviando="Verificando…">Confirmar y activar</BotonEnviar>
        <AvisoDelFormulario estado={confirmar.estado} />
      </form>
    );
  }

  if (!activa) {
    return (
      <form action={inicio.despachar} aria-label="Activar la verificación en dos pasos" className="space-y-5">
        <Csrf valor={csrf} />
        <p className="text-sm leading-relaxed text-texto-suave">
          Además de tu contraseña, al entrar se pedirá un código de seis dígitos que cambia cada 30 segundos y que solo tu teléfono genera. Aunque
          alguien descubra tu contraseña, no podrá entrar sin él. Te pedimos tu contraseña para empezar.
        </p>
        <CampoClave nombre="actual" etiqueta="Tu contraseña actual" error={inicio.error("actual")} />
        <BotonEnviar enviando="Preparando…">Activar la verificación en dos pasos</BotonEnviar>
        <AvisoDelFormulario estado={inicio.estado} />
      </form>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm leading-relaxed text-texto-suave">
        <span className="mr-2 inline-flex items-center rounded-badge bg-gana px-2 py-1 text-xs font-semibold text-ink">Activada</span>
        {desde ? `Desde el ${desde}. ` : null}
        Al entrar se pide el código de tu app. Te quedan <strong className="font-semibold text-texto">{codigosLibres}</strong> códigos de
        recuperación sin usar.
        {codigosLibres <= 3 ? <strong className="font-semibold text-texto"> Son pocos: genera códigos nuevos.</strong> : null}
      </p>
      <form action={regenerar.despachar} aria-label="Generar códigos de recuperación nuevos" className="space-y-4">
        <Csrf valor={csrf} />
        <h3 className="titular text-lg text-texto">Códigos de recuperación nuevos</h3>
        <p className="text-sm leading-relaxed text-texto-suave">Los anteriores dejan de servir. Pide tu contraseña y un código para confirmar que eres tú.</p>
        <CampoClave nombre="actual" etiqueta="Tu contraseña actual" error={regenerar.error("actual")} />
        <CampoCodigo error={regenerar.error("codigo")} />
        <BotonEnviar variante="outline" enviando="Generando…">
          Generar códigos nuevos
        </BotonEnviar>
        <AvisoDelFormulario estado={regenerar.estado} />
      </form>
      <form action={desactivar.despachar} aria-label="Desactivar la verificación en dos pasos" className="space-y-4">
        <Csrf valor={csrf} />
        <h3 className="titular text-lg text-texto">Desactivar</h3>
        <p className="text-sm leading-relaxed text-texto-suave">
          No lo recomendamos: sin este segundo paso, tu cuenta queda protegida solo por la contraseña.
        </p>
        <CampoClave nombre="actual" etiqueta="Tu contraseña actual" error={desactivar.error("actual")} />
        <CampoCodigo error={desactivar.error("codigo")} />
        <BotonEnviar variante="outline" enviando="Desactivando…">
          Desactivar la verificación en dos pasos
        </BotonEnviar>
        <AvisoDelFormulario estado={desactivar.estado} />
      </form>
    </div>
  );
}

export type SesionVista = { id: string; dispositivo: string; iniciada: string; ultimoUso: string; esActual: boolean };

/** Las sesiones abiertas, con «Cerrar» en cada una y «Cerrar todas las demás». */
export function ListaSesiones({ csrf, sesiones }: { csrf: string; sesiones: SesionVista[] }) {
  const una = useFormularioCuenta(cerrarSesionPorIdAccion);
  const otras = useFormularioCuenta(cerrarOtrasSesionesAccion);
  const resultado: EstadoFormulario = otras.estado.estado !== "inicial" ? otras.estado : una.estado;
  const hayOtras = sesiones.some((s) => !s.esActual);
  return (
    <div>
      <ul className="divide-y divide-linea rounded-badge linea-fina">
        {sesiones.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-texto">
                {s.dispositivo}
                {s.esActual ? <span className="ml-2 rounded-badge bg-fondo px-2 py-0.5 text-xs font-medium text-texto linea-fina">Esta sesión</span> : null}
              </p>
              <p className="text-sm text-apoyo">
                Iniciada el {s.iniciada} · último uso {s.ultimoUso}
              </p>
            </div>
            {!s.esActual ? (
              <form action={una.despachar}>
                <Csrf valor={csrf} />
                <input type="hidden" name="id" value={s.id} />
                <BotonEnviar variante="ghost" enviando="Cerrando…">
                  Cerrar<span className="sr-only"> la sesión de {s.dispositivo} iniciada el {s.iniciada}</span>
                </BotonEnviar>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {hayOtras ? (
        <form action={otras.despachar} className="mt-4">
          <Csrf valor={csrf} />
          <BotonEnviar variante="outline" enviando="Cerrando…">
            Cerrar todas las demás sesiones
          </BotonEnviar>
        </form>
      ) : null}
      <AvisoDelFormulario estado={resultado} className="mt-3" />
    </div>
  );
}

/** Eliminar la cuenta: contraseña, código (si hay dos pasos) y una casilla de confirmación. */
export function FormularioEliminar({ csrf, dosPasos }: { csrf: string; dosPasos: boolean }) {
  const f = useFormularioCuenta(eliminarCuentaAccion);
  return (
    <form action={f.despachar} aria-label="Eliminar mi cuenta" className={CLASE_TARJETA}>
      <Csrf valor={csrf} />
      <CampoClave nombre="actual" etiqueta="Tu contraseña actual" error={f.error("actual")} />
      {dosPasos ? <CampoCodigo error={f.error("codigo")} className="mt-5" /> : null}
      <Casilla nombre="confirmar" marcada={f.marcada("confirmar")} error={f.error("condiciones")} className="mt-5">
        Entiendo que se borran mi correo, mi contraseña, mis preferencias y mis sesiones, y que no se puede deshacer.
      </Casilla>
      <BotonEnviar variante="outline" enviando="Eliminando…" className="mt-6">
        Eliminar mi cuenta definitivamente
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
    </form>
  );
}
