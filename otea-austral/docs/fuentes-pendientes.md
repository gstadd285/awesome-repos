# Fuentes pendientes de verificar

Registro en `data/sources.seed.json`. Reglas: no copiar textos de las fuentes, no asumir condiciones
de reutilización y no inventar direcciones de feeds.

## Estado al 2026-10-09

| Fuente | `url_base` | Cómo se comprobó | Feed RSS / API | Condiciones de reutilización |
|---|---|---|---|---|
| Banco Central de Chile | https://www.bcentral.cl/ | Dominio conocido | Pendiente | Pendiente |
| CMF | https://www.cmfchile.cl/ | Búsqueda web (2026-10-09) | Pendiente | Pendiente |
| INE | https://www.ine.gob.cl/ | Búsqueda web (2026-10-09); el dominio antiguo ine.cl ya no se usa | Pendiente | Pendiente |
| Cochilco | https://www.cochilco.cl/ | Búsqueda web (2026-10-09) | Pendiente | Pendiente |
| Ministerio de Hacienda | https://www.hacienda.cl/ | Dominio conocido | Pendiente | Pendiente |
| Federal Reserve | https://www.federalreserve.gov/ | Dominio conocido | Pendiente | Pendiente |
| BLS | https://www.bls.gov/ | Dominio conocido | Pendiente | Pendiente |
| SEC EDGAR | https://www.sec.gov/edgar | Dominio conocido | Pendiente | Pendiente |
| Departamento del Tesoro | https://home.treasury.gov/ | Dominio conocido | Pendiente | Pendiente |
| BCE | https://www.ecb.europa.eu/ | Dominio conocido | Pendiente | Pendiente |
| FMI | https://www.imf.org/ | Dominio conocido | Pendiente | Pendiente |
| Banco Mundial | https://www.worldbank.org/ | Dominio conocido | Pendiente | Pendiente |
| BIS | https://www.bis.org/ | Dominio conocido | Pendiente | Pendiente |
| OMC | https://www.wto.org/ | Dominio conocido | Pendiente | Pendiente |
| OPEP | https://www.opec.org/ | Dominio conocido | Pendiente | Pendiente |
| AIE | https://www.iea.org/ | Dominio conocido | Pendiente | Pendiente |
| EIA | https://www.eia.gov/ | Dominio conocido | Pendiente | Pendiente |

El entorno de desarrollo no tiene acceso de red a estos sitios, así que ninguna dirección se abrió
desde aquí. **Antes de publicar**: abrir cada enlace, confirmar que es el sitio oficial, buscar sus
feeds o APIs oficiales (si existen) y leer sus condiciones de uso. Cambiar `acceso` a `rss` o `api`
solo cuando el feed esté verificado.

## Prensa

Vacía a propósito: se agregará cuando se aprueben los medios y se confirmen sus condiciones de uso.

## Temas

Algunas fuentes son transversales (CMF, Hacienda, SEC EDGAR) y quedan sin tema. Si se agrega un tema
"Macro", reasignarlas.
