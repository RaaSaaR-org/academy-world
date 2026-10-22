/**
 * Info cards for the three stations, the Entscheider Befundkarte (R1 §10.5) and the side panel „Was
 * kostet ein Skill?“. Mode-aware: the base content is the Entdecker card, the `entscheider` override
 * swaps in the consequence and the „Für Entscheider“ box. Both say "du".
 *
 * Numbers: the card prose writes them out („dreißigmal“), because a card cannot carry a source chip
 * next to a figure (text-audit --chips); figures with a chip live in the console and in the diagrams.
 * Sources of the real-world lines (R1 §13, accessed 2026-10-17):
 *   - DROID dataset: Khazatsky et al. 2024, arXiv 2403.12945 (S33) — fifty collectors, twelve months.
 *   - SmolVLA: Shukor et al. 2025, arXiv 2506.01844 (S19) — SO-101, known 90 %, new poses 50 %, n not stated.
 *   - SO-101 benchmark: Yu & Qiu 2026, arXiv 2606.08881 (S29) — colour sorting 0–10 %, 100 demos, 20 trials.
 *   - Licences of weights: π0 / π0.5 model cards (Gemma terms), Isaac-GR00T README (NVIDIA Open Model
 *     License) (S24, S26, S27).
 *   - No-op first actions froze policies: Kim et al. 2024 (OpenVLA), arXiv 2406.09246, BridgeData V2 appendix.
 *   - Dataset quality advice: LeRobot docs (S9) and the Hugging Face blog on community datasets (S35).
 */
import type { InfoCardSpec, ZoneContext } from '@/core/zones';
import { css } from '@/core/zones';
import { LAYOUT } from './tuning';

export interface CardData {
  /** the last demo's jaw path on the bench (x, z pairs), or null */
  lastPath: Float32Array | null;
  demos: number;
  fields: number;
}

const MONO = '11px "Geist Mono", monospace';

export function cardA(ctx: ZoneContext, d: CardData): InfoCardSpec {
  return {
    eyebrow: { de: '// 04 · A · VORMACHEN', en: '// 04 · A · DEMONSTRATE' },
    title: { de: 'Vormachen statt programmieren', en: 'Demonstrate instead of programming' },
    body: {
      de: 'Du führst den **Leitarm**, der **Folgearm** macht mit. Jede Demo speichert, wie der Arm stand und was du befohlen hast – wie LeRobots Aufnahme.',
      en: 'You guide the **leader arm**, the **follower** copies. Every demo stores how the arm stood and what you commanded, like LeRobot’s recording.',
    },
    bullets: [
      { de: '**Zustand:** die sechs Gelenke des Folgearms, dreißigmal pro Sekunde.', en: '**State:** the follower’s six joints, thirty times a second.' },
      { de: '**Aktion:** die Gelenke des Leitarms im selben Moment.', en: '**Action:** the leader’s joints at the same moment.' },
      { de: '**Verschiedene Startfelder** bringen mehr als viele gleiche Demos.', en: '**Different start fields** teach more than many identical demos.' },
      { de: 'Der Leitarm ist leichtgängig übersetzt, damit du ihn mit der Hand führen kannst.', en: 'The leader is geared to move easily, so you can guide it by hand.' },
    ],
    entscheider: {
      body: {
        de: 'Demonstrationen sind der Rohstoff. Der Engpass ist die **Zeit der Menschen, die vormachen** – und wie verschieden ihre Demos sind.',
        en: 'Demonstrations are the raw material. The bottleneck is the **time of the people demonstrating**, and how varied their demos are.',
      },
      bullets: [{ de: '**Demo** = Zustand und Aktion, dreißigmal pro Sekunde.', en: '**Demo** = state and action, thirty times a second.' }],
      forDecisionMakers: {
        bullets: [
          { de: 'Frag: Wie viele Demos je Aufgabe, an wie vielen Startlagen, und wer macht sie vor?', en: 'Ask: how many demos per task, at how many start poses, and who records them?' },
          { de: 'Zum Maßstab: Für einen offenen Forschungsdatensatz sammelten fünfzig Menschen ein Jahr lang Demos (Khazatsky und andere, DROID).', en: 'For scale: for one open research dataset, fifty people collected demos for a year (Khazatsky and others, DROID).' },
        ],
      },
    },
    diagram: {
      aspect: 16 / 9,
      animate: true,
      caption: d.lastPath
        ? { de: 'Deine letzte Demo von oben: der Weg der Greiferspitze von einem Startfeld in die Kiste.', en: 'Your last demo from above: the jaw tip’s path from a start field into the box.' }
        : { de: 'Die fünf Startfelder und die Kiste, von oben.', en: 'The five start fields and the box, from above.' },
      draw(g, w, h, t) {
        g.fillStyle = '#141414';
        g.fillRect(0, 0, w, h);
        // the work field, 0.6 × 0.34 m around the fields and the box
        const x0 = -0.2,
          x1 = 0.4,
          z0 = -0.3,
          z1 = 0.05;
        const s = Math.min((w - 30) / (x1 - x0), (h - 30) / (z1 - z0));
        const X = (x: number): number => 15 + (x - x0) * s,
          Y = (z: number): number => 15 + (z - z0) * s;
        g.strokeStyle = css.textMuted;
        g.lineWidth = 1;
        LAYOUT.fields.forEach((f, i) => {
          const hh = (LAYOUT.fieldSize / 2) * s;
          g.strokeRect(X(f.x) - hh, Y(f.z) - hh, 2 * hh, 2 * hh);
          g.font = MONO;
          g.fillStyle = css.textSecondary;
          g.fillText(String(i + 1), X(f.x) - hh + 2, Y(f.z) + hh + 11);
        });
        const B = LAYOUT.box;
        g.fillStyle = '#2a2a2a';
        g.fillRect(X(B.x - B.w / 2), Y(B.z - B.d / 2), B.w * s, B.d * s);
        const p = d.lastPath;
        if (p && p.length > 3) {
          const shown = Math.min(p.length / 2, Math.floor(t * 60));
          g.strokeStyle = css.teal;
          g.lineWidth = 2;
          g.beginPath();
          for (let i = 0; i < shown; i++) {
            const x = X(p[i * 2]),
              y = Y(p[i * 2 + 1]);
            if (i) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
        }
        g.font = MONO;
        g.fillStyle = css.textSecondary;
        g.fillText(`${d.demos} Demos · ${d.fields}/5`, 15, h - 6);
      },
    },
  };
}

export function cardB(ctx: ZoneContext): InfoCardSpec {
  return {
    eyebrow: { de: '// 04 · B · BEFEHLEN ◆', en: '// 04 · B · COMMAND ◆' },
    title: { de: 'So ist ein VLA gebaut', en: 'How a VLA is built' },
    body: {
      de: 'Bild + Sprache + Zustand → Aktions-Chunk. Hier läuft ein **Spielzeug-Imitator, kein SmolVLA**. Er folgt Wörtern nur, wenn Wörter in deinen Demos etwas verändert haben.',
      en: 'Image + language + state → action chunk. What runs here is a **toy imitator, not SmolVLA**. It follows words only if words changed something in your demos.',
    },
    bullets: [
      { de: '**Welcher Würfel?** Punkte für das Wort und für den Ort, beide aus deinen Demos gelernt.', en: '**Which cube?** Points for the word and for the place, both learned from your demos.' },
      { de: '**Nächste Nachbarn:** die drei ähnlichsten Momente deiner Demos, ihre nächsten Aktionen gemittelt.', en: '**Nearest neighbours:** the three most similar moments of your demos, their next actions averaged.' },
      { de: '**Action Chunking:** eine halbe Sekunde auf einmal, dann neu schauen.', en: '**Action chunking:** half a second at once, then look again.' },
      { de: '**Lizenz:** Der Code ist oft offen, die Gewichte nicht immer: π0 unter Gemma-Bedingungen, GR00T unter NVIDIAs Open Model License.', en: '**Licence:** the code is often open, the weights not always: π0 under Gemma terms, GR00T under NVIDIA’s Open Model License.' },
    ],
    entscheider: {
      body: {
        de: 'Ein Modell kann nur, was in den Daten **variiert**. Frag: **Gleiche Eingaben im Betrieb wie im Training?** Lagen, Wörter, Licht, Kamera.',
        en: 'A model can only do what **varies** in the data. Ask: **same inputs in operation as in training?** Poses, words, light, camera.',
      },
      bullets: [],
      forDecisionMakers: { title: { de: 'Befundkarte · Lern-Dojo', en: 'Findings card · Learning Dojo' }, bullets: befundBullets() },
    },
    diagram: {
      aspect: 4 / 3,
      caption: { de: 'So ist ein VLA aufgebaut. Hier läuft ein Nächster-Nachbar-Imitator mit gelernten Gewichten für Wort und Ort.', en: 'How a VLA is structured. What runs here is a nearest-neighbour imitator with learned weights for word and place.' },
      draw(g, w, h) {
        g.fillStyle = '#141414';
        g.fillRect(0, 0, w, h);
        const de = ctx.lang === 'de';
        const rows = de
          ? [
              ['SEHEN', 'Kamera → Patches (Tokens)', 'hier: Farbklassen aus deinen Demo-Bildern'],
              ['VERSTEHEN', 'Befehl + Zustand', 'hier: Punkte für Wort und Ort'],
              ['HANDELN', 'Aktions-Chunk', 'hier: 15 Schritte · 0,5 s, k = 3 Nachbarn'],
            ]
          : [
              ['SEE', 'camera → patches (tokens)', 'here: colour classes from your demo frames'],
              ['UNDERSTAND', 'command + state', 'here: points for word and place'],
              ['ACT', 'action chunk', 'here: 15 steps · 0.5 s, k = 3 neighbours'],
            ];
        const pad = 14,
          gap = 16,
          bh = (h - pad * 2 - gap * 2) / 3;
        rows.forEach(([t, a, b], i) => {
          const y = pad + i * (bh + gap);
          g.fillStyle = '#1f1f1f';
          g.fillRect(pad, y, w - pad * 2, bh);
          g.strokeStyle = i === 2 ? css.orange : css.teal;
          g.lineWidth = 1.5;
          g.strokeRect(pad, y, w - pad * 2, bh);
          g.fillStyle = css.text;
          g.font = '600 15px "Space Grotesk", sans-serif';
          g.fillText(t, pad + 12, y + 22);
          g.font = '12px "Geist", sans-serif';
          g.fillStyle = css.textSecondary;
          g.fillText(a, pad + 12, y + 40);
          g.fillStyle = i === 2 ? css.orangeLight : css.teal;
          g.font = MONO;
          g.fillText(b, pad + 12, y + bh - 9);
        });
      },
    },
  };
}

export function befundBullets(): { de: string; en: string }[] {
  return [
    { de: '**Messgröße:** Erfolg je Bedingung (Lage, Wort, Licht, Kamera), mit n und Intervall.', en: '**Measured:** success per condition (pose, word, light, camera), with n and interval.' },
    { de: '**Grenze:** Außerhalb der Demo-Varianten bricht die Policy ein; Wörter ohne Varianz ignoriert sie.', en: '**Limit:** outside the demo variants the policy breaks; words without variation are ignored.' },
    { de: '**Frage:** „Gleiche Eingaben im Betrieb wie im Training?“', en: '**Question:** “Same inputs in operation as in training?”' },
    { de: '**Für dein Werk:** Plane die Aufnahme wie einen Versuch, Varianten × Wiederholungen; miss jede Variante mit mindestens fünfzig Versuchen.', en: '**For your plant:** plan recording like an experiment, variants × repetitions; measure each variant with at least fifty trials.' },
  ];
}

export function befundCard(): InfoCardSpec {
  return {
    eyebrow: { de: '// BEFUNDKARTE · 04 LERN-DOJO', en: '// FINDINGS CARD · 04 LEARNING DOJO' },
    title: { de: 'Sprache und Demos: was du gemessen hast', en: 'Language and demos: what you measured' },
    body: {
      de: 'Ein Befehl mit dem Wort aus den Demos: Erfolg. Ein anderes Wort: ignoriert. Erst Demos, die beide Farben unterschieden, brachten es bei.',
      en: 'A command with the word from the demos: success. Another word: ignored. Only demos that told both colours apart taught it.',
    },
    bullets: befundBullets(),
  };
}

export function cardC(ctx: ZoneContext): InfoCardSpec {
  return {
    eyebrow: { de: '// 04 · C · PRÜFEN', en: '// 04 · C · CHECK' },
    title: { de: 'Erst die Daten prüfen, dann trainieren', en: 'Check the data first, then train' },
    body: {
      de: 'Episoden von drei Werkbänken. Darin: ein Block, in dem der Arm stillsteht, verschobene Kameras und **falsche Etiketten**. Sprachlabels sind auch Daten.',
      en: 'Episodes from three workbenches. In them: a block where the arm stands still, shifted cameras and **wrong labels**. Language labels are data too.',
    },
    bullets: [
      { de: '**Totblock:** fünfunddreißig Episoden am Stück, flache Linien.', en: '**Dead block:** thirty-five episodes in a row, flat lines.' },
      { de: '**Kamera verschoben:** zwölf Vorschaubilder stehen schief.', en: '**Camera shifted:** twelve thumbnails sit askew.' },
      { de: '**Falsches Etikett:** achtzehnmal steht „rot“ da, bewegt wird Blau.', en: '**Wrong label:** eighteen times it says “red”, blue is moved.' },
      { de: '**Echt passiert:** In einem offenen Datensatz begann jede Demo mit einer Null-Aktion; trainierte Policies froren oft ein (Kim und andere, OpenVLA).', en: '**This happened:** in one open dataset every demo began with a zero action; trained policies often froze (Kim and others, OpenVLA).' },
    ],
    illustrative: true,
    entscheider: {
      body: {
        de: 'Prüf den Datensatz **vor dem Training, nicht nach dem Pilot**, und miss **je Bedingung**: bekannte und neue Lagen getrennt, jede mit Band.',
        en: 'Check the dataset **before training, not after the pilot**, and measure **per condition**: known and new poses apart, each with its band.',
      },
      forDecisionMakers: {
        bullets: [
          { de: 'Frag: Wer hat die Episoden angesehen, mit welchem Kriterium – auch die Etiketten?', en: 'Ask: who looked at the episodes, with which criterion, labels included?' },
          { de: 'Eine Zahl ohne Bedingung ist keine Zahl: „bekannte Lagen“ und „neue Lagen“ getrennt berichten.', en: 'A number without its condition is no number: report “known poses” and “new poses” apart.' },
        ],
      },
    },
    diagram: {
      aspect: 16 / 8,
      animate: true,
      caption: { de: 'Erfolgsmodell je Aufräum-Schritt und Bedingung (ILLUSTRATIV).', en: 'Success model per clean-up step and condition (ILLUSTRATIVE).' },
      draw(g, w, h, t) {
        g.fillStyle = '#141414';
        g.fillRect(0, 0, w, h);
        const steps: [string, string, number, number][] = [
          ['roh', 'raw', 70, 40],
          ['−Totblock', '−dead', 86, 49],
          ['−Kamera', '−camera', 89, 51],
          ['−Etiketten', '−labels', 92, 54],
        ];
        const base = h - 30,
          top = 18;
        const Y = (p: number): number => base - ((base - top) * p) / 100;
        g.font = MONO;
        g.fillStyle = css.textMuted;
        for (const p of [0, 50, 100]) {
          g.strokeStyle = css.borderSubtle;
          g.beginPath();
          g.moveTo(36, Y(p));
          g.lineTo(w - 10, Y(p));
          g.stroke();
          g.fillText(`${p} %`, 2, Y(p) + 4);
        }
        const bw = (w - 60) / steps.length;
        steps.forEach(([de, en, k, n], i) => {
          const grow = Math.min(1, Math.max(0, t * 1.6 - i * 0.2));
          const x = 46 + i * bw;
          g.fillStyle = css.teal;
          g.fillRect(x, Y(k * grow), bw * 0.3, base - Y(k * grow));
          g.fillStyle = css.orangeLight;
          g.fillRect(x + bw * 0.33, Y(n * grow), bw * 0.3, base - Y(n * grow));
          g.fillStyle = css.text;
          g.fillText(`${Math.round(k * grow)}`, x, Y(k * grow) - 5);
          g.fillText(`${Math.round(n * grow)}`, x + bw * 0.33, Y(n * grow) - 5);
          g.fillStyle = css.textSecondary;
          g.font = '10px "Geist Mono", monospace';
          g.fillText(ctx.lang === 'de' ? de : en, x, base + 16);
          g.font = MONO;
        });
        g.fillStyle = css.teal;
        g.fillText(ctx.lang === 'de' ? '■ bekannte Lagen' : '■ known poses', w - 230, 14);
        g.fillStyle = css.orangeLight;
        g.fillText(ctx.lang === 'de' ? '■ neue Lagen' : '■ new poses', w - 110, 14);
      },
    },
  };
}
