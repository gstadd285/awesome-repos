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

## Tipografías (`src/app/_tipografias/`)

Inter, Source Serif 4 y JetBrains Mono, en los subconjuntos latin y latin-ext, se distribuyen dentro del repositorio para que la
compilación no dependa de la red (`next/font/local`). Son los mismos archivos WOFF2 que Google Fonts servía a `next/font/google`
(mismos bytes; los de latin, idénticos también a las copias OFL del paquete de videos del proyecto), sin modificar:

| Archivo | Familia y versión | SHA-256 |
|---|---|---|
| `inter-latin.woff2` | Inter 4.001 (variable, wght 100–900) | `c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4` |
| `inter-latin-ext.woff2` | Inter 4.001 (variable, wght 100–900) | `a28eb6d3ccb534ae0c94ca999371df024aab60b08c3c8a5720ee9e32fa0faaa2` |
| `source-serif-4-latin.woff2` | Source Serif 4 4.004 (variable, wght 200–900) | `8e38e3fbd74dea20aabe0831ffef04c9f30bf6fc5b99b7a2649be0dd8c6d859c` |
| `source-serif-4-latin-ext.woff2` | Source Serif 4 4.004 (variable, wght 200–900) | `231f594ad829d45f905a8a6cdce704f659615e00f1a9db2699320e6e315c1d1f` |
| `jetbrains-mono-latin-400.woff2` | JetBrains Mono 2.211 (400) | `d3dcdccdaba31643defe2317942155d4af3ee03951d058adbe8bc02b13e61b0a` |
| `jetbrains-mono-latin-ext-400.woff2` | JetBrains Mono 2.211 (400) | `d5f407e28185790518c49ec8738fa89916ddc99f793010d249165d0e2c2452cc` |

Avisos de copyright (los de cada archivo, en su tabla `name`):

- Inter: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter).
- Source Serif 4: © 2014 - 2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name ‘Source’.
- JetBrains Mono: Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono).

Las tres se distribuyen bajo la SIL Open Font License, versión 1.1 (también en https://openfontlicense.org):

```
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
