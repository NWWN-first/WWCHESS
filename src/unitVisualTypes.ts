// Set 6 unit dot-sprite archetypes (no legacy fantasy roster ids).

export type WeaponKind =
  | 'GREATSWORD'
  | 'SWORD_SHIELD'
  | 'DUAL_DAGGERS'
  | 'BOW'
  | 'ARCANE_STAFF'
  | 'NATURE_STAFF'
  | 'SCYTHE'
  | 'DRAGON_CLAW'
  | 'SPEAR'
  | 'CANNON_BAG'
  | 'HOLY_BLADE'
  | 'ARCANE_ORB';

export type HeadgearKind =
  | 'KNIGHT_HELM'
  | 'CROWN'
  | 'HOOD'
  | 'ELVEN_CIRCLET'
  | 'SKULL'
  | 'WIZARD_HAT'
  | 'DEMON_HORNS'
  | 'DRAGON_HORNS'
  | 'HALO_HELM'
  | 'GOBLIN_EARS'
  | 'GOLEM_CORE';

export type WingKind = 'NONE' | 'ANGEL_WINGS' | 'DRAGON_WINGS' | 'DEMON_WINGS' | 'CAPE';

export interface UnitPixelArtSpec {
  primaryArmor: string;
  secondaryArmor: string;
  trimGold: string;
  skinOrFace: string;
  eyeGlow: string;
  weaponColor: string;
  weaponGlow: string;
  headgear: HeadgearKind;
  weapon: WeaponKind;
  wings: WingKind;
}