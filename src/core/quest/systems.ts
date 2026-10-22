/**
 * WP1 (quest spine) — the system table of plan §3.1 (D23). The ◆ station of each system is read from
 * the area manifests (`system`, `trim` and the ◆ flag), so a station that replaces a ◆ (Greifwerkstatt
 * C, WP8) or a new area needs no change here; group and crewIn are this table.
 */
import { CORE_IDS, ROTOR_IDS, TRIM_IDS, type AreaManifest, type SystemId } from '../zones/manifest';
import type { StartSystem, SystemDef } from './types';
import type { Mode } from '../types';

/** Group and Bodencrew modes per system (§3.1 table). */
export const SYSTEM_GROUPS: Readonly<Record<SystemId, { group: StartSystem | 'trim'; crewIn?: readonly Mode[] }>> = {
  M1: { group: 'lift' },
  M2: { group: 'lift' },
  M3: { group: 'lift' },
  M4: { group: 'lift' },
  M5: { group: 'lift' },
  M6: { group: 'lift' },
  AKKU: { group: 'energy', crewIn: ['entscheider'] },
  NAV: { group: 'nav', crewIn: ['entscheider'] },
  T1: { group: 'trim' },
  T2: { group: 'trim' },
  T3: { group: 'trim' },
  T4: { group: 'trim' },
};

/** M1–M6, AKKU, NAV, T1–T4: the order of every system list (lamps, checklist, „Auftrieb fehlt noch: …“). */
export const SYSTEM_ORDER: readonly SystemId[] = [...ROTOR_IDS, ...CORE_IDS, ...TRIM_IDS];

/**
 * The system table from the manifests: one row per `system` and per `trim` of an area with a ◆, in
 * SYSTEM_ORDER. T2 and T3 share their ◆ with NAV and AKKU (they ignite in the same beat). The first
 * area that claims a system wins (a second one is a manifest error, reported in dev).
 */
export function systemDefs(manifests: Iterable<AreaManifest>): SystemDef[] {
  const out = new Map<SystemId, SystemDef>();
  for (const m of manifests) {
    const star = m.stations.find((s) => s.star);
    if (!star) continue;
    for (const id of [m.system, m.trim]) {
      if (!id || !(id in SYSTEM_GROUPS)) continue;
      if (out.has(id)) {
        if (import.meta.env?.DEV) console.warn(`[quest] system ${id} is claimed by "${out.get(id)!.areaId}" and "${m.id}": keeping the first`);
        continue;
      }
      const g = SYSTEM_GROUPS[id];
      out.set(id, { id, areaId: m.id, station: star.id, group: g.group, ...(g.crewIn ? { crewIn: g.crewIn } : {}) });
    }
  }
  return SYSTEM_ORDER.filter((id) => out.has(id)).map((id) => out.get(id)!);
}

/** The system an area's ◆ starts (its `system`), or null. */
export function systemOfArea(defs: readonly SystemDef[], areaId: string): SystemDef | null {
  return defs.find((d) => d.areaId === areaId && d.group !== 'trim') ?? defs.find((d) => d.areaId === areaId) ?? null;
}
