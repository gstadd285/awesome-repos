# Fuentes pendientes de verificar

Registro en `data/sources.seed.json`. Reglas: no copiar textos de las fuentes, no asumir condiciones de reutilización y
no inventar direcciones de feeds. Un feed entra en `feeds` (y la fuente pasa a `acceso: rss` o `api`) **solo después de
verlo responder**, con la fecha de esa comprobación; el esquema lo exige (`SourceSchema`, `registry.test.ts`).

## Verificación del 2026-10-25

**Resultado: 0 de 17 fuentes con feed o API verificado.** Todas siguen en `acceso: manual` y `feeds: []`.

**Método.**

1. **Lectura directa: no fue posible.** Desde el entorno de desarrollo, el proxy de salida niega (403) la conexión a los
   17 dominios y la herramienta de lectura web no resuelve ningún nombre (falla igual con sitios ajenos al registro). No se
   abrió ninguna URL, así que **ninguna se vio responder**.
2. **Búsqueda web restringida a cada dominio oficial.** Se da por confirmado el sitio oficial cuando la búsqueda devuelve
   páginas institucionales de ese dominio con contenido reciente (comunicados de 2026). Una dirección de feed o de API se
   anota como **localizada** solo si aparece como resultado dentro del dominio oficial (indexada por el buscador) o citada
   en una página oficial. Localizada no es verificada: el índice puede tener semanas o meses.
3. **Condiciones.** Se resumen, con palabras propias, los extractos del texto oficial que entrega la búsqueda (no la página
   completa). En el registro quedan como «Por confirmar en la página (extracto oficial vía búsqueda, 2026-10-25): …». Las
   tres fuentes sin extractos útiles siguen «pendiente de verificar».

| Fuente | Sitio oficial | Feed o API localizado (sin abrir) | Condiciones: página a leer | Estado |
|---|---|---|---|---|
| Banco Central de Chile | www.bcentral.cl ✔ | API de la Base de Datos Estadísticos: `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx` (documentación oficial; exige cuenta y credenciales, 5 series por segundo). RSS: no localizado | https://www.bcentral.cl/en/terms-of-use · API: https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/terms_es.htm | Pendiente |
| CMF | www.cmfchile.cl ✔ | API CMF Bancos: `https://api.cmfchile.cl/` (documentación oficial; clave por usuario y cupo). RSS: no localizado (hay suscripción por correo) | https://www.cmfchile.cl/portal/principal/623/w4-article-1833.html · API: https://api.cmfchile.cl/terminos-de-uso.html | Pendiente |
| INE | www.ine.gob.cl ✔ | API SDMX en `sdmx.ine.gob.cl` (ejemplo en la guía oficial de SIMEL). RSS: no localizado | https://www.ine.gob.cl/terminos-de-uso-y-licencia-de-datos-abiertos | Pendiente |
| Cochilco | www.cochilco.cl ✔ | No localizado (estadísticas en `boletin.cochilco.cl`) | No localizada | Pendiente |
| Ministerio de Hacienda | www.hacienda.cl ✔ | No localizado | Hay un enlace «Condiciones de uso»; su texto no apareció | Pendiente |
| Federal Reserve | www.federalreserve.gov ✔ | Índice oficial: https://www.federalreserve.gov/feeds/feeds.htm (lista «All Press Releases», «Monetary Policy»…). La URL exacta de cada feed no apareció en el dominio oficial | https://www.federalreserve.gov/disclaimer.htm | Pendiente |
| BLS | www.bls.gov ✔ | `https://www.bls.gov/feed/bls_latest.rss` y `https://www.bls.gov/feed/empsit.rss` (indexados; ayuda: https://www.bls.gov/help/hlp_rss.htm) | https://www.bls.gov/opub/copyright-information.htm | Localizado |
| SEC EDGAR | www.sec.gov ✔ | Índice: https://www.sec.gov/about/rss-feeds (URL exacta no apareció). Reglas de acceso: https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data | No localizada la de derechos | Pendiente |
| Departamento del Tesoro | home.treasury.gov ✔ | Fiscal Data API `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/` (sin clave), **fuera de `home.treasury.gov`**: haría falta otra entrada o cambiar `url_base`. Feed de comunicados no confirmado; el de OFAC se retiró el 2025-01-31 | No localizada (https://home.treasury.gov/subfooter/site-policies-and-notices no trata derechos) | Pendiente |
| BCE | www.ecb.europa.eu ✔ | `https://www.ecb.europa.eu/rss/press.xml` (indexado; índice: https://www.ecb.europa.eu/home/html/rss.en.html) | https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html | Localizado |
| FMI | www.imf.org ✔ | Índices: https://mediacenter.imf.org/Rss y https://www.imf.org/en/social-hub (URL exacta no apareció) | https://www.imf.org/en/about/copyright-and-terms (**prohíbe la descarga masiva automatizada sin permiso y el uso para entrenar modelos de lenguaje**) | Pendiente |
| Banco Mundial | www.worldbank.org ✔ | API Indicators v2 en `https://api.worldbank.org/v2/` (indexada; documentación en datahelpdesk.worldbank.org). RSS de comunicados: no localizado | Datos: https://www.worldbank.org/ext/en/legal/terms-conditions/datasets | Localizado (API) |
| BIS | www.bis.org ✔ | Índice: https://www.bis.org/rss/index.htm; `https://www.bis.org/doclist/wppubls.rss` (working papers, indexado). Comunicados: no confirmado | https://www.bis.org/about/terms-conditions | Pendiente |
| OMC | www.wto.org ✔ | `http://www.wto.org/library/rss/latest_news_e.xml`, citado en https://www.wto.org/english/res_e/webcas_e/rss_e.htm, **en http**: el esquema exige https; probar la variante https | https://www.wto.org/english/info_e/copyrights_permissions_e.htm | Pendiente |
| OPEP | www.opec.org ✔ | `https://opec.org/opec_web/en/basket.rss` (indexado, contenido no confirmado; el sitio cambió de estructura) | https://www.opec.org/terms-and-conditions.html | Pendiente |
| AIE | www.iea.org ✔ | No localizado (solo boletines por correo) | https://www.iea.org/terms · https://www.iea.org/terms/creative-commons-cc-licenses | Pendiente |
| EIA | www.eia.gov ✔ | `https://www.eia.gov/rss/press_rss.xml` (indexado; índice: https://www.eia.gov/tools/rssfeeds/). API v2 `https://api.eia.gov/v2/` con clave gratuita en la URL (la clave iría en el entorno, nunca en el registro) | https://www.eia.gov/about/copyrights_reuse.php | Localizado |

Los textos de condiciones resumidos están en el campo `condiciones_reutilizacion` de cada fuente. Lo más delicado para
el producto: el **FMI** (todos los derechos reservados, sin descarga automatizada masiva ni uso para entrenar modelos sin
permiso), la **OPEP** (copia y traducción solo con consentimiento, salvo usos acotados) y el **BIS** (extractos de hasta 400
palabras). La OMC y el BCCh distinguen uso comercial. Todo va a la lista para el abogado (`docs/alertas-reales.md` §9).

## Cómo terminar la verificación

Hace falta ver cada URL responder. Dos caminos:

- **Desde este entorno:** permitir los dominios en el acceso de red del entorno en la nube (menú del entorno en la barra de
  título → Editar → Network access → Allowed domains). Hosts que hacen falta: `www.bcentral.cl`, `si3.bcentral.cl`,
  `www.cmfchile.cl`, `api.cmfchile.cl`, `www.ine.gob.cl`, `sdmx.ine.gob.cl`, `www.cochilco.cl`, `www.hacienda.cl`,
  `www.federalreserve.gov`, `www.bls.gov`, `www.sec.gov`, `home.treasury.gov`, `api.fiscaldata.treasury.gov`,
  `www.ecb.europa.eu`, `www.imf.org`, `mediacenter.imf.org`, `www.worldbank.org`, `api.worldbank.org`, `www.bis.org`,
  `www.wto.org`, `www.opec.org`, `opec.org`, `www.iea.org`, `www.eia.gov`. Después, repetir esta verificación.
- **A mano, desde un navegador:** abrir cada URL de la tabla y la página de condiciones, y anotar lo visto.

Una fuente pasa a `rss` o `api` cuando se cumple **todo**:

1. HTTPS con respuesta 200, sin redirigir fuera del dominio de `url_base`.
2. Tipo de contenido XML (RSS 2.0 o Atom 1.0) o el JSON documentado de la API, y se lee como tal.
3. Al menos un ítem con título, enlace https dentro del dominio y fecha de los últimos 90 días.
4. El `robots.txt` del host no lo prohíbe y las condiciones, leídas completas, no impiden el uso previsto (si no, se
   pide permiso o la fuente queda manual).
5. Se agrega a `feeds` con `verificado` = fecha de la comprobación, se cambia `acceso` y las condiciones pasan a
   «Verificadas el AAAA-MM-DD: …». Las pruebas del registro deben seguir en verde.

## Historial

- **2026-10-09:** dominios confirmados (búsqueda web o dominio conocido); feeds y condiciones pendientes. El dominio antiguo
  del INE (`ine.cl`) ya no se usa.
- **2026-10-25:** búsqueda restringida por dominio, sin lectura directa (arriba). Campo `feeds` agregado al esquema.

## Prensa

Vacía a propósito: se agregará cuando se aprueben los medios y se confirmen sus condiciones de uso.

## Temas

Algunas fuentes son transversales (CMF, Hacienda, SEC EDGAR) y quedan sin tema. Si se agrega un tema
"Macro", reasignarlas.
