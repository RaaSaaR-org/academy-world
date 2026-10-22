/**
 * Small shared state between the tower's own modules (hub, lift, foyer): who needs what
 * without widening the island's public interfaces. Reset per island build.
 */
export interface TowerState {
  /** current lift stop and whether a ride is running (lift.ts writes) */
  liftAt: 'foyer' | 'ausguck' | 'kiel';
  liftBusy: boolean;
  /** car height (m) */
  carY: number;
  /** current objective zone (foyer.setObjective writes) */
  objective: string | null;
  /** bump when zone visits / objective change (crown beacons re-read) */
  beaconsDirty: boolean;
}

export const towerState: TowerState = { liftAt: 'foyer', liftBusy: false, carY: 0, objective: null, beaconsDirty: true };

export function resetTowerState(): void {
  towerState.liftAt = 'foyer';
  towerState.liftBusy = false;
  towerState.carY = 0;
  towerState.objective = null;
  towerState.beaconsDirty = true;
}
