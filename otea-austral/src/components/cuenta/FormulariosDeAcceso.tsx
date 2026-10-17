"use client";

import { useState } from "react";
import {
  activarCuentaAccion,
  crearCuentaAccion,
  entrarAccion,
  olvideAccion,
  restablecerAccion,
  verificarSegundoPasoAccion,
} from "@/app/acciones/cuenta";
import {
  AYUDA_CLAVE_NUEVA,
  AvisoDelFormulario,
  BotonEnviar,
  Campo,
  CampoClave,
  CampoTrampa,
  CLASE_ENLACE,
  CLASE_TARJETA,
  Casilla,
  EnlaceTexto,
  Pasos,
  useFormularioCuenta,
  useHidratado,
} from "./campos";

/** Entrar con correo y contraseña. El mensaje de error es el mismo exista o no el correo. */
export function FormularioEntrar({ siguiente }: { siguiente?: string }) {
  const f = useFormularioCuenta(entrarAccion);
  return (
    <form action={f.despachar} aria-label="Entrar a tu cuenta" className={CLASE_TARJETA}>
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}
      <Campo nombre="correo" etiqueta="Tu correo" tipo="email" autoComplete="username" inputMode="email" maxLength={254} valor={f.texto("correo")} error={f.error("correo")} placeholder="nombre@correo.cl" />
      <CampoClave nombre="clave" etiqueta="Tu contraseña" className="mt-5" />
      <BotonEnviar enviando="Verificando…" className="mt-6 w-full">
        Entrar
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
      <p className="mt-2 text-sm text-texto-suave">
        <EnlaceTexto href="/cuenta/olvide">¿Olvidaste tu contraseña?</EnlaceTexto>
      </p>
    </form>
  );
}

/** Paso 1 de la creación de la cuenta: el correo y los dos textos. El paso 2 llega por correo. */
export function FormularioCrear({ marca }: { marca: string }) {
  // Cambiar la clave reinicia el formulario (la acción vuelve a su estado inicial): «Usar otro correo».
  const [intento, setIntento] = useState(0);
  return <FormularioCrearInterno key={intento} marca={marca} otro={() => setIntento((i) => i + 1)} />;
}

function FormularioCrearInterno({ marca, otro }: { marca: string; otro: () => void }) {
  const f = useFormularioCuenta(crearCuentaAccion);
  const enviado = f.estado.estado === "enviado";
  const etiquetaPasos = "La cuenta se crea en dos pasos";
  if (enviado) {
    return (
      <div className={CLASE_TARJETA}>
        <Pasos actual={2} etiqueta={etiquetaPasos} uno="Deja tu correo y acepta los textos" dos="Confirma desde el enlace y elige tu contraseña" />
        <AvisoDelFormulario estado={f.estado} />
        <p className="mt-4 text-sm leading-relaxed text-texto-suave">
          ¿No llegó? Revisa la carpeta de spam. Si en unos minutos no lo ves, puedes pedir otro.{" "}
          <button type="button" onClick={otro} className={CLASE_ENLACE}>
            Usar otro correo o pedirlo de nuevo
          </button>
        </p>
      </div>
    );
  }
  return (
    <form action={f.despachar} noValidate aria-label="Crear una cuenta" className={CLASE_TARJETA}>
      <Pasos actual={1} etiqueta={etiquetaPasos} uno="Deja tu correo y acepta los textos" dos="Confirma desde el enlace y elige tu contraseña" />
      <Campo nombre="correo" etiqueta="Tu correo" tipo="email" autoComplete="email" inputMode="email" maxLength={254} valor={f.texto("correo")} error={f.error("correo")} placeholder="nombre@correo.cl" />
      <input type="hidden" name="tiempo" value={marca} />
      <CampoTrampa />
      <fieldset className="mt-5 rounded-badge p-4 linea-fina">
        <legend className="micro px-1 text-texto">Antes de seguir</legend>
        <Casilla nombre="condiciones" marcada={f.marcada("condiciones")} error={f.error("condiciones")}>
          Acepto las <EnlaceTexto href="/terminos">condiciones de uso</EnlaceTexto>.
        </Casilla>
        <Casilla nombre="privacidad" marcada={f.marcada("privacidad")} error={f.error("privacidad")} className="mt-3">
          Acepto que Otea guarde mi correo, mi contraseña y mis preferencias para tener una cuenta, según la{" "}
          <EnlaceTexto href="/privacidad">política de privacidad</EnlaceTexto>.
        </Casilla>
      </fieldset>
      <BotonEnviar enviando="Enviando…" className="mt-6 w-full">
        Crear mi cuenta
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
      <p className="mt-2 text-xs leading-relaxed text-apoyo">
        Verificamos tu correo antes de crear la cuenta: te enviamos un enlace y, desde él, eliges tu contraseña. Así nadie
        puede abrir una cuenta con tu correo. ¿Ya tienes una? <EnlaceTexto href="/cuenta/entrar">Entra aquí</EnlaceTexto>.
      </p>
    </form>
  );
}

/** Paso 2: con el enlace del correo se elige la contraseña. */
export function FormularioActivar({ token, correoEnmascarado }: { token: string; correoEnmascarado: string | null }) {
  const f = useFormularioCuenta(activarCuentaAccion);
  return (
    <form action={f.despachar} aria-label="Elegir tu contraseña" className={CLASE_TARJETA}>
      <Pasos actual={2} etiqueta="La cuenta se crea en dos pasos" uno="Deja tu correo y acepta los textos" dos="Confirma desde el enlace y elige tu contraseña" />
      <input type="hidden" name="token" value={token} />
      {correoEnmascarado ? (
        <p className="mb-5 text-sm text-texto-suave">
          Vas a crear la cuenta de <strong className="font-semibold text-texto">{correoEnmascarado}</strong>.
        </p>
      ) : null}
      <CampoClave nombre="clave" etiqueta="Elige tu contraseña" nueva error={f.error("clave")} ayuda={AYUDA_CLAVE_NUEVA} />
      <CampoClave nombre="repetir" etiqueta="Repite tu contraseña" nueva error={f.error("repetir")} className="mt-5" />
      <BotonEnviar enviando="Creando tu cuenta…" className="mt-6 w-full">
        Crear mi cuenta y entrar
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
      {f.estado.estado === "error" && f.estado.mensaje?.startsWith("El enlace") ? (
        <p className="mt-2 text-sm text-texto-suave">
          <EnlaceTexto href="/cuenta/crear">Pedir un enlace nuevo</EnlaceTexto>
        </p>
      ) : null}
    </form>
  );
}

/** Segundo paso al entrar, para las cuentas con la verificación en dos pasos: el código de la app o uno de recuperación. */
export function FormularioSegundoPaso({ siguiente }: { siguiente?: string }) {
  const f = useFormularioCuenta(verificarSegundoPasoAccion);
  const hidratado = useHidratado();
  const [recuperacion, setRecuperacion] = useState(false);
  // Sin JavaScript no se puede cambiar de modo: el campo acepta entonces los dos tipos de código. Con JavaScript parte en el
  // código de la app (teclado numérico) y ofrece pasar al de recuperación.
  const soloApp = hidratado && !recuperacion;
  return (
    <form action={f.despachar} aria-label="Verificación en dos pasos" className={CLASE_TARJETA}>
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}
      <Campo
        nombre="codigo"
        etiqueta={!hidratado ? "Código de tu app o de recuperación" : recuperacion ? "Código de recuperación" : "Código de tu app de autenticación"}
        autoComplete="one-time-code"
        inputMode={soloApp ? "numeric" : "text"}
        maxLength={soloApp ? 7 : 12}
        error={f.error("codigo")}
        ayuda={
          !hidratado
            ? "Los seis dígitos de tu app o, si no puedes usarla, uno de tus códigos de recuperación (diez letras y números, como abcde-fghjk)."
            : recuperacion
              ? "Son diez letras y números en dos grupos, como abcde-fghjk. Cada código sirve una sola vez."
              : "Abre tu app y escribe los seis dígitos que muestra para Otea Austral."
        }
        className=""
      />
      <BotonEnviar enviando="Verificando…" className="mt-6 w-full">
        Verificar
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
      {hidratado ? (
        <p className="mt-2 text-sm text-texto-suave">
          <button type="button" onClick={() => setRecuperacion((r) => !r)} className={CLASE_ENLACE} aria-pressed={recuperacion}>
            {recuperacion ? "Usar el código de mi app" : "No puedo usar mi app: usar un código de recuperación"}
          </button>
        </p>
      ) : null}
    </form>
  );
}

/** ¿Olvidaste tu contraseña? Responde lo mismo exista o no una cuenta con ese correo. */
export function FormularioOlvide({ marca }: { marca: string }) {
  const [intento, setIntento] = useState(0);
  return <FormularioOlvideInterno key={intento} marca={marca} otro={() => setIntento((i) => i + 1)} />;
}

function FormularioOlvideInterno({ marca, otro }: { marca: string; otro: () => void }) {
  const f = useFormularioCuenta(olvideAccion);
  if (f.estado.estado === "enviado") {
    return (
      <div className={CLASE_TARJETA}>
        <AvisoDelFormulario estado={f.estado} />
        <p className="mt-4 text-sm leading-relaxed text-texto-suave">
          ¿Escribiste mal el correo?{" "}
          <button type="button" onClick={otro} className={CLASE_ENLACE}>
            Probar con otro
          </button>
        </p>
      </div>
    );
  }
  return (
    <form action={f.despachar} noValidate aria-label="Restablecer la contraseña" className={CLASE_TARJETA}>
      <Campo nombre="correo" etiqueta="Tu correo" tipo="email" autoComplete="email" inputMode="email" maxLength={254} valor={f.texto("correo")} error={f.error("correo")} placeholder="nombre@correo.cl" />
      <input type="hidden" name="tiempo" value={marca} />
      <CampoTrampa />
      <BotonEnviar enviando="Enviando…" className="mt-6 w-full">
        Enviarme el enlace
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
      <p className="mt-2 text-sm text-texto-suave">
        <EnlaceTexto href="/cuenta/entrar">Volver a entrar</EnlaceTexto>
      </p>
    </form>
  );
}

/** Con el enlace del correo, elegir la contraseña nueva. */
export function FormularioRestablecer({ token }: { token: string }) {
  const f = useFormularioCuenta(restablecerAccion);
  return (
    <form action={f.despachar} aria-label="Elegir una contraseña nueva" className={CLASE_TARJETA}>
      <input type="hidden" name="token" value={token} />
      <CampoClave nombre="clave" etiqueta="Tu contraseña nueva" nueva error={f.error("clave")} ayuda={AYUDA_CLAVE_NUEVA} />
      <CampoClave nombre="repetir" etiqueta="Repite tu contraseña nueva" nueva error={f.error("repetir")} className="mt-5" />
      <BotonEnviar enviando="Guardando…" className="mt-6 w-full">
        Cambiar mi contraseña
      </BotonEnviar>
      <AvisoDelFormulario estado={f.estado} className="mt-4" />
      {f.estado.estado === "error" && f.estado.mensaje?.startsWith("El enlace") ? (
        <p className="mt-2 text-sm text-texto-suave">
          <EnlaceTexto href="/cuenta/olvide">Pedir un enlace nuevo</EnlaceTexto>
        </p>
      ) : null}
    </form>
  );
}
