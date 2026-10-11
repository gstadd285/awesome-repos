import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const PRUEBAS = ["src/**/*.test.{ts,tsx}"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Contenido (plan de seguridad, controles 15 y 16): nada de HTML armado con datos ni de código
  // dinámico. La única excepción, el JSON-LD fijo de la portada, la declara con su motivo en el código.
  {
    rules: {
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
          message: "No asignes HTML armado con datos: usa texto (React lo escapa) o un componente.",
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: "No insertes HTML armado con datos: usa texto (React lo escapa) o un componente.",
        },
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]",
          message: "document.write no se usa: la CSP estricta lo hace inútil y abre la puerta a XSS.",
        },
      ],
    },
  },

  // Secretos (control 1): la configuración se lee solo desde src/lib/env.ts, que se valida al arrancar y
  // solo existe en el servidor. Un `process.env` suelto se salta esa validación.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/env.ts", "src/lib/db/prueba-postgres.ts", ...PRUEBAS],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Lee la configuración desde «@/lib/env»: ahí se valida y nunca llega al navegador.",
        },
      ],
    },
  },

  // Base de datos (control 3): solo el cliente de src/lib/db abre conexiones. El navegador no tiene
  // ningún camino a la base, y los permisos se piensan en un solo lugar.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**", ...PRUEBAS],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "pg", message: "Usa el cliente de «@/lib/db/cliente»: consultas parametrizadas y un solo pool." }] },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
