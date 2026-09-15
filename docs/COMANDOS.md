# Catálogo de comandos para Claude

> Un vocabulario compacto para pedirle a Claude **exactamente** lo que necesitas.
> 170 comandos: los 43 de la lista original (marcados con ★) y 127 añadidos, agrupados por trabajo real.

---

## Antes de nada: qué son (y qué no son) estos comandos

Estos comandos **no vienen integrados** en Claude ni en Claude Code. Son *atajos de prompt*:
palabras clave con un significado acordado entre tú y el modelo. Funcionan de tres maneras,
de menor a mayor compromiso:

**1. Al vuelo (cero configuración).** Escribe el comando y el tema en el mismo mensaje:

```
/critique mi plan de lanzamiento: [pega el plan]
```

Claude entiende la intención por el nombre. Suficiente el 80 % de las veces.

**2. Con el diccionario cargado.** Pega la sección «Diccionario mínimo» (abajo) al inicio de
un chat, o guárdala en las instrucciones de un Proyecto. A partir de ahí el comando se
comporta igual en cada conversación, sin explicar nada.

**3. Como slash commands reales de Claude Code.** Un archivo por comando en
`.claude/commands/`. Entonces sí aparecen en el autocompletado al escribir `/`.
Ver [«Convertirlos en comandos reales»](#convertirlos-en-comandos-reales-de-claude-code).

**Regla de oro:** el comando fija el *formato y el rol*; tú aportas el *contenido y la meta*.
`/review` a secas da una revisión genérica. `/review este endpoint, me preocupa la concurrencia`
da una útil.

---

## Los 12 que más vas a usar

Si solo memorizas doce, que sean estos.

| Comando | Para cuándo |
|---|---|
| ★ `/brief` | Sabes que la respuesta es corta y no quieres tres párrafos de contexto. |
| ★ `/godmode` | Lo contrario: quieres el tratamiento exhaustivo, sin recortes. |
| ★ `/critique` | Ya tienes algo hecho y necesitas que alguien lo rompa antes que el mundo. |
| ★ `/compare` | Dos o más opciones y una decisión pendiente. |
| ★ `/plan` | Sabes el objetivo, no el camino. |
| ★ `/debug` | Algo falla y las hipótesis se agotaron. |
| ★ `/review` | Código o texto listo, antes de enviarlo. |
| ★ `/teacher` | Tema nuevo, quieres entenderlo, no solo resolverlo. |
| ★ `/scout` | Antes de comprometerte: qué puede salir mal que no estás viendo. |
| ★ `/rewrite` | El fondo está bien, la forma no. |
| `/ask` | Petición ambigua: que Claude pregunte antes de responder. |
| `/nofluff` | Elimina preámbulos, disculpas y resúmenes de lo que acabas de decir. |

---

## 1. Claridad y formato de la respuesta

Controlan *cómo* se te responde, no *qué*.

| Comando | Qué hace |
|---|---|
| ★ `/explainlikeim5` | Explica con lenguaje y analogías de niño de 5 años. Cero jerga. |
| ★ `/brief` | La respuesta más corta que siga siendo correcta. |
| ★ `/summary` | Resume el contenido conservando las ideas que cambian decisiones. |
| ★ `/simplify` | Traduce contenido complejo a lenguaje llano sin perder precisión. |
| ★ `/godmode` | Respuesta máxima: profundidad, casos límite, contexto, alternativas. |
| `/eli-pro` | Lo contrario de `/explainlikeim5`: explica asumiendo que eres experto. |
| `/tldr` | Una sola frase con la conclusión, antes que cualquier detalle. |
| `/bullets` | Convierte la respuesta en viñetas escaneables. |
| `/table` | Formatea como tabla comparativa. |
| `/steps` | Numera en pasos ejecutables, uno por línea, sin prosa. |
| `/analogy` | Explica mediante una analogía con algo que ya conoces. |
| `/glossary` | Define los términos técnicos que aparezcan, al final. |
| `/diagram` | Describe la estructura como diagrama (Mermaid o ASCII). |
| `/nofluff` | Sin preámbulo, sin disculpas, sin recapitular la pregunta. |
| `/depth 1-5` | Fija el nivel de profundidad. `1` = tuit, `5` = informe. |
| `/audience X` | Adapta el registro al lector: `/audience mi jefe no técnico`. |

**Ejemplo:**
```
/simplify /audience inversores
Este párrafo del pitch deck: "Aprovechamos embeddings vectoriales para
recuperación semántica sobre un corpus indexado en HNSW..."
```

---

## 2. Pensamiento crítico y decisiones

Donde Claude deja de darte la razón.

| Comando | Qué hace |
|---|---|
| ★ `/compare` | Compara opciones lado a lado, con criterios explícitos. |
| ★ `/critique` | Encuentra debilidades y propone mejoras concretas. |
| ★ `/devil` | Argumenta la postura contraria con la máxima fuerza posible. |
| ★ `/debate` | Presenta ambos lados de forma equilibrada y nombra el desacuerdo real. |
| ★ `/scout` | Riesgos, puntos ciegos y casos límite que no estás considerando. |
| `/steelman` | Construye la versión *más fuerte* del argumento con el que no estás de acuerdo. |
| `/redteam` | Ataca activamente el plan como lo haría un adversario. |
| `/premortem` | «Es dentro de seis meses y esto fracasó. ¿Qué pasó?» |
| `/assumptions` | Lista los supuestos no dichos de los que depende todo. |
| `/tradeoffs` | Qué se gana y qué se pierde en cada opción, sin recomendar. |
| `/decide` | Lo contrario: toma una decisión y defiéndela. Nada de «depende». |
| `/firstprinciples` | Desmonta el problema hasta sus fundamentos y reconstruye. |
| `/rank` | Ordena las opciones por un criterio y justifica el orden. |
| `/estimate` | Estimación con orden de magnitud y el razonamiento visible. |
| `/confidence` | Añade nivel de certeza a cada afirmación y di qué te haría cambiar. |
| `/whatwouldchange` | Qué evidencia haría que la conclusión se invirtiera. |

**Ejemplo:**
```
/premortem /scout
Lanzamos la app de inglés en enero solo con iOS y sin modo offline.
```

---

## 3. Aprendizaje y mentoría

| Comando | Qué hace |
|---|---|
| ★ `/teacher` | Enseña paso a paso, comprobando comprensión antes de avanzar. |
| ★ `/mentor` | Guía como un experto sénior: contexto, criterio y qué priorizar. |
| ★ `/coach` | Se centra en mejorar tu rendimiento, no en darte la respuesta. |
| ★ `/roadmap` | Ruta de aprendizaje ordenada, con hitos y tiempos realistas. |
| `/socratic` | Solo preguntas. Te lleva a la respuesta sin dártela. |
| `/feynman` | Te pide que lo expliques tú y corrige los huecos que aparezcan. |
| `/quiz` | Genera preguntas de repaso con respuestas al final. |
| `/flashcards` | Convierte el material en tarjetas pregunta/respuesta. |
| `/drill` | Ejercicios repetitivos y progresivos sobre un punto débil concreto. |
| `/prereqs` | Qué necesitas saber *antes* de este tema, en orden. |
| `/examples` | Tres ejemplos: trivial, realista y caso límite. |
| `/misconceptions` | Los errores que casi todo el mundo comete con este tema. |
| `/practice` | Un problema práctico para resolver ahora, con pista escalonada. |

**Ejemplo:**
```
/teacher /prereqs
Quiero entender cómo funciona la repetición espaciada SM-2 para implementarla.
```

---

## 4. Escritura y contenido

| Comando | Qué hace |
|---|---|
| ★ `/ghost` | Reescribe para que suene humano: menos simetría, más voz. |
| ★ `/10x` | Mejora la escritura de forma sustancial, no cosmética. |
| ★ `/rewrite` | Reescribe conservando el significado y cambiando la forma. |
| `/tone X` | Ajusta el tono: `/tone cercano pero profesional`. |
| `/shorten 50%` | Recorta al porcentaje indicado sin perder lo esencial. |
| `/expand` | Desarrolla lo que está demasiado comprimido. |
| `/hook` | Cinco primeras frases alternativas que hagan seguir leyendo. |
| `/headline` | Diez titulares, de más sobrio a más agresivo. |
| `/story` | Reescribe como narrativa: tensión, giro, resolución. |
| `/proofread` | Solo ortografía, gramática y puntuación. No toca el estilo. |
| `/voice` | Imita mi voz a partir de las muestras que te pase. |
| `/translate X` | Traduce a X preservando registro e intención. |
| `/localize X` | Adapta culturalmente, no solo lingüísticamente. |
| `/cutthefat` | Elimina adverbios, muletillas y frases que no aportan. |
| `/activevoice` | Pasa todo a voz activa y sujetos concretos. |

**Ejemplo:**
```
/ghost /cutthefat
[pega el texto que suena a IA]
```

---

## 5. Negocio, producto y estrategia

| Comando | Qué hace |
|---|---|
| ★ `/pitch` | Propuesta breve de negocio o cliente, lista para enviar. |
| ★ `/startup` | Piensa como fundador: velocidad, foco, coste de oportunidad. |
| ★ `/pm` | Piensa como Product Manager: problema, usuario, métrica, alcance. |
| ★ `/cto` | Piensa como CTO: arquitectura, equipo, deuda técnica, coste. |
| ★ `/analyst` | Analiza datos o situaciones y extrae la implicación, no solo el dato. |
| `/prd` | Documento de requisitos: problema, usuarios, alcance, éxito, fuera de alcance. |
| `/userstory` | Historias de usuario con criterios de aceptación. |
| `/persona` | Perfil de usuario con motivaciones, fricciones y objeciones. |
| `/jtbd` | Reformula como «trabajo por hacer» en lugar de funcionalidad. |
| `/okr` | Objetivos y resultados clave medibles para el periodo. |
| `/metrics` | Qué medir, cómo, y cuál es la métrica que puede engañarte. |
| `/pricing` | Modelos de precio con lógica de valor, no de coste. |
| `/gtm` | Plan de salida al mercado: canal, mensaje, primeros 100 usuarios. |
| `/swot` | Fortalezas, debilidades, oportunidades y amenazas. |
| `/businessmodel` | Cómo entra el dinero, de quién y por qué se queda. |
| `/competitor` | Análisis competitivo y el hueco que nadie ocupa. |
| `/email` | Redacta el correo: asunto, cuerpo breve y petición clara. |
| `/followup` | Seguimiento educado que no suena a súplica. |
| `/objections` | Qué te van a objetar y cómo responder a cada cosa. |

**Ejemplo:**
```
/pm /metrics
Función propuesta: rachas con congelación de días en la app de idiomas.
```

---

## 6. Planeación y ejecución

| Comando | Qué hace |
|---|---|
| ★ `/plan` | Plan de acción con fases, dependencias y criterio de «hecho». |
| `/breakdown` | Descompone en tareas de menos de un día cada una. |
| `/checklist` | Lista de verificación marcable, sin explicaciones. |
| `/timeline` | Calendario realista con hitos y holgura. |
| `/nextaction` | Una sola cosa: la siguiente acción concreta. |
| `/unblock` | Estoy atascado: tres caminos para desatascarme ahora. |
| `/scope` | Qué queda dentro y, sobre todo, qué queda fuera. |
| `/mvp` | La versión mínima que ya entrega valor real. |
| `/retro` | Qué funcionó, qué no, qué cambiamos la próxima vez. |
| `/delegate` | Qué de esto puede hacer otra persona y con qué instrucciones. |
| `/automate` | Qué parte de esto no debería seguir haciéndose a mano. |

---

## 7. Ingeniería · código

| Comando | Qué hace |
|---|---|
| ★ `/debug` | Encuentra errores o fallos, con hipótesis ordenada por probabilidad. |
| ★ `/review` | Revisa código o contenido y señala lo que importa, no lo trivial. |
| ★ `/senior` | Revisa como ingeniero sénior: mantenibilidad, no solo corrección. |
| ★ `/optimize` | Mejora eficiencia o rendimiento, midiendo antes de tocar. |
| ★ `/performance` | Foco exclusivo en latencia, memoria y coste. |
| ★ `/security` | Foco exclusivo en seguridad: entrada, autenticación, secretos, permisos. |
| `/refactor` | Reestructura sin cambiar comportamiento, paso a paso. |
| `/test` | Genera pruebas, empezando por los casos límite. |
| `/explaincode` | Explica qué hace este código y por qué está escrito así. |
| `/trace` | Sigue el flujo de ejecución con un ejemplo de entrada concreto. |
| `/rootcause` | No parches el síntoma: encuentra la causa. |
| `/regex` | Construye la expresión regular y explica cada parte. |
| `/typesafe` | Endurece los tipos y elimina los `any` que ocultan bugs. |
| `/errors` | Revisa el manejo de errores y qué pasa cuando cada cosa falla. |
| `/logs` | Qué registrar, en qué nivel y con qué contexto útil. |
| `/docstring` | Documenta funciones y módulos en el estilo del repositorio. |
| `/commit` | Mensaje de commit claro: qué cambió y por qué. |
| `/pr` | Descripción de pull request: contexto, cambios, cómo probarlo. |
| `/migrate` | Plan de migración reversible, por fases, sin ventana de caída. |
| `/deps` | Revisa dependencias: peso, mantenimiento, alternativas. |
| `/cleanup` | Código muerto, duplicado y abstracciones que ya no pagan su coste. |

**Ejemplo:**
```
/debug /rootcause
Los repasos offline se duplican al reconectar. Adjunto el reconciliador:
[código]
```

---

## 8. Ingeniería · diseño de sistemas

| Comando | Qué hace |
|---|---|
| ★ `/architect` | Diseña la arquitectura del sistema con sus contrapartidas explícitas. |
| ★ `/systemdesign` | Diseño completo tipo entrevista: escala, datos, fallos, cuellos de botella. |
| ★ `/api` | Diseña la API: recursos, verbos, errores, versionado, paginación. |
| ★ `/sql` | Genera y explica consultas SQL, con atención al plan de ejecución. |
| ★ `/frontend` | Foco en frontend: estado, rendimiento percibido, accesibilidad. |
| ★ `/backend` | Foco en backend: datos, concurrencia, idempotencia, límites. |
| ★ `/fullstack` | Solución integral de principio a fin, con las costuras resueltas. |
| `/schema` | Modelo de datos con índices, invariantes y qué se normaliza. |
| `/scale` | Qué se rompe primero al multiplicar por 10, por 100, por 1000. |
| `/caching` | Qué cachear, dónde, y cómo se invalida sin volverse loco. |
| `/queue` | Trabajo asíncrono: reintentos, idempotencia, cola de fallidos. |
| `/observability` | Métricas, trazas y alertas que sí se accionan. |
| `/threatmodel` | Modelo de amenazas: quién ataca, qué busca, por dónde entra. |
| `/adr` | Registro de decisión de arquitectura: contexto, opciones, decisión, consecuencias. |
| `/costs` | Coste de infraestructura de este diseño y dónde se dispara. |
| `/failuremodes` | Qué pasa cuando cada componente cae, uno por uno. |

---

## 9. Carrera profesional

| Comando | Qué hace |
|---|---|
| ★ `/interviewer` | Actúa como entrevistador y me evalúa en tiempo real. |
| ★ `/interview` | Genera preguntas de entrevista sobre el tema o el puesto. |
| ★ `/resume` | Mejora el currículum: logros medibles, no responsabilidades. |
| ★ `/linkedin` | Crea contenido para LinkedIn con voz propia. |
| `/mockinterview` | Simulacro completo con feedback al final, no durante. |
| `/starmethod` | Reescribe mi experiencia en formato Situación-Tarea-Acción-Resultado. |
| `/coverletter` | Carta de presentación breve y específica del puesto. |
| `/negotiate` | Guion de negociación salarial con argumentos y suelo claro. |
| `/brag` | Documento de logros para la revisión de desempeño. |
| `/networking` | Mensaje de contacto en frío que no da vergüenza enviar. |
| `/portfolio` | Cómo presentar este proyecto para que se entienda su dificultad. |
| `/jobfit` | Qué tan bien encajo con esta oferta y qué hueco debo tapar. |

---

## 10. Contenido y redes sociales

| Comando | Qué hace |
|---|---|
| ★ `/reel` | Guion para Reel de Instagram: gancho, desarrollo, cierre. |
| ★ `/carousel` | Contenido para carrusel: una idea por diapositiva. |
| `/thread` | Hilo para X/Twitter con un argumento que avanza. |
| `/caption` | Pie de foto con gancho y llamada a la acción. |
| `/youtube` | Guion de vídeo largo con estructura de retención. |
| `/newsletter` | Edición de boletín: una idea, un ejemplo, una acción. |
| `/blog` | Artículo con estructura, ejemplos y sin relleno SEO. |
| `/seo` | Optimiza para búsqueda sin sacrificar legibilidad. |
| `/repurpose` | Convierte esta pieza en cinco formatos distintos. |
| `/calendar` | Calendario de contenido para las próximas semanas. |
| `/cta` | Cinco llamadas a la acción alternativas. |

---

## 11. Investigación y datos

| Comando | Qué hace |
|---|---|
| ★ `/research` | Profundiza en el tema: estado actual, consenso y disputa. |
| `/sources` | Añade fuentes verificables y di cuáles son débiles. |
| `/factcheck` | Verifica las afirmaciones y marca las que no puedas sostener. |
| `/literature` | Panorama de lo publicado y quién dice qué. |
| `/data` | Analiza este conjunto de datos y dime qué es señal y qué es ruido. |
| `/dataviz` | Qué gráfico usar para estos datos y por qué. |
| `/clean` | Detecta problemas de calidad en los datos antes de analizarlos. |
| `/stats` | Qué prueba estadística aplica y qué supuestos exige. |
| `/survey` | Diseña una encuesta sin preguntas sesgadas. |

---

## 12. Meta: controlar la conversación

Los más infravalorados. Actúan sobre Claude, no sobre el tema.

| Comando | Qué hace |
|---|---|
| `/ask` | Antes de responder, hazme las preguntas que te faltan. |
| `/assume` | No preguntes: asume lo razonable, dilo, y sigue. |
| `/why` | Explica el razonamiento que te llevó a esa respuesta. |
| `/again` | Misma pregunta, enfoque completamente distinto. |
| `/verify` | Revisa tu propia respuesta anterior buscando errores. |
| `/context` | Resume lo que has entendido de la conversación hasta ahora. |
| `/checkpoint` | Guarda el estado actual en un resumen que pueda retomar luego. |
| `/continue` | Sigue exactamente donde lo dejaste, sin repetir. |
| `/format json` | Devuelve solo JSON válido, sin texto alrededor. |
| `/noagree` | No valides mi idea por cortesía. Si está mal, dilo. |
| `/limits` | Qué no puedes saber o hacer sobre esto. |

**Ejemplo:**
```
/ask
Quiero rediseñar el onboarding de la app.
```
→ Claude pregunta por métricas actuales, público y restricciones antes de proponer nada.

---

## Combinar comandos

Los comandos se apilan. El orden importa poco; la coherencia mucho.

| Combinación | Resultado |
|---|---|
| `/brief /decide` | Una recomendación, dos líneas, sin «depende». |
| `/godmode /senior /security` | Auditoría técnica exhaustiva con criterio sénior. |
| `/teacher /examples /quiz` | Clase completa: explicación, ejemplos y examen. |
| `/critique /steelman` | Primero destruye tu idea, luego defiéndela mejor que tú. |
| `/pm /prd /scope` | Documento de producto con el fuera-de-alcance explícito. |
| `/ghost /cutthefat /tone cercano` | Texto que no suena a IA. |
| `/plan /premortem` | Plan y, acto seguido, por qué va a fallar. |

**Lo que no funciona:** combinaciones contradictorias (`/brief /godmode`,
`/explainlikeim5 /eli-pro`). Claude elegirá una y la otra se pierde.

---

## Diccionario mínimo

Para pegar al inicio de un chat o en las instrucciones de un Proyecto.
Recorta los que no uses.

```
Cuando un mensaje empiece con uno o más de estos comandos, aplícalos al contenido
que le sigue. Si se combinan, aplícalos todos. Si se contradicen, dime cuál ignoras.

FORMATO
/brief respuesta mínima correcta · /godmode máxima profundidad
/tldr una frase · /bullets viñetas · /table tabla · /steps pasos numerados
/nofluff sin preámbulo ni recapitulación · /explainlikeim5 lenguaje de 5 años
/simplify llano sin perder precisión · /audience X adapta el registro a X

CRITERIO
/critique debilidades y mejoras · /devil postura contraria · /steelman su mejor versión
/scout riesgos y casos límite · /premortem fracasó: por qué · /redteam atácalo
/compare lado a lado · /tradeoffs qué se gana y se pierde · /decide recomienda y defiende
/assumptions supuestos ocultos · /confidence certeza por afirmación

TRABAJO
/plan fases y dependencias · /breakdown tareas de menos de un día · /checklist marcable
/debug hipótesis ordenadas · /rootcause causa no síntoma · /review lo que importa
/senior mantenibilidad · /security entrada, auth, secretos · /test empieza por casos límite
/architect contrapartidas explícitas · /api recursos, errores, versionado

ESCRITURA
/ghost suena humano · /rewrite misma idea otra forma · /10x mejora sustancial
/cutthefat sin relleno · /tone X · /shorten N% · /hook cinco aperturas

META
/ask pregunta antes de responder · /assume asume y dilo · /why muestra el razonamiento
/again otro enfoque · /verify revisa tu respuesta · /noagree no me des la razón por cortesía
```

---

## Convertirlos en comandos reales de Claude Code

En Claude Code, un archivo Markdown dentro de `.claude/commands/` se convierte en un slash
command de verdad: aparece al escribir `/` y se autocompleta.

- `.claude/commands/` → disponible para todo el que trabaje en el repositorio.
- `~/.claude/commands/` → personal, disponible en todos tus proyectos.

El nombre del archivo es el nombre del comando. `critique.md` → `/critique`.

**Formato:**

```markdown
---
description: Encuentra debilidades y propone mejoras concretas
argument-hint: [qué revisar]
---

Revisa lo siguiente con ojo crítico y sin cortesía innecesaria: $ARGUMENTS

Para cada debilidad: qué falla, por qué importa y qué harías en su lugar.
Ordena de mayor a menor impacto. Si algo está bien, no lo menciones.
```

El frontmatter admite además `allowed-tools` (limitar qué herramientas puede usar el comando)
y `model`. En el cuerpo, `$ARGUMENTS` recibe todo lo que escribas tras el comando, y `$1`,
`$2`… los argumentos posicionales.

**Generar varios de golpe:**

```bash
mkdir -p .claude/commands

crear() {  # crear <nombre> <descripción> <instrucción>
  cat > ".claude/commands/$1.md" <<EOF
---
description: $2
argument-hint: [contenido]
---

$3

Contenido: \$ARGUMENTS
EOF
}

crear brief    "Respuesta mínima correcta"     "Responde en el menor número de palabras posible sin perder exactitud. Sin preámbulo."
crear scout    "Riesgos y casos límite"        "Lista riesgos, puntos ciegos y casos límite, ordenados por probabilidad x impacto."
crear senior   "Revisión de ingeniero sénior"  "Revisa como ingeniero sénior: mantenibilidad, acoplamiento y qué dolerá en seis meses."
crear premortem "Análisis de fracaso previo"   "Es seis meses después y esto fracasó. Explica qué pasó y qué señal temprana lo avisaba."
```

Verifica con `/help` o escribiendo `/` en Claude Code.

---

## Cómo escribir un buen comando propio

Los comandos de esta lista funcionan porque cumplen cuatro cosas:

1. **Fijan un rol o un formato, no un tema.** `/senior` sirve para cualquier código;
   `/revisa-mi-api-de-pagos` solo sirve una vez.
2. **Dicen qué *no* hacer.** «Si algo está bien, no lo menciones» ahorra media respuesta.
3. **Imponen una estructura.** Ordenar por impacto, un ítem por línea, tres ejemplos.
4. **Caben en una frase.** Si necesitas un párrafo para definirlo, son dos comandos.

Si un comando te da resultados irregulares, casi siempre es porque falta el punto 2.

---

*Documento de referencia. Amplíalo: la lista útil es la que usas, no la que es completa.*
