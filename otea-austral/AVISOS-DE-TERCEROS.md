# Avisos de terceros

Otea Austral usa dependencias de npm con sus propias licencias (el inventario completo de lo que se despliega se genera
en cada verificación de la CI, en formato CycloneDX). Aquí van solo los avisos de **material de terceros que está copiado
dentro del repositorio** y exige conservar su aviso de licencia.

## Lista de contraseñas comunes (`src/lib/cuentas/claves-comunes.ts`)

Las 10 000 contraseñas más usadas de la lista de frecuencias de **zxcvbn 4.4.2** (y, de sus 30 000, las de 12 o más
caracteres) forman parte de la lista de contraseñas que las cuentas no aceptan. El archivo se genera con
`scripts/generar-claves-comunes.mjs` (ver `docs/cuentas.md`).

```
Copyright (c) 2012-2016 Dan Wheeler and Dropbox, Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

La segunda parte de la lista (palabras y nombres de uso común en Chile y Latinoamérica, y del propio sitio) es de Otea.
