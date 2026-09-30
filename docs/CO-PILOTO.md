# Co-piloto · agente para duelos de IA creativa

El Co-piloto desarma el brief, propone tres rutas, recomienda una, escribe el prompt
y prepara el pase a composición. Vos elegís la ruta, evaluás la imagen y aprobás el
resultado. Fuente: `.claude/skills/co-piloto/SKILL.md`.

---

## Dónde usarlo

El agente es un skill: un único archivo de instrucciones que funciona igual en los
tres lugares.

| Dónde | Cómo |
|---|---|
| **Claude Code, en este repo** | Escribí `/co-piloto` y pegá la configuración o el brief. También se activa solo cuando pegás un `BRIEF:`. |
| **claude.ai** | Comprimí la carpeta `.claude/skills/co-piloto/` en un `.zip` (con la carpeta adentro, no solo el archivo) y subila en la sección de Skills de la configuración. |
| **Otro asistente** (Gem de Gemini, proyecto de Claude, GPT) | Copiá el contenido de `SKILL.md` desde `# Co-piloto` hacia abajo, sin el encabezado entre `---`, y pegalo como instrucciones. |

Es un skill y no un subagente a propósito: el skill trabaja dentro de la conversación
principal, así que la configuración, la ruta elegida y el hero aprobado se mantienen
de un mensaje al otro. Un subagente arranca de cero en cada llamada y perdería ese
estado en medio del duelo.

Para entrenar con briefs sorpresa o evaluar renders con los criterios del jurado sigue
estando el skill `duelo-ia-creative-challenge`. El Co-piloto es para operar en vivo.

---

## Antes del duelo: configuración

Pegala una vez. El agente la confirma en una línea y no la vuelve a pedir salvo que el
brief la contradiga. Los campos que no uses, dejalos vacíos o borralos.

```text
CONFIG
Motor principal:
Motor de respaldo:
Formato de entrega:
Referencias de producto o marca:
Plantilla de composición:
Acciones autorizadas:
Doble vía: activada / desactivada
```

Sin configuración, el agente entrega prompts portables (lenguaje natural, formato en
palabras, sin parámetros de un motor en particular) y sigue avanzando.

**Acciones autorizadas** define qué puede ejecutar solo. Si no lo autorizás
expresamente, elegir la ruta sigue siendo tuyo: el agente no manda la ruta recomendada
a un motor hasta que respondas `1`, `2` o `3`.

---

## Durante el duelo

1. Pegá el brief (`;brief` inserta `BRIEF: `).
2. El agente responde con la lectura del encargo, tres rutas, la recomendada y el
   prompt listo para producir.
3. Elegí con `1`, `2` o `3`. Ajustá con `más simple`, `corregir: …` o `doble vía`.
4. Cuando una imagen sirve, fijala con `hero aprobado`.
5. Cerrá con `maquetar`. Si te sobra tiempo, `video`.

Si le decís que pasó el minuto 8:30, deja de explorar y prioriza composición y
exportación.

### Comandos

| Comando | Qué hace |
|---|---|
| `1`, `2`, `3` | Desarrolla esa ruta sin repetir el análisis |
| `doble vía` | Prepara el mismo concepto para el motor principal y el de respaldo |
| `más simple` | Reduce la complejidad conservando el concepto |
| `corregir: [problema]` | Entrega un único prompt de edición |
| `rescate` | Produce la alternativa viable más sencilla |
| `hero aprobado` | Fija esa imagen como base; no la reemplaza |
| `maquetar` | Prepara el pase a la plantilla |
| `video` | Entrega el prompt de animación de la imagen aprobada |

`hero aprobado` no activa el video: hay que pedirlo.

### Estados

Cada prompt sale etiquetado con su estado. El agente solo marca ENVIADO o GENERADO
cuando la herramienta lo confirma:

| Estado | Significa |
|---|---|
| **PREPARADO** | El texto está listo para copiar |
| **ENVIADO** | La herramienta confirmó el envío |
| **GENERADO** | El resultado está disponible |

---

## Atajos de teclado

Usan el mismo vocabulario que los comandos, para no tener que recordar dos sistemas.

| Atajo | Texto que inserta |
|---|---|
| `;brief` | `BRIEF: ` |
| `;doble` | `doble vía` |
| `;fix` | `corregir: ` |
| `;rescate` | `rescate. Tiempo restante: 2 minutos.` |
| `;hero` | `hero aprobado` |
| `;layout` | `maquetar` |

Los atajos se configuran fuera del agente, en el expansor de texto que uses (en macOS,
Configuración del Sistema → Teclado → Reemplazos de texto; también sirven Espanso o
Raycast). Probalos antes del duelo en la misma app donde vas a escribir.

---

## Límites

- El skill define cómo trabaja el agente. Por sí solo no instala atajos, no conecta
  motores y no abre plantillas.
- Solo envía prompts a un motor si la sesión tiene esa herramienta conectada y la
  acción está autorizada. Si no, entrega el prompt como PREPARADO para que lo copies.
- Disparar dos motores a la vez con la doble vía necesita una integración o una macro
  probada antes del duelo. Sin eso, la doble vía entrega dos prompts para pegar a mano.
- Si no puede ver la plantilla, no inventa sus medidas ni sus zonas seguras.
