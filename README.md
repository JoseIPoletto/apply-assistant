# Apply Assistant (personal)

Extensión de Chrome (Manifest V3) que **completa** formularios de postulación en LinkedIn Easy Apply, Greenhouse y Lever con tu perfil local. **Nunca envía**: no hace clic en Siguiente, Revisar ni Enviar. No scrollea, no da likes, no manda mensajes.

## Instalar (una sola vez)

En una terminal de Windows:

```bat
git clone https://github.com/JoseIPoletto/apply-assistant "%USERPROFILE%\Desktop\automatisacion\linkedin-apply-assistant"
```

Opera/Chrome → extensiones → Modo desarrollador → **Cargar descomprimida** → `Desktop\automatisacion\linkedin-apply-assistant\dist`.

## Actualizar

Doble clic en `actualizar.bat` → en extensiones, ↻ en Apply Assistant → F5 en LinkedIn.
Tus datos no se pierden: el manifiesto fija el ID de la extensión (`key`), así que el almacenamiento sobrevive a recargas y cambios de carpeta.
La versión que corre se ve en la barrita (ej. `v0.2.0`).

`dist/` se versiona a propósito: así no hace falta Node en tu compu para usarla.

## Desarrollo

```bash
npm install
npm run build        # genera dist/
npm test             # motor + lectura/escritura del DOM
```

Chrome → `chrome://extensions` → Modo desarrollador → **Cargar descomprimida** → carpeta `dist/`.
Clic en el ícono de la extensión → abre la página de perfil. Cargá tus datos, años por tecnología, CV (PDF + texto) y, si querés, la API key.

Desarrollo: `npm run dev` recompila opciones y background en cada cambio; el content script se recompila con `npm run build`. Después, "Recargar" en `chrome://extensions`.

## Cómo decide cada campo

```
etiqueta del campo ─► reglas de perfil ─► banco (misma pregunta / parecida) ─► Claude (opcional) ─► vacío
```

| Resultado | Marca | Cuándo |
|---|---|---|
| exacto | ninguna | dato del perfil tal cual, o misma pregunta ya respondida |
| interpretado | **amarillo** | sinónimo de opción, conversión (mensual→anual), pregunta parecida del banco, todo lo que propone Claude, comboboxes |
| faltante | **rojo punteado** | la regla reconoce la pregunta pero no tenés el dato; demográficas; Claude sin dato |
| salteado | ninguna | consentimientos, "seguir a la empresa", adjuntos que no son el CV |

Datos duros (años, salario, visa, autorización) **nunca van a Claude**: si falta el dato, queda vacío. Pasá el mouse sobre un campo marcado para ver el motivo.

## Aprendizaje

- Cada campo que cambiás vos (eventos `isTrusted`) se guarda en el banco. Los cambios de la extensión no cuentan.
- Al apretar Siguiente/Revisar, lo amarillo del banco o de Claude que dejaste tal cual se toma como aceptado.
- Respuestas largas (textarea / >280 caracteres) quedan como **referencia**: Claude las usa para tu tono, no se pegan solas.
- Los campos del perfil no se aprenden desde el formulario: el perfil manda.

## Estructura

```
public/manifest.json
src/shared/     types, defaults, storage (chrome.storage.local), normalize (ES/EN), similarity
src/engine/     rules (perfil), options (opciones/rangos/sí-no), decide (orquestador), ai (prompt + parseo)
src/content/    adapters (LinkedIn/Greenhouse/Lever), dom-fields (lectura semántica), fill, highlight, toolbar, index
src/background/ única salida de red: API de Claude
src/options/    página de perfil, tecnologías, CV, banco, ajustes, respaldo
tests/          motor + DOM (jsdom)
```

## Límites conocidos del MVP

- Comboboxes con autocompletar (ciudad en LinkedIn, react-select de Greenhouse): se escribe el texto y queda en amarillo; elegís de la lista vos.
- La detección del modal de LinkedIn usa `role="dialog"` + botones de avance por texto/aria-label. Si LinkedIn cambia los textos, se ajusta en `content/adapters.ts`.
- La API key vive en `chrome.storage.local` sin cifrar. Es tu navegador, pero tenelo en cuenta.
