# Plan de respuesta a incidentes · Otea Austral

Funciones Responder y Recuperar del **NIST CSF 2.0**, en línea con NIST SP 800-61 Rev. 3. Versión
inicial para una organización de una persona; se completará al elegir el alojamiento, el correo y
la base de datos.

> Texto provisional, **pendiente de revisión legal**. Las obligaciones de notificación deben
> confirmarse con asesoría antes de un incidente real.

## 1. Qué cuenta como incidente (DE.AE-08)

Se declara incidente cuando hay evidencia o sospecha razonable de:

- Acceso no autorizado a una cuenta (GitHub, alojamiento, dominio, correo, base de datos) o al panel
  interno.
- Exposición de un secreto (token, clave, credencial), aunque no haya señales de uso.
- Exposición o pérdida de datos personales.
- Código no autorizado ejecutándose en el sitio (por ejemplo, reportes de CSP repetidos que apuntan a
  un mismo script ajeno).
- Contenido alterado sin dejar rastro, o una alerta publicada sin cumplir las reglas de verificación.
- Una dependencia comprometida en lo que está desplegado.
- Una vulnerabilidad reportada que sea explotable.
- Indisponibilidad del sitio por más de 4 horas.

## 2. Gravedad

| Nivel | Ejemplos | Primera respuesta (**objetivo**) |
|---|---|---|
| S1 crítica | Datos personales expuestos; sitio sirviendo código malicioso; cuenta tomada | Contener en menos de 4 horas |
| S2 alta | Secreto expuesto sin evidencia de uso; vulnerabilidad explotable reportada | Contener en menos de 24 horas |
| S3 media | Vulnerabilidad sin explotación conocida; alerta publicada fuera de las reglas | Corregir en menos de 7 días |
| S4 baja | Configuración mejorable; reporte informativo | Siguiente revisión del programa |

Ante la duda, se sube un nivel.

## 3. Pasos

### 3.1 Registrar (RS.MA-02, RS.AN-06)

Abrir una bitácora en cuanto se sospecha algo. Las entradas **solo se agregan** (como la auditoría
de alertas): hora en UTC, qué se vio, qué se hizo y quién. Si algo estaba mal, se agrega una
corrección; no se borra. No copiar datos personales a la bitácora: describirlos.

### 3.2 Clasificar (RS.MA-03)

Asignar gravedad, alcance (qué sistemas, qué datos, desde cuándo) y decidir si se escala a asesoría
legal o al proveedor.

### 3.3 Contener (RS.MI-01)

| Situación | Acciones |
|---|---|
| Secreto expuesto | Revocar y rotar de inmediato; revisar los registros del proveedor; si quedó en git, rotar igual (borrar el historial no basta). Pasos en «Secreto en git» más abajo. |
| Cuenta tomada | Recuperar la cuenta, cerrar sesiones, cambiar contraseña, revisar verificación en dos pasos, tokens y aplicaciones autorizadas. |
| Código no autorizado en el sitio | Volver a la última versión sana (sección 4); revisar dependencias y CI; mantener la CSP en modo bloqueo. |
| Dependencia comprometida | Fijar la versión sana anterior, regenerar el lockfile, revisar el SBOM del despliegue afectado. |
| Alerta publicada fuera de las reglas | Retractar o corregir con texto público (nunca borrar); revisar la auditoría. |
| Formulario abusado | Desactivarlo temporalmente y ajustar el límite de solicitudes. |

#### Secreto en git (la CI lo detecta con `npm run seguridad:secretos`)

1. **Revocar y rotar primero**, antes de tocar git: desde que el secreto se subió, cualquiera que haya
   clonado, hecho un fork o visto la sugerencia de un PR pudo copiarlo. Cada secreto se rota en su sistema
   (Neon, Resend, Google Cloud, `npm run admin:credenciales` para el panel; ver `docs/despliegue.md`).
2. Revisar los registros del proveedor desde la fecha del commit por usos que no sean tuyos.
3. Limpiar el historial solo después de rotar: reescribirlo con `git filter-repo --replace-text` (no con
   `git filter-branch`), forzar el push de las ramas y pedir a GitHub que elimine las vistas en caché y las
   referencias de los PR (soporte de GitHub). Avisar a quien tenga clones o forks.
4. Volver a correr `npm run seguridad:secretos` (revisa archivos y todo el historial) y dejar constancia en
   la bitácora del incidente.
5. Si fue un falso positivo, no se silencia el escáner: se agrega `escaner:ignorar` y el motivo en esa
   línea, para que quede a la vista en la revisión.

Prevención: activar _Secret scanning_ y _Push protection_ en GitHub (Settings → Code security), que
bloquea el push antes de que el secreto llegue al repositorio.

### 3.4 Erradicar (RS.MI-02)

Corregir la causa (código, configuración, dependencia o acceso), con una prueba que falle si el
problema vuelve, y pasar la CI completa.

### 3.5 Comunicar (RS.CO-02, RS.CO-03)

- Personas afectadas: aviso claro de qué pasó, qué datos y qué deben hacer.
- Público: nota en `/seguridad` mientras dure el incidente (RC.CO-04, **objetivo**).
- Autoridades: si hubo datos personales comprometidos, evaluar con asesoría legal la notificación que
  exija la ley vigente (ver `programa.md`, sección 1).
- Proveedores: avisarles si el incidente los involucra.

### 3.6 Cerrar y aprender (RS.AN-03, ID.IM-03)

Dentro de 5 días hábiles: análisis sin culpas (línea de tiempo, causa raíz, qué funcionó, qué no) y
acciones con responsable. Actualizar el perfil en `src/lib/security/nist-csf.ts` y este plan.

## 4. Recuperación (RC.RP)

1. **Elegir la versión sana:** el último commit de `main` con la CI en verde anterior al incidente.
2. **Verificar antes de usar (RC.RP-03):** que el commit y su lockfile no contengan la causa; para
   datos, restaurar en un entorno aparte y revisar antes de reemplazar (tercio 3).
3. **Restaurar:** volver a desplegar esa versión con la función de reversión de la plataforma de
   alojamiento (procedimiento exacto: pendiente al elegirla).
4. **Comprobar (RC.RP-05):** páginas principales, cabeceras de seguridad, CSP sin violaciones y
   `/.well-known/security.txt`.
5. **Vigilar 24 horas** y declarar el fin del incidente (RC.RP-06) cuando se cumplan los criterios.

## 5. Contactos

| Para | Canal |
|---|---|
| Reportes externos de vulnerabilidades | `/.well-known/security.txt` |
| Responsable de seguridad | Persona fundadora (dato fuera del repositorio) |
| GitHub | Soporte de GitHub y reporte de tokens expuestos |
| Alojamiento, correo y base de datos | Pendiente al elegir proveedores |

## 6. Plantilla de bitácora

```
Incidente: AAAA-MM-DD-nombre-corto        Gravedad: S1 | S2 | S3 | S4
Estado: abierto | contenido | erradicado | recuperado | cerrado

[AAAA-MM-DDTHH:MMZ] Qué se observó / qué se hizo / quién
[AAAA-MM-DDTHH:MMZ] ...
```
