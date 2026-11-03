# Guía: verificación en dos pasos en tus cuentas

Es la medida de seguridad que más protege a Otea Austral y **solo la puedes activar tú**: necesita tu teléfono y tus
cuentas. Con ella, aunque alguien consiga tu contraseña (por un correo falso, una filtración o una clave reutilizada),
no puede entrar sin el segundo paso. Si alguien tomara tu cuenta de GitHub, de Google Cloud o de tu correo, podría
publicar código, leer la base de datos o pedir cambios de contraseña de todo lo demás.

> Esta guía acompaña al control PR-09 del [perfil de seguridad](../src/lib/security/nist-csf.ts), hoy «objetivo»: se
> actualiza a «implementado» cuando confirmes que terminaste las casillas de abajo. No es una certificación.

## Antes de empezar (10 minutos)

1. **Elige una app de autenticación** en tu teléfono (genera códigos de seis dígitos que cambian cada 30 segundos):
   Google Authenticator, Microsoft Authenticator, 2FAS o Aegis. Cualquiera sirve; son gratuitas.
2. **Prepara dónde guardar los códigos de respaldo.** Cada servicio te dará una lista de códigos de un solo uso para el
   día que pierdas el teléfono. Guárdalos **fuera del teléfono**: impresos en un lugar seguro o en un gestor de
   contraseñas. Sin ellos, recuperar una cuenta puede tardar días.
3. **Prefiere una llave de acceso (passkey) o una llave de seguridad física** cuando el servicio la ofrezca: no se
   pueden engañar con una página falsa. Si no, la app de autenticación. **Evita el SMS** como único segundo paso: se
   puede desviar (SIM swap).

## Las cuentas, en orden de importancia

Marca cada una cuando termines.

- [ ] **1 · Tu correo principal (Google).** Es la llave maestra: desde él se restablecen todas las demás contraseñas.
  - Entra a tu cuenta de Google → **Seguridad** → **Verificación en 2 pasos** → activar. Agrega primero una llave de
    acceso o la app de autenticación, y guarda los códigos de respaldo.
  - Google Cloud (Cloud Run, Secret Manager) usa esta misma cuenta: queda protegido a la vez.
- [ ] **2 · GitHub (el código del proyecto).**
  - **Settings** → **Password and authentication** (Contraseña y autenticación) → **Two-factor authentication** →
    activar con la app de autenticación o con una llave de acceso. Descarga los códigos de respaldo.
  - Activa también, en el repositorio, **Secret scanning**, **Push protection** y **Dependabot alerts** (ver
    `SECURITY.md`): son la segunda barrera contra claves filtradas.
- [ ] **3 · El registrador del dominio** (cuando compres oteaustral.com). Quien controla el dominio controla el correo y
  el sitio. Activa su verificación en dos pasos, el bloqueo de transferencia y la renovación automática.
- [ ] **4 · Neon (base de datos) y Resend (correo).** Si entras con tu cuenta de Google o de GitHub, su protección es la de
  esa cuenta: usa siempre ese acceso (no crees una contraseña propia). Si te registras con correo y contraseña, activa la
  verificación en dos pasos en la sección de seguridad de la cuenta.
- [ ] **5 · Anthropic (solo si algún día activas el asistente con IA).** Entra con una cuenta que tenga verificación en dos
  pasos y deja el **límite de gasto mensual** de la consola en el valor que decidas (ver `docs/asistente-ia.md`).
- [ ] **6 · Cualquier otra cuenta que se agregue** (alertas de presupuesto, monitoreo, correo del negocio).

## Después de activarla

- **Prueba tu plan de rescate:** cierra sesión en un navegador de prueba y entra usando un código de respaldo (cada uno
  vale una sola vez; marca los usados).
- **Una app de autenticación en un teléfono nuevo:** la mayoría permite exportar las cuentas; si no, necesitarás los
  códigos de respaldo de cada servicio. Haz el cambio de teléfono con el anterior todavía en la mano.
- **Si pierdes el teléfono:** usa los códigos de respaldo, entra, quita el dispositivo perdido y configura el nuevo.
  Si sospechas que alguien lo tiene, cambia primero la contraseña del correo principal y cierra todas las sesiones.
- **Reglas que no cambian:** nunca compartas un código, aunque «el soporte» te lo pida; escríbelos solo en la dirección
  oficial del servicio (revisa el dominio); y no reutilices contraseñas entre cuentas.

## El panel interno de Otea (`/admin`) ya la tiene

El acceso a `/admin` exige **dos pasos**: la frase de acceso (guardada solo como hash) y un código de seis dígitos de una
app de autenticación, que además **no se puede reutilizar** (se anota en la base cada código usado). Lo genera
`npm run admin:credenciales`: imprime la frase, el secreto para agregar a tu app de autenticación y los secretos de
sesión; los tres van a Secret Manager (ver `docs/despliegue.md`). Si pierdes el teléfono, vuelve a ejecutarlo y despliega
con los valores nuevos (las sesiones anteriores quedan invalidadas).

## Para las personas que se inscriben en la lista de espera

La inscripción no necesita cuenta ni contraseña: se verifica en dos pasos (dejar el correo y confirmarlo con el enlace que
llega a ese correo, que vence a las 72 horas).

## Para las personas que tengan una cuenta de Otea (cuando se abran)

Las cuentas de personas usuarias ya están construidas, pero **cerradas** hasta que la persona responsable decida abrirlas
(ver [`cuentas.md`](cuentas.md)). Son distintas de las cuentas de arriba (las del proyecto): la verificación en dos pasos de
una cuenta de Otea es **opcional** y la activa cada persona desde «Seguridad»:

- Se agrega a una app de autenticación escaneando un código QR (o escribiendo el secreto, si no se puede escanear): el sitio
  dibuja el código por su cuenta y el secreto nunca pasa por un servicio externo.
- Al activarla entrega **10 códigos de recuperación**, que se muestran una sola vez: se guardan fuera del teléfono, como
  los de cualquier otro servicio. Cada uno vale una sola vez, y desde «Seguridad» se pueden generar otros nuevos (los
  anteriores dejan de servir).
- Entrar pide la contraseña **y** el código; las acciones delicadas (cambiar la contraseña, desactivar los dos pasos,
  eliminar la cuenta) piden de nuevo la contraseña y un código.
- **No hay recuperación asistida:** sin la app ni los códigos de recuperación, la cuenta no se puede recuperar (en esta
  versión no se puede cambiar el correo ni hay soporte humano para ello).
