# Self-hosted unicode-font-resolver data (subset)

troika-three-text (the 3D text) looks up a fallback font for every character its own font lacks.
By default it loads that data from a third-party CDN. `src/core/Text3D.ts` points it here instead
(`configureTextBuilder({ unicodeFontsURL })`), so the game makes no request to another host.

Source: https://github.com/lojjic/unicode-font-resolver, tag v1.0.1, folder `packages/data`
(the exact version troika-three-text 0.52 asks for). Copied unchanged.

Only the files the game needs are here:

- `codepoint-index/plane0/0-ff.json`: Basic Latin and Latin-1 (spaces inside a fallback run)
- `codepoint-index/plane0/300-3ff.json`: Greek (σ, κ, θ … on the 3D signs)
- `font-meta/latin.json`, `font-meta/greek.json`
- `font-files/greek/sans-serif.normal.400.woff`: Noto Sans, Greek subset

Licences: `LICENSE` (MIT, the resolver data) and `font-files/LICENSE` (SIL OFL 1.1, Noto fonts).

A 3D label with a character from another Unicode block needs that block's index file, its
`font-meta` file and its font file copied here from the same tag. Otherwise the resolver falls
back to the CDN. In dev, `Text3DFactory` warns in the console when a label has such a character.
