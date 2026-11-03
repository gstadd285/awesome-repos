import { z } from "zod";
import { TEMAS } from "@/lib/domain/temas";
import { FORMATO_TOKEN, LARGO_MAX_NOMBRE } from "./constantes";

/**
 * Versión de los textos que acepta la persona al crear su cuenta (condiciones de uso y política de privacidad); se guarda
 * con la cuenta. Cámbiala cada vez que cambie lo que esas casillas dicen o lo que las dos páginas aclaran sobre las
 * cuentas. Los textos son provisionales: el sufijo `borrador` se quita cuando los revise una persona abogada.
 */
export const VERSION_TEXTOS = "2026-10-borrador-6";

/** Correo normalizado: sin espacios y en minúsculas (el mismo correo, escrito distinto, es una sola cuenta). */
export const CorreoSchema = z
  .string({ message: "Escribe un correo válido." })
  .trim()
  .toLowerCase()
  .max(254, "El correo es demasiado largo.")
  .pipe(z.email({ message: "Escribe un correo válido." }));

/** Caracteres de control y de formato (saltos de línea, marcas de dirección): no caben en un nombre. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/;

/** Nombre para mostrar: opcional, una sola línea, sin caracteres invisibles. Vacío = sin nombre (`null`). */
export const NombreSchema = z
  .string()
  .transform((s) => s.normalize("NFKC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .max(LARGO_MAX_NOMBRE, `El nombre admite hasta ${LARGO_MAX_NOMBRE} caracteres.`)
      .refine((s) => !CONTROL.test(s), "El nombre tiene caracteres que no se pueden mostrar."),
  )
  .transform((s) => (s === "" ? null : s));

export const TemasSchema = z
  .array(z.enum(TEMAS, { message: "Hay un tema que no existe." }))
  .max(TEMAS.length)
  .transform((t) => [...new Set(t)]);

/** Casilla de un formulario HTML: llega como «on» si está marcada y no llega si no. */
const marcada = (mensaje: string) => z.literal("on", { message: mensaje });

export const AltaSchema = z.object({
  correo: CorreoSchema,
  condiciones: marcada("Para crear tu cuenta necesitas aceptar las condiciones de uso."),
  privacidad: marcada("Necesitamos tu consentimiento para guardar los datos de tu cuenta."),
});

/** Token de un enlace de correo. */
export const TokenSchema = z.string().regex(FORMATO_TOKEN);

const claveEscrita = z.string({ message: "Escribe tu contraseña." }).min(1, "Escribe tu contraseña.").max(1024);

export const EntrarSchema = z.object({
  correo: z.string().trim().toLowerCase().max(254),
  clave: claveEscrita,
});

export const PerfilSchema = z.object({
  nombre: NombreSchema,
  temas: TemasSchema,
  resumenPrevio: z.boolean(),
});

/** Código del segundo paso: seis dígitos de la app o un código de recuperación (`xxxxx-xxxxx`). */
export const CodigoSchema = z
  .string({ message: "Escribe el código." })
  .transform((s) => s.replace(/[\s-]/g, "").toLowerCase())
  .pipe(z.string().regex(/^([0-9]{6}|[a-z0-9]{10})$/, "Revisa el código: son seis dígitos o un código de recuperación."));

export type Alta = z.infer<typeof AltaSchema>;
export type Perfil = z.infer<typeof PerfilSchema>;
