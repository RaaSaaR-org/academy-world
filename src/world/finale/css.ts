/** Styles for the finale's own DOM (operate panels, modals). Scoped with the `fin-` prefix. */
export const FIN_CSS = `
.fin { color: var(--text-2); font-family: var(--font-sans); }
.fin.fin-modal { max-height: calc(100vh - 28px); overflow-y: auto; box-sizing: border-box; }
.fin.fin-modal > .fin-actions, .fin.fin-modal .fin-actions.sticky { position: sticky; bottom: -22px; margin: 10px -4px -8px; padding: 12px 4px 10px; background: linear-gradient(rgba(24,23,22,0), rgba(24,23,22,0.97) 35%); z-index: 2; }
.fin h2 { font-family: var(--font-display); color: var(--text); font-size: 24px; letter-spacing: -0.02em; margin: 6px 0 10px; line-height: 1.15; }
.fin h3 { font-family: var(--font-display); color: var(--text); font-size: 17px; margin: 0 0 8px; }
.fin p { margin: 0 0 10px; line-height: 1.5; font-size: 14px; }
.fin .fin-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.fin .fin-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.fin .fin-chips { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.fin canvas { display: block; }
.fin .fin-big { font-family: var(--font-display); color: var(--text); font-size: 30px; font-weight: 700; letter-spacing: -0.02em; }
.fin .fin-mono { font-family: var(--font-mono); font-size: 12.5px; letter-spacing: 0.04em; }
.fin .fin-k { color: var(--text-3); font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; }
.fin .fin-v { color: var(--text); font-family: var(--font-mono); font-size: 15px; }
.fin .fin-v.accent { color: var(--orange); }
.fin .fin-v.teal { color: var(--teal); }
.fin .fin-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.fin .fin-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0; }
.fin .fin-stat { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 8px 10px; }
.fin .fin-countdown { font-family: var(--font-display); font-size: 64px; color: var(--text); text-align: center; line-height: 1; margin: 6px 0; }
.fin .fin-state { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--teal); }
.fin .fin-state.warn { color: var(--warning); }
.fin .fin-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; flex-wrap: wrap; }
.fin .fin-sheet { background: linear-gradient(160deg, #ECE9E6, #CFCAC5); color: #1C1917; border-radius: 12px; padding: 18px 18px 14px; position: relative; }
.fin .fin-sheet .fin-vendor { font-family: var(--font-display); font-weight: 700; font-size: 13px; letter-spacing: 0.08em; color: #44403C; }
.fin .fin-sheet .fin-claim { font-family: var(--font-display); font-weight: 700; font-size: 54px; letter-spacing: -0.03em; color: #1C1917; line-height: 1; margin: 8px 0 4px; }
.fin .fin-sheet p { color: #44403C; font-size: 13.5px; margin: 6px 0 0; }
.fin .fin-sheet .fin-star { color: #78716C; font-size: 11.5px; margin-top: 10px; }
.fin .fin-protocol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.fin .fin-protocol li { display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; align-items: baseline; font-size: 12.5px; line-height: 1.3; padding: 4px 8px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border-subtle); }
.fin .fin-protocol .n { font-family: var(--font-mono); color: var(--orange-light); font-size: 11.5px; }
.fin .fin-protocol .q { color: var(--text-3); font-size: 11.5px; display: block; }
.fin .fin-protocol .a { color: var(--text); }
.fin .fin-protocol .have { font-family: var(--font-mono); font-size: 10.5px; color: var(--teal); white-space: nowrap; }
.fin .fin-box { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-top: 12px; background: rgba(255,103,0,0.05); }
.fin .fin-box .fin-k { color: var(--orange-light); }
.fin .fin-tabs { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.fin .fin-tabs button { font-family: var(--font-sans); font-size: 13px; padding: 6px 12px; background: transparent; color: var(--text-2); border: 0; cursor: pointer; }
.fin .fin-tabs button.on { background: var(--elevated); color: var(--text); box-shadow: inset 0 -2px 0 var(--orange); }
.fin .fin-tiles { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 4px; }
.fin .fin-tile { font-family: var(--font-sans); font-size: 13.5px; text-align: left; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; transition: var(--ease); line-height: 1.3; }
.fin .fin-tile:hover { border-color: var(--text-3); color: var(--text); }
.fin .fin-tile.num::before { content: '#'; font-family: var(--font-mono); color: var(--teal); margin-right: 6px; }
.fin .fin-tile.on { border-color: var(--orange); background: var(--orange-bg); color: var(--text); }
.fin .fin-sentence { font-family: var(--font-display); color: var(--text); font-size: 19px; line-height: 1.4; letter-spacing: -0.01em; padding: 14px 16px; border-left: 3px solid var(--orange); background: var(--surface); border-radius: 0 10px 10px 0; margin: 12px 0 6px; }
.fin .fin-sentence .gap { color: var(--text-3); }
.fin .fin-warn { color: var(--warning); font-size: 13px; }
.fin .fin-label { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-3); margin: 14px 0 4px; }
.fin label.fin-field { display: block; }
.fin label.fin-field .fin-label { display: block; }
.fin input.fin-name { width: 100%; box-sizing: border-box; font: 15px var(--font-sans); padding: 9px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
.fin input.fin-name:focus { outline: none; border-color: var(--orange); }
.fin .fin-cert { width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--border-subtle); display: block; }
.fin .fin-certgrid { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 18px; align-items: stretch; }
.fin .fin-side { display: flex; flex-direction: column; }
.fin .btn.block { width: 100%; justify-content: center; }
`;
