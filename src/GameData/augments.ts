// src/GameData/augments.ts

import type { AugmentTier, BaseItemId, CompletedItemId, TraitId } from './types';

// ============================================================================
// E. 증강체 정의 (AUGMENT_DEFINITIONS — 실버/골드/프리즘, 규모는 GAME_CONTENT_STATS 참조)
// ============================================================================

export type AugmentCategory = 'ECONOMY' | 'COMBAT' | 'HERO' | 'TRAIT';

export type AugmentEffectKey =
  | 'PANDORA_BENCH'
  | 'CYBERNETIC_IMPLANT'
  | 'BATTLE_MAGE'
  | 'TINY_TITANS'
  | 'WARMUP'
  | 'CLEARANCE_SALE'
  | 'HERO_GAREN'
  | 'HERO_PIP'
  | 'GOLDEN_TICKET'
  | 'DIABOLIC_FINANCE'
  | 'CELESTIAL_BLESSING'
  | 'HERO_JEANNE'
  | 'HERO_ORION'
  | 'HERO_DRAKE'
  | 'HERO_MALAKOR'
  | 'MARTIAL_TRAINING'
  | 'ASCENSION'
  | 'STAND_UNITED'
  | 'EMPIRE_CREST'
  | 'VANGUARD_CREST'
  | 'ARCHMAGE_CREST'
  | 'DEMON_CREST'
  | 'ELVEN_CREST'
  | 'DRAGON_CREST'
  | 'LEVEL_UP'
  | 'FATED_DUPLICATION'
  | 'GOBLIN_CROWN'
  | 'ARCANE_CREST'
  | 'VANGUARD_CROWN'
  | 'EMPIRE_CROWN'
  | 'GOLDEN_EGG'
  | 'HEDGE_FUND'
  // --- TFT 시즌 18 신규 실버 증강 ---
  | 'STAND_UNITED_1'
  | 'REROLL_DAY'
  | 'KINGSLAYER'
  | 'BOXING_LESSON'
  | 'MAKE_WAY'
  | 'GROUP_HUG'
  | 'THIEF_GLOVES'
  | 'INCOMPLETE_ASCENSION'
  | 'GUARDIAN_FRIEND'
  | 'COLD_START'
  | 'TWIN_GUARDIAN'
  | 'ITEM_PACK_1'
  | 'MYSTIC_DICE'
  | 'USEFUL_METAL'
  | 'SILVER_DESTINY'
  | 'DAILY_LIFE'
  | 'CAPITAL_GAIN_1'
  | 'SMALL_PACK'
  | 'PATIENCE_REWARD'
  | 'CHAMP_DELIVERY'
  | 'CORROSION'
  | 'GLASS_CANNON'
  | 'SILVER_SPOON'
  | 'MAKESHIFT_ARMOR'
  | 'CALCULATED_LOSS'
  // --- TFT 시즌 18 신규 골드 증강 ---
  | 'TRADE_SECTOR'
  | 'JEWELED_LOTUS'
  | 'HYPER_ROLL'
  | 'GOLDEN_SCALPEL'
  | 'RICH_GET_RICHER'
  | 'LAST_STAND'
  | 'METEORIC_IMPACT'
  | 'REIGN_OF_CHAOS'
  | 'TACTICAL_RETREAT'
  | 'OVERFLOWING_BLADE'
  | 'OVERFLOWING_ROD'
  | 'OVERFLOWING_BELT'
  | 'HEROIC_INSPIRATION'
  | 'TITANIC_FORCE'
  | 'WARP_DRIVE'
  // --- TFT 시즌 18 신규 프리즘 증강 ---
  | 'PRISMATIC_TICKET'
  | 'MONEY_STORM'
  | 'ARCANE_VICTORY'
  | 'CORONATION'
  | 'BIRTHDAY_PRESENT'
  | 'RADIANT_RELICS'
  | 'LIVING_FORGE'
  | 'CURSED_CROWN'
  | 'FINAL_ASCENSION'
  | 'SHADOW_CLONE';

export interface AugmentDefinition {
  id: string;
  name: string;
  tier: AugmentTier;
  category: AugmentCategory;
  effectKey: AugmentEffectKey;
  icon: string;
  description: string;
  heroUnitId?: string;
  bonusTrait?: TraitId;
  bonusTraitCount?: number;
  immediateGold?: number;
  immediateDuplicators?: number;
  immediateBaseItems?: BaseItemId[];
  immediateCompletedItems?: CompletedItemId[];
  immediateUnitId?: string;
  immediateXp?: number;
  immediateHp?: number;
  freeRerollsGranted?: number;
}

export const AUGMENT_DEFINITIONS: AugmentDefinition[] = [
  // ==========================================================================
  // SILVER (8종)
  // ==========================================================================
  {
    id: 'AUG_PANDORA_BENCH',
    name: '판도라의 대기석',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'PANDORA_BENCH',
    icon: '🎲',
    description:
      '매 라운드 시작 시 대기석 우측 3칸(7, 8, 9번 슬롯)에 있는 기물들이 같은 코스트의 랜덤 기물로 변신합니다. 즉시 2골드를 획득합니다.',
    immediateGold: 2,
  },
  {
    id: 'AUG_CYBERNETIC_IMPLANT',
    name: '사이버네틱 임플란트',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'CYBERNETIC_IMPLANT',
    icon: '🦾',
    description: '아이템을 1개 이상 장착한 아군 기물들의 최대 체력이 +200, 공격력이 +20 증가합니다.',
    immediateBaseItems: ['SWORD'],
  },
  {
    id: 'AUG_BATTLE_MAGE',
    name: '전투 마법사',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'BATTLE_MAGE',
    icon: '🔥',
    description: '전방 2열(0~1행)에 배치된 아군 기물이 주문력 +35%와 방어력 +35를 얻습니다.',
    immediateBaseItems: ['ROD'],
  },
  {
    id: 'AUG_TINY_TITANS',
    name: '작은 거인',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'TINY_TITANS',
    icon: '❤️',
    description: '플레이어의 체력을 즉시 +30 회복하고 최대 체력 한도가 130으로 증가합니다.',
    immediateGold: 4,
  },
  {
    id: 'AUG_WARMUP',
    name: '준비 운동',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'WARMUP',
    icon: '⏱️',
    description: '전투 시작 후 아군 기물들이 매초 공격 속도 +3%를 영구 중첩으로 얻습니다 (최대 +45%).',
    immediateBaseItems: ['BOW'],
  },
  {
    id: 'AUG_CLEARANCE_SALE',
    name: '반값 할인',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'CLEARANCE_SALE',
    icon: '🏷️',
    description: '상점 기물 구매 시 사용할 수 있는 보조 지원금 6골드를 즉시 획득합니다.',
    immediateGold: 6,
  },
  {
    id: 'AUG_HERO_GAREN',
    name: '[영웅] 검기 투척수 가렌',
    tier: 'SILVER',
    category: 'HERO',
    effectKey: 'HERO_GAREN',
    heroUnitId: 'u1_garen',
    icon: '⚔️',
    description: '가렌을 1기 획득합니다. 근거리였던 가렌이 [사거리 4칸의 원거리 저격수]로 변신하며 공속 +0.35, 공격력 +45를 얻습니다! 스킬이 전장을 관통하는 거대 십자 칼바람으로 강화되어 2.2배의 피해를 입힙니다.',
    immediateUnitId: 'u1_garen',
    immediateGold: 2,
  },
  {
    id: 'AUG_HERO_PIP',
    name: '[영웅] 초근접 폭탄광 핍',
    tier: 'SILVER',
    category: 'HERO',
    effectKey: 'HERO_PIP',
    heroUnitId: 'u1_twitch',
    icon: '💣',
    description: '핍을 1기 획득합니다. 원거리였던 핍이 [사거리 1칸의 초근접 암살자]로 변신하여 시작 마나를 최대로 얻습니다! 모든 공격이 100% 치명타로 적중하며, 스킬이 주변 2칸 광역 연쇄 폭탄으로 강화됩니다.',
    immediateUnitId: 'u1_twitch',
    immediateGold: 2,
  },

  // ==========================================================================
  // GOLD (10종)
  // ==========================================================================
  {
    id: 'AUG_GOLDEN_TICKET',
    name: '황금 티켓',
    tier: 'GOLD',
    category: 'ECONOMY',
    effectKey: 'GOLDEN_TICKET',
    icon: '🎟️',
    description: '상점 새로고침(리롤) 시 40% 확률로 골드를 소모하지 않는 무료 리롤을 획득합니다!',
    immediateGold: 4,
  },
  {
    id: 'AUG_DIABOLIC_FINANCE',
    name: '사악한 금융',
    tier: 'GOLD',
    category: 'ECONOMY',
    effectKey: 'DIABOLIC_FINANCE',
    icon: '💰',
    description: '최대 이자 한도가 5골드(50G)에서 7골드(70G)로 증가하며, 즉시 10골드를 획득합니다.',
    immediateGold: 10,
  },
  {
    id: 'AUG_CELESTIAL_BLESSING',
    name: '천상의 축복',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'CELESTIAL_BLESSING',
    icon: '✨',
    description: '아군 전체가 모든 피해 흡혈(Omnivamp) 20%를 얻으며 초과 회복량이 최대 350의 보호막으로 전환됩니다.',
  },
  {
    id: 'AUG_HERO_JEANNE',
    name: '[영웅] 불멸의 대지 거인 잔느',
    tier: 'GOLD',
    category: 'HERO',
    effectKey: 'HERO_JEANNE',
    heroUnitId: 'u2_blitzcrank',
    icon: '🗿',
    description: '성전사 잔느 1기를 획득합니다. 불멸의 거신으로 각성하여 [전투 중 매 1초마다 최대 체력 +150, 방어력/마법저항력 +5씩 영구히 무한 성장]하며 몸집이 거대해집니다!',
    immediateUnitId: 'u2_blitzcrank',
    immediateGold: 4,
  },
  {
    id: 'AUG_HERO_ORION',
    name: '[영웅] 성운의 일제사격 오리온',
    tier: 'GOLD',
    category: 'HERO',
    effectKey: 'HERO_ORION',
    heroUnitId: 'u3_miss_fortune',
    icon: '🌠',
    description: '별자리 명궁 오리온 1기를 획득합니다. 기본 공격이 [3발의 별빛 화살로 분할되어 적 3명을 동시 타격]하며, 공격할 때마다 [공격 속도가 +6%씩 무한 중첩]됩니다!',
    immediateUnitId: 'u3_miss_fortune',
    immediateGold: 4,
  },
  {
    id: 'AUG_HERO_DRAKE',
    name: '[영웅] 무한 분노 학살자 드레이크',
    tier: 'GOLD',
    category: 'HERO',
    effectKey: 'HERO_DRAKE',
    heroUnitId: 'u3_samira',
    icon: '🩸',
    description: '적염의 용기병 드레이크 1기를 획득합니다. 드레이크가 적을 처치할 때마다 [해당 전투 동안 공격력 +40, 최대 체력 +400, 모든 피해 흡혈 +12%가 무제한 중첩 축적]됩니다!',
    immediateUnitId: 'u3_samira',
    immediateGold: 4,
  },

  {
    id: 'AUG_EMPIRE_CREST',
    name: '제국의 문장',
    tier: 'GOLD',
    category: 'TRAIT',
    effectKey: 'EMPIRE_CREST',
    icon: '🛡️',
    description: '[신성 제국] 시너지 카운트가 +1 증가하며 (8신성제국 프리즘 달성 필수!), 즉시 [성전사 잔느]와 4골드를 획득합니다.',
    bonusTrait: 'ACADEMY',
    bonusTraitCount: 1,
    immediateUnitId: 'u2_blitzcrank',
    immediateGold: 4,
  },
  {
    id: 'AUG_VANGUARD_CREST',
    name: '선봉대의 문장',
    tier: 'GOLD',
    category: 'TRAIT',
    effectKey: 'VANGUARD_CREST',
    icon: '🏰',
    description: '[선봉대] 시너지 카운트가 +1 증가하며 (8선봉대 프리즘 달성 필수!), 즉시 [숲의 수호신 엔트]와 4골드를 획득합니다.',
    bonusTrait: 'BODYGUARD',
    bonusTraitCount: 1,
    immediateUnitId: 'u2_trundle',
    immediateGold: 4,
  },
  {
    id: 'AUG_ARCHMAGE_CREST',
    name: '대마법사의 문장',
    tier: 'GOLD',
    category: 'TRAIT',
    effectKey: 'ARCHMAGE_CREST',
    icon: '⚡',
    description: '[대마법사] 시너지 카운트가 +1 증가하며 (8대마법사 프리즘 달성 필수!), 즉시 [심연 흑마법사 말리스]와 4골드를 획득합니다.',
    bonusTrait: 'ARCANIST',
    bonusTraitCount: 1,
    immediateUnitId: 'u2_swain',
    immediateGold: 4,
  },
  {
    id: 'AUG_DEMON_CREST',
    name: '심연의 문장',
    tier: 'GOLD',
    category: 'TRAIT',
    effectKey: 'DEMON_CREST',
    icon: '👿',
    description: '[심연의 악마] 시너지 카운트가 +1 증가하며 (8악마 프리즘 달성 필수!), 즉시 [심연의 사냥꾼 카일]과 4골드를 획득합니다.',
    bonusTrait: 'SYNDICATE',
    bonusTraitCount: 1,
    immediateUnitId: 'u2_kogmaw',
    immediateGold: 4,
  },

  // ==========================================================================
  // PRISMATIC (8종)
  // ==========================================================================
  {
    id: 'AUG_LEVEL_UP',
    name: '레벨 업!',
    tier: 'PRISMATIC',
    category: 'ECONOMY',
    effectKey: 'LEVEL_UP',
    icon: '🚀',
    description: '경험치 구매(4골드) 시 획득하는 경험치가 4 XP에서 7 XP로 증가하며, 즉시 12골드를 획득합니다.',
    immediateGold: 12,
  },
  {
    id: 'AUG_FATED_DUPLICATION',
    name: '운명의 복제',
    tier: 'PRISMATIC',
    category: 'ECONOMY',
    effectKey: 'FATED_DUPLICATION',
    icon: '🧬',
    description: '기물 등급에 상관없이 즉시 1성 복사본을 생성하는 [챔피언 복제기] 2개와 8골드를 획득합니다!',
    immediateDuplicators: 2,
    immediateGold: 8,
  },
  {
    id: 'AUG_HEDGE_FUND',
    name: '헤지펀드',
    tier: 'PRISMATIC',
    category: 'ECONOMY',
    effectKey: 'HEDGE_FUND',
    icon: '💎',
    description: '즉시 24골드를 획득합니다. 최대 이자 한도가 10골드(100G)까지 무제한 확장됩니다!',
    immediateGold: 24,
  },
  {
    id: 'AUG_GOLDEN_EGG',
    name: '찬란한 황금 알',
    tier: 'PRISMATIC',
    category: 'ECONOMY',
    effectKey: 'GOLDEN_EGG',
    icon: '🥚',
    description: '초호화 거대 전리품 알을 획득합니다. 즉시 16골드와 복제기 1개를 획득합니다.',
    immediateGold: 16,
    immediateDuplicators: 1,
  },
  {
    id: 'AUG_GOBLIN_CROWN',
    name: '고블린의 왕관',
    tier: 'PRISMATIC',
    category: 'TRAIT',
    effectKey: 'GOBLIN_CROWN',
    icon: '👑',
    description: '[황금 고블린] 시너지가 +1 증가하며 (7고블린 잭팟 프리즘 필수!), 즉시 [고블린 용병대장 그롬]과 6골드를 획득합니다!',
    bonusTrait: 'MERCENARY',
    bonusTraitCount: 1,
    immediateUnitId: 'u3_gangplank',
    immediateGold: 6,
  },
  {
    id: 'AUG_ARCANE_CREST',
    name: '고대 마탑의 왕관',
    tier: 'PRISMATIC',
    category: 'TRAIT',
    effectKey: 'ARCANE_CREST',
    icon: '🔮',
    description: '[마탑] 및 [대마법사] 시너지 카운트가 각각 +1씩 증가하며, 즉시 [대천사의 지팡이] 재료를 획득합니다.',
    bonusTrait: 'SCHOLAR',
    bonusTraitCount: 1,
    immediateBaseItems: ['ROD', 'TEAR'],
  },
  {
    id: 'AUG_VANGUARD_CROWN',
    name: '선봉대의 왕관',
    tier: 'PRISMATIC',
    category: 'TRAIT',
    effectKey: 'VANGUARD_CROWN',
    icon: '🏰',
    description: '[선봉대] 시너지가 +2 증가하여 난공불락의 8선봉대 프리즘을 완성합니다! 즉시 사슬 조끼 1개를 획득합니다.',
    bonusTrait: 'BODYGUARD',
    bonusTraitCount: 2,
    immediateBaseItems: ['ARMOR'],
  },
  {
    id: 'AUG_EMPIRE_CROWN',
    name: '신성 제국의 왕관',
    tier: 'PRISMATIC',
    category: 'TRAIT',
    effectKey: 'EMPIRE_CROWN',
    icon: '🛡️',
    description: '[신성 제국] 시너지가 +2 증가하여 불멸의 8신성제국 프리즘을 완성합니다! 즉시 B.F. 대검 1개를 획득합니다.',
    bonusTrait: 'ACADEMY',
    bonusTraitCount: 2,
    immediateBaseItems: ['SWORD'],
  },

  // ==========================================================================
  // TFT 시즌 18 신규 실버 증강 (SILVER AUGMENTS)
  // ==========================================================================
  {
    id: 'AUG_STAND_UNITED_1',
    name: '고단수 I',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'STAND_UNITED_1',
    icon: '🤝',
    description: '특성을 공유하는 활성 시너지 1개당 아군 전체 공격력 +2%, 주문력 +2%, 방어력 +2를 얻습니다.',
  },
  {
    id: 'AUG_REROLL_DAY',
    name: '새로고침의 날',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'REROLL_DAY',
    icon: '🔄',
    description: '무료 상점 새로고침 10회를 즉시 획득합니다!',
    freeRerollsGranted: 10,
  },
  {
    id: 'AUG_KINGSLAYER',
    name: '국왕시해자',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'KINGSLAYER',
    icon: '🗡️',
    description: '즉시 4골드를 획득합니다. 플레이어 대인 전투 승리 시마다 2골드를 추가로 약탈합니다.',
    immediateGold: 4,
  },
  {
    id: 'AUG_BOXING_LESSON',
    name: '권투 교습',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'BOXING_LESSON',
    icon: '🥊',
    description: '전방 2열(0~1행)에서 전투를 시작하는 아군 1명당 아군 전체 체력이 +60 증가합니다.',
  },
  {
    id: 'AUG_MAKE_WAY',
    name: '길을 내라',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'MAKE_WAY',
    icon: '⚔️',
    description: 'B.F. 대검 1개를 즉시 획득하며, 아군 전체 물리 공격력이 +15 증가합니다.',
    immediateBaseItems: ['SWORD'],
  },
  {
    id: 'AUG_GROUP_HUG',
    name: '단체 포옹 I',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'GROUP_HUG',
    icon: '🫂',
    description: '전투 시작 시 모든 아군 기물이 방어력 +22, 마법 저항력 +22를 얻습니다.',
  },
  {
    id: 'AUG_THIEF_GLOVES',
    name: '도둑 무리',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'THIEF_GLOVES',
    icon: '🧤',
    description: '무작위 완성 아이템 1개와 2골드를 즉시 획득합니다.',
    immediateCompletedItems: ['INFINITY_EDGE'],
    immediateGold: 2,
  },
  {
    id: 'AUG_INCOMPLETE_ASCENSION',
    name: '불완전한 초월',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'INCOMPLETE_ASCENSION',
    icon: '⏳',
    description: '전투 시작 10초 후 아군의 모든 피해량이 영구히 +22% 폭발적으로 증가합니다.',
  },
  {
    id: 'AUG_GUARDIAN_FRIEND',
    name: '수호자의 친구',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'GUARDIAN_FRIEND',
    icon: '🛡️',
    description: '무작위 2단계 챔피언 1명과 4골드를 즉시 획득합니다.',
    immediateUnitId: 'u2_kogmaw',
    immediateGold: 4,
  },
  {
    id: 'AUG_COLD_START',
    name: '시동 걸기',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'COLD_START',
    icon: '⚡',
    description: '2성 1단계 챔피언과 3골드를 즉시 획득하여 초반을 압도합니다.',
    immediateUnitId: 'u1_garen',
    immediateGold: 3,
  },
  {
    id: 'AUG_TWIN_GUARDIAN',
    name: '쌍둥이 수호자',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'TWIN_GUARDIAN',
    icon: '👥',
    description: '전방에 아군이 2명 이상일 때 해당 아군들의 체력 +220, 방어력 +25가 증가합니다.',
  },
  {
    id: 'AUG_ITEM_PACK_1',
    name: '아이템 꾸러미 I',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'ITEM_PACK_1',
    icon: '🎁',
    description: '무작위 완성 아이템 1개와 2골드를 즉시 획득합니다.',
    immediateCompletedItems: ['BRAMBLE_VEST'],
    immediateGold: 2,
  },
  {
    id: 'AUG_MYSTIC_DICE',
    name: '약간 신비한 주사위',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'MYSTIC_DICE',
    icon: '🎲',
    description: '주사위를 굴려 6골드와 기본 조합 아이템 1개를 즉시 획득합니다.',
    immediateGold: 6,
    immediateBaseItems: ['BOW'],
  },
  {
    id: 'AUG_USEFUL_METAL',
    name: '유용한 금속',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'USEFUL_METAL',
    icon: '🔩',
    description: '조합 아이템 2개(곡궁 + 사슬 조끼)와 3골드를 즉시 획득합니다.',
    immediateBaseItems: ['BOW', 'ARMOR'],
    immediateGold: 3,
  },
  {
    id: 'AUG_SILVER_DESTINY',
    name: '은빛 운명',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'SILVER_DESTINY',
    icon: '✨',
    description: '즉시 8골드와 무료 새로고침 4회를 획득합니다!',
    immediateGold: 8,
    freeRerollsGranted: 4,
  },
  {
    id: 'AUG_DAILY_LIFE',
    name: '일상물',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'DAILY_LIFE',
    icon: '☕',
    description: '즉시 4골드와 6 XP를 획득합니다.',
    immediateGold: 4,
    immediateXp: 6,
  },
  {
    id: 'AUG_CAPITAL_GAIN_1',
    name: '자본 이익 I',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'CAPITAL_GAIN_1',
    icon: '📈',
    description: '즉시 7골드를 획득하며 이자 관리에 날개를 달아줍니다.',
    immediateGold: 7,
  },
  {
    id: 'AUG_SMALL_PACK',
    name: '작은 꾸러미',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'SMALL_PACK',
    icon: '📦',
    description: '무작위 조합 아이템 2개(B.F. 대검 + 여신의 눈물)를 즉시 획득합니다.',
    immediateBaseItems: ['SWORD', 'TEAR'],
  },
  {
    id: 'AUG_PATIENCE_REWARD',
    name: '참는 자에게 복을',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'PATIENCE_REWARD',
    icon: '🧘',
    description: '즉시 무료 상점 새로고침 6회와 2골드를 획득합니다.',
    freeRerollsGranted: 6,
    immediateGold: 2,
  },
  {
    id: 'AUG_CHAMP_DELIVERY',
    name: '챔피언 배달',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'CHAMP_DELIVERY',
    icon: '🚚',
    description: '무작위 2단계 챔피언 2명과 3골드를 즉시 획득합니다.',
    immediateUnitId: 'u2_sylas',
    immediateGold: 3,
  },
  {
    id: 'AUG_CORROSION',
    name: '부식',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'CORROSION',
    icon: '🧪',
    description: '아군의 모든 공격이 적의 방어력을 영구히 20 깎아 무력화합니다.',
  },
  {
    id: 'AUG_GLASS_CANNON',
    name: '유리 대포',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'GLASS_CANNON',
    icon: '💥',
    description: '후방 2열에 배치된 아군 기물이 공격력/주문력 +28%를 얻지만 최대 체력이 80 감소합니다.',
  },
  {
    id: 'AUG_SILVER_SPOON',
    name: '은수저',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'SILVER_SPOON',
    icon: '🥄',
    description: '즉시 10 XP를 획득하여 다음 레벨로 신속하게 도약합니다.',
    immediateXp: 10,
  },
  {
    id: 'AUG_MAKESHIFT_ARMOR',
    name: '임시변통 방어구',
    tier: 'SILVER',
    category: 'COMBAT',
    effectKey: 'MAKESHIFT_ARMOR',
    icon: '🛡️',
    description: '아이템을 장착하지 않은 아군 기물이 방어력 +40, 마법 저항력 +40을 얻습니다.',
  },
  {
    id: 'AUG_CALCULATED_LOSS',
    name: '계산된 패배',
    tier: 'SILVER',
    category: 'ECONOMY',
    effectKey: 'CALCULATED_LOSS',
    icon: '📉',
    description: '전투 패배 시 2골드와 무료 새로고침 1회를 추가로 얻습니다. 즉시 3골드를 획득합니다.',
    immediateGold: 3,
  },

  // ==========================================================================
  // TFT 시즌 18 신규 골드 증강 (GOLD AUGMENTS)
  // ==========================================================================
  {
    id: 'AUG_TRADE_SECTOR',
    name: '거래 중심지',
    tier: 'GOLD',
    category: 'ECONOMY',
    effectKey: 'TRADE_SECTOR',
    icon: '🏛️',
    description: '매 라운드 시작 시 무료 상점 새로고침 1회를 획득합니다. 즉시 4골드를 획득합니다.',
    immediateGold: 4,
    freeRerollsGranted: 2,
  },
  {
    id: 'AUG_JEWELED_LOTUS',
    name: '보석 연꽃',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'JEWELED_LOTUS',
    icon: '🪷',
    description: '아군 기물의 모든 스킬에 치명타가 적용될 수 있으며, 팀 전체 치명타 확률이 +25% 증가합니다!',
  },
  {
    id: 'AUG_HYPER_ROLL',
    name: '초고속 리롤',
    tier: 'GOLD',
    category: 'ECONOMY',
    effectKey: 'HYPER_ROLL',
    icon: '⚡',
    description: '보유 골드가 10골드 이하일 때 라운드 시작 시 3골드를 지원받습니다. 즉시 5골드를 획득합니다.',
    immediateGold: 5,
  },
  {
    id: 'AUG_GOLDEN_SCALPEL',
    name: '황금 메스',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'GOLDEN_SCALPEL',
    icon: '🔪',
    description: '치명타 피해량이 +35% 증가하며 적 처치 시 35% 확률로 1골드를 약탈합니다.',
  },
  {
    id: 'AUG_RICH_GET_RICHER',
    name: '부익부',
    tier: 'GOLD',
    category: 'ECONOMY',
    effectKey: 'RICH_GET_RICHER',
    icon: '💰',
    description: '최대 이자 상한이 7골드(보유 70G 시)로 증가합니다. 즉시 14골드를 획득합니다!',
    immediateGold: 14,
  },
  {
    id: 'AUG_LAST_STAND',
    name: '최후의 저항',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'LAST_STAND',
    icon: '🚩',
    description: '체력이 0이 되는 첫 탈락 위기 시 체력 1로 생존하고, 모든 아군이 영구히 공격력/주문력 +30%를 얻습니다!',
  },
  {
    id: 'AUG_METEORIC_IMPACT',
    name: '유성 낙하',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'METEORIC_IMPACT',
    icon: '☄️',
    description: '전투 개전 5초 후 적 전체 진영에 거대 유성이 낙하하여 최대 체력의 16% 광역 마법 피해를 입힙니다.',
  },
  {
    id: 'AUG_REIGN_OF_CHAOS',
    name: '혼돈의 지배',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'REIGN_OF_CHAOS',
    icon: '🔮',
    description: '무작위 완성 아이템 2개와 6골드를 즉시 획득합니다!',
    immediateCompletedItems: ['GUINSOOS_RAGEBLADE', 'SUNFIRE_CAPE'],
    immediateGold: 6,
  },
  {
    id: 'AUG_TACTICAL_RETREAT',
    name: '전술적 후퇴',
    tier: 'GOLD',
    category: 'ECONOMY',
    effectKey: 'TACTICAL_RETREAT',
    icon: '🛡️',
    description: '연패 골드가 1.5배 증가하며 즉시 9골드를 획득합니다.',
    immediateGold: 9,
  },
  {
    id: 'AUG_OVERFLOWING_BLADE',
    name: '넘치는 대검',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'OVERFLOWING_BLADE',
    icon: '🗡️',
    description: 'B.F. 대검 2개와 3코스트 기물 1명을 즉시 획득합니다.',
    immediateBaseItems: ['SWORD', 'SWORD'],
    immediateUnitId: 'u3_samira',
  },
  {
    id: 'AUG_OVERFLOWING_ROD',
    name: '넘치는 지팡이',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'OVERFLOWING_ROD',
    icon: '🪄',
    description: '쓸데없이 큰 지팡이 2개와 3코스트 기물 1명을 즉시 획득합니다.',
    immediateBaseItems: ['ROD', 'ROD'],
    immediateUnitId: 'u3_malzahar',
  },
  {
    id: 'AUG_OVERFLOWING_BELT',
    name: '넘치는 갑옷',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'OVERFLOWING_BELT',
    icon: '🛡️',
    description: '사슬 조끼 2개와 3코스트 기물 1명을 즉시 획득합니다.',
    immediateBaseItems: ['ARMOR', 'ARMOR'],
    immediateUnitId: 'u3_miss_fortune',
  },
  {
    id: 'AUG_HEROIC_INSPIRATION',
    name: '영웅적 영감',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'HEROIC_INSPIRATION',
    icon: '🌟',
    description: '아군 3성 기물 1개당 아군 전체 피해량이 +12%씩 곱연산으로 중첩 증가합니다.',
  },
  {
    id: 'AUG_TITANIC_FORCE',
    name: '거인의 힘',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'TITANIC_FORCE',
    icon: '🗿',
    description: '최대 체력이 1,500 이상인 아군 기물들의 공격력이 +35% 폭발적으로 증가합니다.',
  },
  {
    id: 'AUG_WARP_DRIVE',
    name: '차원 왜곡 도약',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'WARP_DRIVE',
    icon: '🌌',
    description: '전투 개전 시 모든 암살자 및 후열 딜러 기물이 시작 마나 +35를 즉시 얻고 스킬을 난사합니다.',
  },
  {
    id: 'AUG_HERO_MALAKOR',
    name: '[영웅] 파멸의 영혼 군주',
    tier: 'GOLD',
    category: 'HERO',
    effectKey: 'HERO_MALAKOR',
    icon: '💀',
    heroUnitId: 'u3_malzahar',
    description:
      '말라코르가 주문력 +50%를 얻고 개전 즉시 마나를 100% 충전하여 궁극기를 시전하며, 적 전체의 치유를 60% 차단하고 마나를 6씩 강탈합니다!',
    immediateUnitId: 'u3_malzahar',
    immediateGold: 4,
  },
  {
    id: 'AUG_MARTIAL_TRAINING',
    name: '무술 훈련',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'MARTIAL_TRAINING',
    icon: '🥋',
    description: '아군 기물 전체가 공격력 +25, 공격 속도 +0.15를 얻습니다.',
  },
  {
    id: 'AUG_ASCENSION',
    name: '상승',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'ASCENSION',
    icon: '☀️',
    description: '전투 시작 10초 후 아군 전체 공격력과 주문력이 +30% 폭발적으로 상승합니다.',
  },
  {
    id: 'AUG_STAND_UNITED',
    name: '단결된 힘',
    tier: 'GOLD',
    category: 'COMBAT',
    effectKey: 'STAND_UNITED',
    icon: '🛡️',
    description: '활성화된 시너지 종류 1개당 아군 전체 공격력 +6, 주문력 +6%를 얻습니다.',
  },

  // ==========================================================================
  // TFT 시즌 18 신규 프리즘 증강 (PRISMATIC AUGMENTS)
  // ==========================================================================
  {
    id: 'AUG_PRISMATIC_TICKET',
    name: '프리즘 티켓',
    tier: 'PRISMATIC',
    category: 'ECONOMY',
    effectKey: 'PRISMATIC_TICKET',
    icon: '🎫',
    description: '상점을 새로고침할 때마다 55% 확률로 무료 새로고침을 획득합니다! 무한 리롤의 기적!',
  },
  {
    id: 'AUG_MONEY_STORM',
    name: '돈 폭풍',
    tier: 'PRISMATIC',
    category: 'ECONOMY',
    effectKey: 'MONEY_STORM',
    icon: '🌪️',
    description: '즉시 36골드를 획득하여 경제를 단숨에 장악합니다!',
    immediateGold: 36,
  },
  {
    id: 'AUG_ARCANE_VICTORY',
    name: '아케인 빅토리!',
    tier: 'PRISMATIC',
    category: 'COMBAT',
    effectKey: 'ARCANE_VICTORY',
    icon: '⚡',
    description: '전투 개전 8초 후 전장의 모든 적에게 벼락이 내리쳐 최대 체력의 20% 마법 피해를 입히고, 2.5초간 기절시키며 현재 마나를 0으로 증발시킵니다!',
  },
  {
    id: 'AUG_CORONATION',
    name: '대관식',
    tier: 'PRISMATIC',
    category: 'COMBAT',
    effectKey: 'CORONATION',
    icon: '👑',
    description: '최대 팀 출전 인구수(슬롯)가 +1 영구 증가하며, 즉시 8골드를 획득합니다!',
    immediateGold: 8,
  },
  {
    id: 'AUG_BIRTHDAY_PRESENT',
    name: '생일 선물',
    tier: 'PRISMATIC',
    category: 'ECONOMY',
    effectKey: 'BIRTHDAY_PRESENT',
    icon: '🎂',
    description: '레벨 업할 때마다 2성 기물 1개와 6골드를 선물받습니다. 즉시 10골드를 획득합니다!',
    immediateGold: 10,
  },
  {
    id: 'AUG_RADIANT_RELICS',
    name: '찬란한 유물',
    tier: 'PRISMATIC',
    category: 'COMBAT',
    effectKey: 'RADIANT_RELICS',
    icon: '💎',
    description: '무작위 완성 아이템 3개와 10골드를 즉시 획득합니다!',
    immediateCompletedItems: ['INFINITY_EDGE', 'RABADONS_DEATHCAP', 'TITANS_RESOLVE'],
    immediateGold: 10,
  },
  {
    id: 'AUG_LIVING_FORGE',
    name: '살아있는 대장간',
    tier: 'PRISMATIC',
    category: 'COMBAT',
    effectKey: 'LIVING_FORGE',
    icon: '🔨',
    description: '즉시 완성 아이템 2개와 조합 아이템 2개를 획득합니다!',
    immediateCompletedItems: ['BLOODTHIRSTER', 'PROTECTORS_VOW'],
    immediateBaseItems: ['SWORD', 'ARMOR'],
  },
  {
    id: 'AUG_CURSED_CROWN',
    name: '저주받은 왕관',
    tier: 'PRISMATIC',
    category: 'COMBAT',
    effectKey: 'CURSED_CROWN',
    icon: '👑',
    description: '최대 팀 출전 인구수(슬롯)가 +2 증가하지만, 플레이어 패배 시 입는 피해량이 100% 증가합니다!',
  },
  {
    id: 'AUG_FINAL_ASCENSION',
    name: '궁극의 초월',
    tier: 'PRISMATIC',
    category: 'COMBAT',
    effectKey: 'FINAL_ASCENSION',
    icon: '☀️',
    description: '전투 개전 12초 후 모든 아군의 피해량이 +80% 폭발적으로 증가하여 전장을 쓸어버립니다!',
  },
  {
    id: 'AUG_SHADOW_CLONE',
    name: '그림자 분신',
    tier: 'PRISMATIC',
    category: 'COMBAT',
    effectKey: 'SHADOW_CLONE',
    icon: '👥',
    description: '전투 개전 시 팀에서 가장 공격력이 높은 아군 1명의 복제 분신(체력 70%)을 소환하여 함께 싸웁니다!',
  },
];

