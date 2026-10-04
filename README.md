# Speaking Exam (formato TOEIC® Speaking)

Un examen oral cronometrado, como el TOEIC Speaking: el reloj cuenta el tiempo para preparar, suena un beep, el
micrófono se enciende solo, graba hasta que se acaba el tiempo, se apaga y pasa a la pregunta siguiente. Cada
respuesta va a tu Google Drive y a una planilla donde ponés la nota.

## El examen

Cada estudiante es un **speaker** (1 a 14) y hace **solo su versión**: la del PowerPoint *Speaking Exam — 14 Versions*.

| Parte | Qué hace | Preparación | Respuesta |
| --- | --- | --- | --- |
| Questions 1–2 · Read a text aloud | Lee el texto en voz alta | 45 s | 45 s |
| Question 3 · Describe a picture | Describe la imagen | 30 s | 1 min |
| Questions 4–7 · Respond to questions | Escucha el contexto y cada pregunta, y responde después del beep | — | 1 min cada una |

Las consignas y las preguntas se oyen (voz del navegador) y se leen en pantalla. Son unos 9 minutos.

- **El reloj**: un anillo que se vacía; verde azulado mientras preparan, rojo mientras graba; ámbar en los últimos 10
  segundos y parpadea en los últimos 5.
- **El micrófono**: se pide una vez, en la prueba de micrófono antes de empezar. Después graba solo en cada *Response
  time* y se cierra al terminar el tiempo.
- **Nada se pierde**: cada grabación se guarda en el navegador y se envía enseguida; si se corta internet, se reintenta.
  Al final, el estudiante ve “✓ Sent” en cada respuesta, y puede descargarlas si no hay planilla conectada.
- **Si se recarga la página**, el examen sigue desde la pregunta que estaba respondiendo (la planilla lo cuenta en
  *Restarts*; también cuenta cuántas veces salió de la página).

## El código del examen (lo guarda tu script, no el estudiante)

El repositorio es público (GitHub Pages), así que **el examen está cifrado** (AES-256): las 14 versiones están en
`exam/v01.bin … v14.bin`. La clave **no está en el sitio ni en el repositorio**: la guarda tu Google Script, y la página
se la pide sola cuando el estudiante toca *Continue*. El estudiante solo escribe su nombre y elige su speaker.

- **Guardar el código (una vez):** en la planilla, menú **Speaking Exam → Guardar el código del examen** y pegá el código
  que te di (`SPK-…`). Queda guardado en las propiedades del script y el examen queda **abierto**.
- **Cerrar el examen** (nadie puede empezarlo) y **Abrir el examen**: en el mismo menú.

Para cambiar el código o el examen: `node scripts/build-exam.mjs "Speaking Exam.pptx" NUEVO-CODIGO` (lee el PowerPoint,
achica las imágenes y cifra cada versión) y después guardá el código nuevo en el menú.

## Instalación

1. **La planilla y el script.** Creá una planilla nueva (<https://sheets.new>) → **Extensiones → Apps Script** → borrá
   lo que haya → pegá [`google-apps-script/Code.gs`](google-apps-script/Code.gs) → guardá → elegí **`setup`** →
   **▶ Ejecutar** → aceptá los permisos. Crea las hojas *Exams*, *Responses* y *Rubric*, y la carpeta
   *Speaking Exam — Recordings* en tu Drive.
   > **¿El editor no te deja pegar todo el código?** Usá las 6 partes cortas de
   > [`google-apps-script/partes/`](google-apps-script/partes/): la **parte 1** va en `Código.gs` (reemplazando todo),
   > y cada una de las otras en un archivo nuevo (**＋ → Secuencia de comandos**, llamalo `parte2`, `parte3`…). Cada parte
   > empieza con `/* ── Speaking Exam · parte N de 6 ── */` y termina con `/* ── fin de la parte N de 6 ── */`: si no
   > ves esa última línea, se cortó al pegar. Después seguí igual (`setup`, implementar).
2. **Implementar → Nueva implementación → Aplicación web** · Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier
   persona** → copiá la URL que termina en `/exec`.
3. **Recargá la planilla** → menú **Speaking Exam → Guardar el código del examen** → pegá el código.
4. **En el examen**, abrí la página **Teacher** (`…/#teacher`): pegá la URL, *Test*, *Save*. Ahí están los links para
   los estudiantes (uno general y uno por speaker) y un link para probar el examen con relojes cortos.

### Qué guarda la planilla

| Hoja | Qué tiene |
| --- | --- |
| **Exams** | Una fila por estudiante: inicio, nombre, speaker, estado, respuestas, fin, veces que salió de la página, reinicios, **nota total** (suma automática) y la carpeta de sus audios |
| **Responses** | Una fila por respuesta: pregunta, enunciado, segundos, **▶ Listen** (el audio en tu Drive), **Score (0–3)** y *Comments* para que completes |
| **Rubric** | Criterios de 0 a 3 para cada parte, como guía para corregir |

Los audios quedan en *Speaking Exam — Recordings / grupo / nombre · Speaker N*.

## Probarlo

```bash
npm start     # http://localhost:8080 ( …/?demo=1 acorta los relojes al 10 %)
npm test
```

No hay dependencias ni build: HTML, CSS y JavaScript. Funciona en Chrome, Edge, Firefox y Safari (también en el
celular); conviene usar auriculares.
