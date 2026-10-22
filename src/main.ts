import { importRetry } from './core/retry';

/**
 * Entry (C8): kept tiny. index.html paints the loading shell and runs the pre-boot gate (WebGL2,
 * class static blocks → Safari 16.4+, touch-only); the game and its stylesheet are imported only
 * once the gate passes (or the visitor of a touch laptop chooses to load anyway).
 */
interface Gate {
  ok: boolean;
  reason: string | null;
  go: Promise<void>;
  /** „Entdecken“ (WP-D0): Discover, and why it runs as the stills tour (null: 3D) */
  discover?: boolean;
  stills?: import('./discover/types').StillsReason | null;
}

function webgl2Available(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** The game chunk could not be loaded even after a retry: say so in the shell (no i18n yet). */
function bootFailed(err: unknown): void {
  console.error('[boot] the game could not be loaded', err);
  const shell = document.getElementById('loading');
  if (!shell) return;
  shell.classList.add('failed');
  shell.classList.remove('indet');
  const en = document.documentElement.lang === 'en';
  const msg = en
    ? ['The island could not start.', 'Trying again usually helps. Your progress is kept.', 'Die Insel konnte nicht starten. Meist hilft ein neuer Versuch.']
    : ['Die Insel konnte nicht starten.', 'Meist hilft ein neuer Versuch. Dein Fortschritt bleibt erhalten.', 'The island could not start. Trying again usually helps.'];
  const box = shell.querySelector('.err');
  const actions = shell.querySelector('.actions');
  if (box) {
    box.innerHTML = '';
    for (const [cls, text] of [['err-title', msg[0]], ['err-hint', msg[1]], ['err-hint err-alt', msg[2]]]) {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      box.appendChild(d);
    }
    const det = document.createElement('details');
    det.className = 'err-detail';
    const sum = document.createElement('summary');
    sum.textContent = en ? 'Technical details · Technische Details' : 'Technische Details · Technical details';
    const code = document.createElement('code');
    code.textContent = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    det.append(sum, code);
    box.appendChild(det);
  }
  if (actions) {
    actions.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primary';
    b.textContent = en ? 'Try again · Erneut versuchen' : 'Erneut versuchen · Try again';
    b.onclick = () => location.reload();
    actions.appendChild(b);
    b.focus();
  }
}

async function start(): Promise<void> {
  const gate = (window as unknown as { __emaiGate?: Gate }).__emaiGate;
  if (gate) await gate.go; // never resolves for a browser that cannot run the island (the shell says why)
  else if (!webgl2Available()) return;
  const app = document.getElementById('app')!;
  try {
    // „Entdecken“ on a weak phone: the stills tour, without the game, Rapier, the world or any model
    if (gate?.discover && gate.stills) {
      const { bootStills } = await importRetry(() => import('./discover/stills/boot'));
      await bootStills(app, gate.stills);
      return;
    }
    const [{ Game }] = await Promise.all([importRetry(() => import('./core/Game')), importRetry(() => import('./ui/hud.css'))]);
    const game = new Game(app);
    void game.boot();
  } catch (err) {
    bootFailed(err);
  }
}

void start();
