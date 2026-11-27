/**
 * Wording for the client Calm page (/client/calm), in English and Spanish. Original wording written for this app,
 * in plain language (grades 6-8), based on the app's own breathing, grounding and muscle-relaxation handouts.
 * Spanish: machine-assisted translation of the app's English, PENDING review by a fluent clinician.
 * No diagnosis names, codes or scores (G3).
 */
import type { Text } from "@/lib/i18n/core";

export const CALM = {
  eyebrow: { en: "Self-help", es: "Autoayuda" },
  title: { en: "Calm your body", es: "Calme su cuerpo" },
  intro: {
    en: "Short exercises to help you slow down. Pick one and follow along. You do not need to type anything.",
    es: "Ejercicios cortos para ayudarle a ir más despacio. Elija uno y sígalo. No necesita escribir nada.",
  },
  helpNow: { en: "Need help right now?", es: "¿Necesita ayuda ahora mismo?" },
  choose: { en: "Choose an exercise", es: "Elija un ejercicio" },
  tabBreathe: { en: "Breathe", es: "Respirar" },
  tabGround: { en: "Ground", es: "Anclarse" },
  tabRelax: { en: "Relax", es: "Relajarse" },
  start: { en: "Start", es: "Empezar" },
  stop: { en: "Stop", es: "Parar" },
  pause: { en: "Pause", es: "Pausa" },
  resume: { en: "Resume", es: "Seguir" },
  next: { en: "Next", es: "Siguiente" },
  back: { en: "Back", es: "Atrás" },
  again: { en: "Start again", es: "Empezar de nuevo" },
  sourcesTitle: { en: "Where this comes from", es: "De dónde viene esta información" },
  sourcesNote: {
    en: "These exercises were written for this app, based on information from:",
    es: "Estos ejercicios se escribieron para esta aplicación, con base en información de:",
  },
  /** Shown only in Spanish. */
  translationNote: {
    en: "Translated with the help of a tool; waiting for review by a person.",
    es: "Traducción hecha con ayuda de una herramienta; pendiente de revisión por una persona.",
  },
} satisfies Record<string, Text>;

export const BREATHE = {
  title: { en: "Slow breathing", es: "Respiración lenta" },
  why: {
    en: "Breathing out a little longer than you breathe in helps your body settle. Sit or lie down, drop your shoulders and follow the circle.",
    es: "Soltar el aire un poco más despacio de lo que lo toma ayuda a que su cuerpo se calme. Siéntese o acuéstese, baje los hombros y siga el círculo.",
  },
  whyReduced: {
    en: "Breathing out a little longer than you breathe in helps your body settle. Sit or lie down, drop your shoulders and follow the count.",
    es: "Soltar el aire un poco más despacio de lo que lo toma ayuda a que su cuerpo se calme. Siéntese o acuéstese, baje los hombros y siga la cuenta.",
  },
  pace: { en: "Pace", es: "Ritmo" },
  paceHint: {
    en: "Seconds in, then seconds out. Start shorter if a longer count feels hard.",
    es: "Segundos para tomar aire y luego para soltarlo. Empiece con menos si una cuenta larga le cuesta.",
  },
  paceOption: { en: "{in} in, {out} out", es: "{in} entra, {out} sale" },
  breatheIn: { en: "Breathe in", es: "Tome aire" },
  breatheOut: { en: "Breathe out", es: "Suelte el aire" },
  ready: { en: "Press Start when you are ready", es: "Pulse Empezar cuando esté listo o lista" },
  breaths: { en: "Breaths: {n}", es: "Respiraciones: {n}" },
  fiveMinutes: {
    en: "That is about 5 minutes. You can keep going or stop whenever you like.",
    es: "Ya van unos 5 minutos. Puede seguir o parar cuando quiera.",
  },
  safety: {
    en: "Breathe gently. If you feel dizzy or tingly, stop and breathe normally for a minute.",
    es: "Respire con suavidad. Si se siente mareado o con hormigueo, pare y respire normal por un minuto.",
  },
} satisfies Record<string, Text>;

export const GROUND = {
  title: { en: "5-4-3-2-1 grounding", es: "Anclaje 5-4-3-2-1" },
  why: {
    en: "Use your senses to bring your mind back to here and now. Keep your eyes open, put your feet on the floor and go slowly.",
    es: "Use sus sentidos para traer su mente al aquí y ahora. Mantenga los ojos abiertos, ponga los pies en el suelo y vaya despacio.",
  },
  stepOf: { en: "Step {n} of {total}", es: "Paso {n} de {total}" },
  doneTitle: { en: "Check in with yourself", es: "Revise cómo se siente" },
  done: {
    en: "Say where you are right now. Notice how you feel. If you still feel far away, you can go through the steps again.",
    es: "Diga dónde está ahora mismo. Note cómo se siente. Si todavía se siente lejos, puede repetir los pasos.",
  },
  skip: {
    en: "If one of your senses does not work well for you, skip it and use the others.",
    es: "Si alguno de sus sentidos no le funciona bien, sáltelo y use los demás.",
  },
} satisfies Record<string, Text>;

export const GROUND_STEPS: readonly { count: number; title: Text; body: Text }[] = [
  {
    count: 5,
    title: { en: "Look", es: "Mire" },
    body: { en: "Name 5 things you can see, like a cup, a window or your shoe.", es: "Nombre 5 cosas que puede ver, como una taza, una ventana o su zapato." },
  },
  {
    count: 4,
    title: { en: "Touch", es: "Toque" },
    body: { en: "Name 4 things you can feel, like your chair, your clothes or the floor.", es: "Nombre 4 cosas que puede sentir, como su silla, su ropa o el suelo." },
  },
  {
    count: 3,
    title: { en: "Listen", es: "Escuche" },
    body: { en: "Name 3 things you can hear, like a fan, a car outside or your own breathing.", es: "Nombre 3 cosas que puede oír, como un ventilador, un carro afuera o su propia respiración." },
  },
  {
    count: 2,
    title: { en: "Smell", es: "Huela" },
    body: { en: "Name 2 things you can smell. If you cannot smell anything, name 2 smells you like.", es: "Nombre 2 cosas que puede oler. Si no huele nada, nombre 2 olores que le gusten." },
  },
  {
    count: 1,
    title: { en: "Taste", es: "Saboree" },
    body: { en: "Name 1 thing you can taste. You can take a sip of water, or think of a food you like.", es: "Nombre 1 cosa que puede saborear. Puede tomar un sorbo de agua o pensar en una comida que le guste." },
  },
];

export const RELAX = {
  title: { en: "Short muscle relaxation", es: "Relajación muscular corta" },
  why: {
    en: "Tighten one part of your body for a few seconds, then let it go. Notice the difference between tight and loose. It takes about 2 minutes.",
    es: "Apriete una parte del cuerpo por unos segundos y luego suéltela. Note la diferencia entre apretado y suelto. Toma unos 2 minutos.",
  },
  tighten: { en: "Tighten", es: "Apriete" },
  letGo: { en: "Let go", es: "Suelte" },
  groupOf: { en: "Part {n} of {total}", es: "Parte {n} de {total}" },
  doneTitle: { en: "All done", es: "Terminó" },
  done: {
    en: "Sit quietly for a moment and breathe slowly. Wiggle your fingers and toes, then stand up slowly.",
    es: "Quédese sentado o sentada un momento y respire despacio. Mueva los dedos de las manos y los pies, y luego levántese despacio.",
  },
  safety: {
    en: "Squeeze gently, never hard enough to hurt. Skip any part of your body that is injured or sore.",
    es: "Apriete con suavidad, nunca tanto que duela. Sáltese cualquier parte del cuerpo que tenga lastimada o adolorida.",
  },
} satisfies Record<string, Text>;

export const TIGHTEN_SECONDS = 5;
export const RELEASE_SECONDS = 10;

export const RELAX_GROUPS: readonly { name: Text; tighten: Text; release: Text }[] = [
  {
    name: { en: "Hands", es: "Manos" },
    tighten: { en: "Make a fist with both hands and squeeze.", es: "Cierre las dos manos en un puño y apriete." },
    release: { en: "Open your hands and let them rest.", es: "Abra las manos y déjelas descansar." },
  },
  {
    name: { en: "Arms", es: "Brazos" },
    tighten: { en: "Bend your elbows and tighten your upper arms.", es: "Doble los codos y apriete la parte de arriba de los brazos." },
    release: { en: "Let your arms drop and go loose.", es: "Deje caer los brazos y aflójelos." },
  },
  {
    name: { en: "Shoulders", es: "Hombros" },
    tighten: { en: "Lift your shoulders up toward your ears.", es: "Suba los hombros hacia las orejas." },
    release: { en: "Let them drop. Notice how heavy they feel.", es: "Déjelos caer. Note qué pesados se sienten." },
  },
  {
    name: { en: "Face", es: "Cara" },
    tighten: { en: "Shut your eyes tight and press your lips together.", es: "Cierre los ojos con fuerza y apriete los labios." },
    release: { en: "Let your face go soft and your jaw hang loose.", es: "Deje la cara suave y la mandíbula floja." },
  },
  {
    name: { en: "Belly", es: "Abdomen" },
    tighten: { en: "Pull your belly in tight.", es: "Meta el abdomen y apriételo." },
    release: { en: "Let go and let your breathing be easy.", es: "Suelte y deje que su respiración fluya." },
  },
  {
    name: { en: "Legs and feet", es: "Piernas y pies" },
    tighten: { en: "Press your knees together and pull your toes up toward you.", es: "Junte las rodillas y jale los dedos de los pies hacia usted." },
    release: { en: "Let your legs and feet go loose.", es: "Deje las piernas y los pies flojos." },
  },
];

export const BREATH_PACES = [
  { id: "2-3", inhale: 2, exhale: 3 },
  { id: "3-4", inhale: 3, exhale: 4 },
  { id: "4-6", inhale: 4, exhale: 6 },
  { id: "5-7", inhale: 5, exhale: 7 },
] as const;
export type BreathPaceId = (typeof BREATH_PACES)[number]["id"];
export const DEFAULT_PACE: BreathPaceId = "4-6";
