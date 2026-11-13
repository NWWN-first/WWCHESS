// scripts/simPlacement.ts
// Stage 0: 시뮬 순위/보드파워 공통 헬퍼 (생존자 배열순서 편향 제거)

import { Participant } from '../src/Participant';

/** 간단 보드 파워 추정 — 생존자 동점 해소용 (AI optimizeBoard와 유사 스케일) */
export function estimateBoardPower(p: Participant): number {
  let power = 0;
  for (let r = 0; r < Participant.BOARD_ROWS; r++) {
    for (let c = 0; c < Participant.BOARD_COLS; c++) {
      const u = p.board[r][c];
      if (!u) continue;
      power += u.starLevel * 38 + u.cost * 14 + u.items.length * 12;
    }
  }
  return power;
}

/**
 * 탈락 순서 + 생존자 강도로 1~8위 산정.
 * - eliminationOrderIds[0] = 최초 탈락 = 8위
 * - 생존자는 약→강 순으로 뒤에 붙여 최강자가 1위
 */
export function computePlacements(args: {
  participants: Participant[];
  eliminationOrderIds: string[];
}): Map<string, number> {
  const { participants, eliminationOrderIds } = args;
  const elim = [...eliminationOrderIds];
  const survivors = participants
    .filter((p) => !p.isEliminated)
    .sort((a, b) => {
      if (a.hp !== b.hp) return a.hp - b.hp; // 약한 HP 먼저 (= 더 나쁜 순위)
      const pa = estimateBoardPower(a);
      const pb = estimateBoardPower(b);
      if (pa !== pb) return pa - pb;
      if (a.gold !== b.gold) return a.gold - b.gold;
      return a.id.localeCompare(b.id);
    })
    .map((p) => p.id);

  const full = [...elim, ...survivors];
  const placements = new Map<string, number>();
  const n = Math.max(full.length, participants.length);
  full.forEach((id, idx) => {
    placements.set(id, n - idx);
  });
  for (const p of participants) {
    if (!placements.has(p.id)) placements.set(p.id, Math.ceil(n / 2));
  }
  return placements;
}

/** 평균순위와 1위율이 동시에 성립 불가능한지 검사 (Stage0 가드) */
export function assertPersonaRankConsistency(
  label: string,
  avgRank: number,
  top1Rate: number
): string | null {
  // 1위율 p면 평균순위의 이론 하한은 대략 1*p + 2*(1-p) = 2-p
  // (전원 1위 또는 2위만 가정한 최솟값). 더 느슨하게: avg > 5 && top1 > 0.2 는 의심
  if (top1Rate <= 0) return null;
  const theoreticalMinAvg = 1 * top1Rate + 2 * (1 - top1Rate);
  if (avgRank + 0.05 < theoreticalMinAvg) {
    return `[RANK_INCONSISTENT] ${label}: avg=${avgRank.toFixed(2)} top1=${(top1Rate * 100).toFixed(1)}% (이론하한≈${theoreticalMinAvg.toFixed(2)})`;
  }
  if (avgRank >= 5.5 && top1Rate >= 0.2) {
    return `[RANK_SUSPECT] ${label}: avg=${avgRank.toFixed(2)}인데 1위율 ${(top1Rate * 100).toFixed(1)}% — 순위 집계 재확인 필요`;
  }
  return null;
}
