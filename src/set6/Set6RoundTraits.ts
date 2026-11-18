import { Participant } from '../Participant';
import type { SharedPoolManager } from '../SharedPoolManager';
import { SynergyEngine } from '../SynergyEngine';
import { YORDLE_UNIT_IDS } from '../GameData';
import { defaultSocialiteSpotlights, rollMutantVariant } from './Set6MatchState';

/**
 * After PvP, spawn a random 1★ Yordle on bench when (3) YORDLE is active.
 */
export function tryYordleBenchSpawn(
  participant: Participant,
  sharedPool: SharedPoolManager,
  isCreepMatch: boolean
): void {
  if (isCreepMatch || participant.isEliminated) return;
  const yordleCount = SynergyEngine.getActiveSynergyMap(participant).get('YORDLE')?.count ?? 0;
  if (yordleCount < 3) return;

  const benchIdx = participant.bench.findIndex((s) => s === null);
  if (benchIdx < 0) return;

  const candidates = YORDLE_UNIT_IDS.filter(
    (id) => sharedPool.getRemainingCount(id) > 0
  );
  if (candidates.length === 0) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
  if (!sharedPool.pullSpecificUnitFromPool(pick)) return;

  participant.bench[benchIdx] = Participant.createUnitInstance(pick, 1);
  participant.lastActionMessage =
    '🐾 [요들] PvP 후 무작위 요들 1성이 벤치에 등장했습니다!';
}

export function initParticipantSet6MatchState(participant: Participant): void {
  participant.set6MutantVariant = rollMutantVariant();
  const socialiteCount =
    SynergyEngine.getActiveSynergyMap(participant).get('SOCIALITE')?.count ?? 0;
  if (socialiteCount > 0 && participant.socialiteSpotlights.length === 0) {
    participant.socialiteSpotlights = defaultSocialiteSpotlights(socialiteCount);
  }
}