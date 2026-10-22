import type { LocalizedTables } from '@/core/zones';

/** Strings of the dev site (registered under 'zone._site-example'). Dev only, never shipped. */
export const STRINGS: LocalizedTables = {
  de: {
    sign: {
      eyebrow: '// Dev-Gelände · _site-example',
      title: 'Bodenrahmen-Werkbank',
      body: 'Ein Gelände im Bodenrahmen: Kisten, ein Rover, ein Arm, eine Lampe, ein Auffangnetz. Hebt die Insel ab, ruht hier alles.',
    },
    crate: 'Kiste',
    lamp: 'Lampe schalten',
    lampHint: 'Gelände-Licht an oder aus',
    robot: 'SO-101 winken lassen',
    robotWait: 'Der Arm lädt noch.',
    net: 'Auffangnetz',
  },
  en: {
    sign: {
      eyebrow: '// Dev site · _site-example',
      title: 'Ground-frame workbench',
      body: 'A site in the ground frame: crates, a rover, an arm, a lamp, a safety net. When the island lifts off, everything here rests.',
    },
    crate: 'Crate',
    lamp: 'Switch the lamp',
    lampHint: 'Site light on or off',
    robot: 'Make the SO-101 wave',
    robotWait: 'The arm is still loading.',
    net: 'Safety net',
  },
};
