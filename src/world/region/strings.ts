import type { LocalizedTables } from '@/core/zones';

/**
 * The region's player text (registered in the island module's namespace under `region.*`). German first,
 * „du“ everywhere; the Revier-Chronik is FIKTION (D43: no dates, no real places).
 */
export const STRINGS: LocalizedTables = {
  de: {
    region: {
      chronik: {
        eyebrow: '// Revier-Chronik',
        title: 'Grube → See → Acker',
        chip: 'Fiktion',
        fiktion: 'Das Revier und seine Geschichte sind erfunden – wie die Insel.',
        t1: 'Grube',
        b1: 'Früher Tagebau: Der Schaufelradbagger grub hier nach Kohle.',
        t2: 'See',
        b2: 'Nach dem Abbau lief die tiefste Grube voll: der Revier-See.',
        t3: 'Acker',
        b3: 'Heute wachsen hier Tomaten und Strom. Der Bagger bleibt.',
        p1: '**Grube.** Früher Tagebau: Der Schaufelradbagger grub hier nach Kohle.',
        p2: '**See.** Nach dem Abbau lief die tiefste Grube voll: der Revier-See.',
        p3: '**Acker.** Heute wachsen hier Tomaten und Strom. Der Bagger bleibt als Erinnerung.',
        read: 'Revier-Chronik lesen',
      },
      way: {
        hofladen: 'Sonnenacker · Hofladen',
        grubenrand: 'Grubenrand',
        unkrautacker: 'Unkrautacker',
        kreislaufhof: 'Kreislaufhof',
        traumhangar: 'Traumhangar',
        werft: 'Werft',
      },
      map: {
        tab: 'Revier',
        lake: 'Revier-See',
        grubenrand: 'Grubenrand',
        werft: 'Werft',
        closed: 'öffnet mit dem ersten Rotor',
      },
    },
  },
  en: {
    region: {
      chronik: {
        eyebrow: '// Revier chronicle',
        title: 'Pit → lake → field',
        chip: 'Fiction',
        fiktion: 'The Revier and its history are made up, like the island.',
        t1: 'Pit',
        b1: 'Open-cast mining: the bucket-wheel excavator dug for coal here.',
        t2: 'Lake',
        b2: 'When mining stopped, the deepest pit filled up: the Revier lake.',
        t3: 'Field',
        b3: 'Today tomatoes and power grow here. The excavator stays.',
        p1: '**Pit.** Open-cast mining: the bucket-wheel excavator dug for coal here.',
        p2: '**Lake.** When mining stopped, the deepest pit filled up: the Revier lake.',
        p3: '**Field.** Today tomatoes and power grow here. The excavator stays as a reminder.',
        read: 'Read the Revier chronicle',
      },
      way: {
        hofladen: 'Sun Field · farm shop',
        grubenrand: 'Pit edge',
        unkrautacker: 'Weed Field',
        kreislaufhof: 'Circular Yard',
        traumhangar: 'Dream Hangar',
        werft: 'Shipyard',
      },
      map: {
        tab: 'Revier',
        lake: 'Revier lake',
        grubenrand: 'Pit edge',
        werft: 'Shipyard',
        closed: 'opens with the first rotor',
      },
    },
  },
};
