// Genera `src/lib/cuentas/claves-comunes.ts` (la lista de contraseñas que el sitio no acepta) a partir de la lista de las
// contraseñas más usadas de zxcvbn (Dropbox, licencia MIT) y de una lista propia de palabras y nombres de Chile y
// Latinoamérica. Se corre a mano, rara vez, y el resultado se revisa y se sube al repositorio: la aplicación no necesita
// ninguna de estas dependencias ni hace peticiones para usar la lista.
//
//   npm pack zxcvbn@4.4.2 --pack-destination /tmp/zxcvbn && tar -xzf /tmp/zxcvbn/zxcvbn-4.4.2.tgz -C /tmp/zxcvbn
//   node scripts/generar-claves-comunes.mjs /tmp/zxcvbn/package/lib/frequency_lists.js
//
// Comprueba antes que el .tgz tenga la integridad que publica npm (`npm view zxcvbn@4.4.2 dist.integrity`):
//   sha512-Bq0B+ixT/DMyG8kgX2xWcI5jUvCwqrMxSFam7m0lAf78nf04hv6lNCsyLYdyYTrCVMqNDY/206K7eExYCeSyUQ==
// Una lista local no equivale a consultar una base de contraseñas filtradas: ver `docs/cuentas.md`.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rutaListas = process.argv[2];
if (!rutaListas) {
  console.error("Uso: node scripts/generar-claves-comunes.mjs <ruta a zxcvbn/lib/frequency_lists.js>");
  process.exit(1);
}
const { passwords } = require(rutaListas);

const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const limpiar = (t) => sinAcentos(t.toLowerCase()).replace(/\s+/g, "");

// Palabras y nombres que la gente usa como base de su contraseña en Chile y Latinoamérica.
const ESPANOL = `
contraseña contrasena clave miclave micontraseña micontrasena passwordchile clavesegura clavesecreta secreto misecreto
privado seguro seguridad proteccion usuario administrador admin administrator bienvenido bienvenida hola holamundo
holaamigos tequiero tequieromucho teamo teamomucho tamo amor miamor mivida micorazon corazon princesa principe lindo
linda bonita hermosa hermoso guapo guapa chileno chilena chile chilito vivachile arribachile cuecachilena santiago
valparaiso vinadelmar concepcion temuco antofagasta iquique arica puertomontt puntarenas laserena rancagua talca
coquimbo calama osorno valdivia chillan curico colocolo universidaddechile udechile ucatolica cobreloa huachipato
everton wanderers santiagowanderers audax palestino lareina libertad esperanza fortuna suerte felicidad feliz amistad
amigos amigo amiga familia mifamilia hermano hermana mama papa mamita papito abuelo abuela tio tia primo prima hijo
hija bebe bebito mibebe dios jesus cristo bendecido bendiciones gracias dinero plata platita inversion inversionista
bolsa acciones trading trader bitcoin cripto dolar euro peso cobre minero minera codelco enami sqm latam copec
falabella cencosud ripley jumbo unimarc movistar entel claro mercadolibre correo micorreo gmail hotmail outlook yahoo
futbol futbolista messi ronaldo neymar barcelona realmadrid riverplate boca universidad estudiante profesor colegio
trabajo empresa oficina gerente jefe ingeniero doctor abogado enero febrero marzo abril mayo junio julio agosto
septiembre octubre noviembre diciembre lunes martes miercoles jueves viernes sabado domingo verano invierno primavera
otoño otono navidad cumpleaños cumpleanos naruto goku dragonball pokemon minecraft fortnite playstation nintendo xbox
batman superman spiderman harrypotter starwars shakira badbunny daddyyankee maluma jbalvin luisfonsi despacito perro
gato perrito gatito michi firulais rocky luna sol estrella cielo mar montaña montana volcan lago rio bosque flor flores
rosa rosas margarita jazmin camila valentina sofia isabella martina catalina javiera fernanda constanza antonia
francisca florencia agustina daniela carolina paola andrea maria jose juan pedro pablo diego matias benjamin vicente
joaquin sebastian nicolas felipe cristobal gonzalo ignacio tomas lucas mateo santiago1 alejandro fernando carlos
manuel miguel luis jorge francisco rodrigo patricio claudio marcelo eduardo ricardo roberto sergio victor hugo oscar
teclado abcdefgh abcdefghijkl qwertyuiop asdfghjkl zxcvbnm qazwsx 1q2w3e4r pass1234 clave1234 hola1234 admin1234
otea austral oteaustral oteaustral1 otea1234 oteaustral2026 oteaustral2025 inteligenciadeeventos delhorizonteal
mercado mercados alertas
`
  .split(/\s+/)
  .filter(Boolean);

const entradas = new Set();
const agregar = (t) => {
  const l = limpiar(t);
  if (l.length >= 4 && /^[\x21-\x7e]+$/.test(l)) entradas.add(l);
};

// Los 10 000 más usados (el orden de zxcvbn es por frecuencia) y, del resto, los de 12 o más caracteres: con el largo
// mínimo que exige el sitio, son los únicos que importan enteros.
passwords.forEach((p, i) => {
  if (i < 10_000 || limpiar(p).length >= 12) agregar(p);
});
ESPANOL.forEach(agregar);

const lista = [...entradas].sort();
const lineas = [];
let linea = "";
for (const e of lista) {
  if (linea.length + e.length + 1 > 118) {
    lineas.push(linea);
    linea = "";
  }
  linea += (linea ? " " : "") + e;
}
if (linea) lineas.push(linea);

const cuerpo = `/**
 * Contraseñas que no se aceptan por ser de las primeras que probaría cualquiera (NIST SP 800-63B, lista de contraseñas
 * comunes). Todo se compara sin tildes y en minúsculas, y también quitando números y símbolos del principio y del
 * final, y cambiando las letras que se suelen sustituir por cifras (@ por a, 0 por o…): ver \`politica-clave.ts\`.
 *
 * Fuentes (ambas sin red en tiempo de ejecución):
 *   · Las 10 000 contraseñas más usadas de la lista de zxcvbn, y las de 12 o más caracteres de sus 30 000
 *     (Copyright (c) 2012-2016 Dan Wheeler and Dropbox, Inc. · licencia MIT).
 *   · Una lista propia de palabras y nombres que se usan de base en Chile y Latinoamérica, y del propio sitio.
 *
 * Es una lista local: no equivale a consultar una base de contraseñas filtradas. Ver \`docs/cuentas.md\`.
 * Archivo generado; no editar a mano.
 */
export const CLAVES_COMUNES_TEXTO = \`
${lineas.join("\n")}
\`;
`;

writeFileSync(fileURLToPath(new URL("../src/lib/cuentas/claves-comunes.ts", import.meta.url)), cuerpo);
console.log("entradas:", lista.length, "bytes:", cuerpo.length);
