/** What Daiku says when it opens: hello in a few languages, then a greeting for the time of day. */

/** Hello in widely spoken languages, each in its own script, with the language for screen readers. */
export const HELLOS: { word: string; lang: string }[] = [
  { word: "Hello", lang: "en" },
  { word: "Hola", lang: "es" },
  { word: "Bonjour", lang: "fr" },
  { word: "你好", lang: "zh" },
  { word: "नमस्ते", lang: "hi" },
  { word: "こんにちは", lang: "ja" },
  { word: "Olá", lang: "pt" },
];

/** The greeting for an hour of the day (0–23). */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Working late";
}

/** The greeting with the person's first name, when they've given one. */
export const greetingFor = (hour: number, name: string) => {
  const first = name.trim().split(/\s+/)[0];
  return first ? `${greeting(hour)}, ${first}` : greeting(hour);
};

/**
 * How long each part lasts, in ms. The first hello is drawn on, so it lingers; the others hold long
 * enough to read; the greeting holds; then the intro dissolves while the app settles in.
 */
export const HELLO_TIMING = { first: 2000, each: 640, greeting: 2100, fade: 1100 };

/** Total running time, for tests and for skipping. */
export const helloDuration = (count = HELLOS.length) => HELLO_TIMING.first + (count - 1) * HELLO_TIMING.each + HELLO_TIMING.greeting + HELLO_TIMING.fade;
