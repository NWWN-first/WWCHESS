import type { AIPersona } from '../Participant';

/**
 * Hillclimb snapshot (2026-11-18): weak KPI personas MERCENARY_GAMBLER / FAST_NINE_*.
 * Deltas applied in `AIBotController.biasPolicyLogitsForPersona` on macro logits
 * [SAVE_INTEREST, TEMPO_LEVEL, ROLLDOWN, STABILIZE_REROLL].
 */
export const PERSONA_MACRO_LOGIT_BIAS: Record<
  AIPersona,
  { save: number; tempo: number; roll: number; stabilize: number }
> = {
  HYPER_ROLLER: { save: -1.1, tempo: 0, roll: 1.4, stabilize: 0.9 },
  LOW_COST_REROLLER: { save: -1.1, tempo: 0, roll: 1.4, stabilize: 0.9 },
  FAST_NINE_ECONOMIST: { save: 1.4, tempo: 0.95, roll: -1.0, stabilize: 0 },
  FAST_NINE_GREEDY: { save: 0.85, tempo: 0.85, roll: -0.55, stabilize: 0 },
  MERCENARY_GAMBLER: { save: 0.05, tempo: 0.15, roll: 0.9, stabilize: 0.5 },
  FLEX_MASTER: { save: 0, tempo: 0.45, roll: 0, stabilize: 0.15 },
  FLEX_BALANCED: { save: 0, tempo: 0.85, roll: 0, stabilize: 0.35 },
};

export const PERSONA_POLICY_TEMPERATURE_HILLCLIMB: Record<AIPersona, number> = {
  HYPER_ROLLER: 0.95,
  LOW_COST_REROLLER: 0.88,
  FAST_NINE_GREEDY: 0.38,
  FAST_NINE_ECONOMIST: 0.3,
  MERCENARY_GAMBLER: 0.92,
  FLEX_MASTER: 0.55,
  FLEX_BALANCED: 0.62,
};