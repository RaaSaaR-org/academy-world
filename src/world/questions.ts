import type { ZoneContext } from '@/core/zones';

/**
 * The nine vendor questions (GDD Appendix C, verbatim from EmAI's public checklist).
 * Registered once by the island module; zones only call ctx.pass.awardQuestion(n).
 * "why" = one line on why the question matters (generic, public-safe).
 */
export function registerQuestions(ctx: ZoneContext): void {
  const Q: [number, { de: string; en: string }, { de: string; en: string }][] = [
    [1, { de: 'Wie ist Erfolg als Regel definiert?', en: 'How is success defined, as a rule?' }, { de: 'Ohne feste Regel lässt sich jedes Ergebnis als Erfolg erzählen.', en: 'Without a fixed rule, any result can be told as a success.' }],
    [2, { de: 'Wie viele Versuche?', en: 'How many trials?' }, { de: 'Eine Quote ohne n ist eine Anekdote.', en: 'A rate without n is an anecdote.' }],
    [3, { de: 'Lässt sich der beste Lauf wiederholen?', en: 'Can the best run be repeated?' }, { de: 'Ein Video zeigt den besten von vielen Läufen, nicht den typischen.', en: 'A video shows the best of many runs, not the typical one.' }],
    [4, { de: 'Was wurde vorher erwartet?', en: 'What was expected beforehand?' }, { de: 'Erst die Erwartung festlegen, dann messen – sonst passt man das Ziel an.', en: 'Fix the expectation first, then measure – or the target moves.' }],
    [5, { de: 'Wie viele Objektlagen?', en: 'How many object poses?' }, { de: 'Greifen gelingt in geübten Lagen; neue Lagen zeigen die echte Quote.', en: 'Grasps succeed in practised poses; new poses show the real rate.' }],
    [6, { de: 'Welche Lizenz haben die Gewichte?', en: 'What is the licence of the weights?' }, { de: 'Wer die Gewichte nicht nutzen darf, kann nicht nachtrainieren.', en: "If you can’t use the weights, you can’t retrain." }],
    [7, { de: 'Wann endet ein Lauf?', en: 'When does a run end?' }, { de: 'Wer das Ende frei wählt, stoppt vor dem Fehler.', en: 'Whoever picks the end freely stops before the failure.' }],
    [8, { de: 'Gleiche Eingaben im Betrieb wie im Training?', en: 'Same inputs in operation as in training?' }, { de: 'Andere Kamera, anderes Licht – andere Policy.', en: 'Different camera, different light – different policy.' }],
    [9, { de: 'Was ist das Ergebnis in einer zweiten Umgebung?', en: 'What is the result in a second environment?' }, { de: 'Die erste Umgebung ist meist die, in der optimiert wurde.', en: 'The first environment is usually the one that was optimised for.' }],
  ];
  for (const [n, text, why] of Q) ctx.pass.registerQuestion(n, text, why);
}
