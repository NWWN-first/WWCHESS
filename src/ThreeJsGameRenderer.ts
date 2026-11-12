// src/ThreeJsGameRenderer.ts
/**
 * Three.js 3D WebGL Low-Poly Fantasy Auto-Battler Renderer (Style A - TFT 3D).
 * Features:
 * - 6 distinct low-poly champion archetypes (Warrior, Mage, Rogue, Ranger, Brawler, Beast/Golem)
 * - Distinct signature 3D weapons & equipment (Shields, Swords, Glowing Arcane Staves, Dual Daggers, Bows, Spiked Gauntlets, Claws/Horns)
 * - 3D Combat Juice: Melee attack lunges & weapon swings, assassin parabolic leaps, hit flashes
 * - 3D Projectiles: Arcing curved arrows and glowing magical arcane orbs with impact sparks
 * - 3D Overhead Billboards: Camera-facing real-time HP & Mana bars with star indicators
 * - 3D Floating Combat Popups: Floating damage numbers, critical hits, heal & shield popups
 * - TFT-style 3D perspective camera, dynamic directional shadows, and extruded 3D hex arena.
 */

import * as THREE from 'three';
import {
  CostTier,
  ItemId,
  StarLevel,
  UNIT_TEMPLATES,
  TraitId,
} from './GameData';
import { HexCoord } from './HexGridMath';
import { Participant } from './Participant';
import { CombatEvent, CombatUnit } from './SkillRegistry';

export type ChampionArchetype =
  | 'WARRIOR'      // 선봉대, 성기사 (검 + 방패 / 플레이트 아머)
  | 'MAGE'         // 대마법사, 비전탑 (뾰족 고깔 모자 + 룬 지팡이)
  | 'ROGUE'        // 그림자 암살자, 고블린 (닌자 후드 + 쌍단검)
  | 'RANGER'       // 순찰자, 엘프 (깃털 캡 + 장궁 + 화살통)
  | 'BRAWLER'      // 광전사, 버서커 (헤드밴드 + 스파이크 헤비 건틀릿)
  | 'BEAST_GOLEM'; // 용족, 언데드 괴수, 크립 몬스터 (거대 뿔 + 바위 어깨 + 흑요석 발톱)

export interface RenderState3D {
  inCombat: boolean;
  viewedParticipant: Participant;
  combatUnits: CombatUnit[];
  hoveredHex: HexCoord | null;
  hoveredBenchIndex: number | null;
  isDraggingUnit: boolean;
  draggedInstanceId: string | null;
  selectedInstanceId: string | null;
  hasPandoraBench: boolean;
  opponentName: string;
  isCreepMatch: boolean;
}

interface UnitJuice3D {
  facingY: number;
  lungeTimerMs: number;
  lungeMaxMs: number;
  lungeDirX: number;
  lungeDirZ: number;
  swingAngle: number;
  hitFlashTimerMs: number;
  leapProgress: number; // 0 to 1
  leapStartPos: THREE.Vector3;
  leapTargetPos: THREE.Vector3;
}

interface Active3DProjectile {
  mesh: THREE.Group;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  elapsedMs: number;
  durationMs: number;
  arcHeight: number;
  kind: 'ARROW' | 'MAGIC_ORB';
}

interface Active3DPopup {
  sprite: THREE.Sprite;
  startPos: THREE.Vector3;
  elapsedMs: number;
  durationMs: number;
  riseSpeed: number;
}

interface Active3DSpark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  lifeMs: number;
  maxLifeMs: number;
}

export class ThreeJsGameRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;

  // 3D 전장 메트릭 (World Space)
  public readonly hexRadius: number = 1.15;
  public readonly hexWidth: number = Math.sqrt(3) * 1.15; // ~1.99
  public readonly rowStepZ: number = 1.5 * 1.15; // 1.725
  public readonly benchZ: number = 4 * 1.725 + 2.2;

  // 3D 씬 계층 구조
  private boardGroup: THREE.Group = new THREE.Group();
  private benchGroup: THREE.Group = new THREE.Group();
  private unitsGroup: THREE.Group = new THREE.Group();
  private projectilesGroup: THREE.Group = new THREE.Group();
  private popupsGroup: THREE.Group = new THREE.Group();
  private vfxGroup: THREE.Group = new THREE.Group();

  // 타일 메시 캐시
  private hexTileMeshes: Map<string, THREE.Mesh> = new Map();
  private benchTileMeshes: Map<number, THREE.Mesh> = new Map();

  // 유닛 3D 메시 및 쥬스 상태
  private unitMeshesMap: Map<string, THREE.Group> = new Map();
  private unitJuiceMap: Map<string, UnitJuice3D> = new Map();

  // 활성 투사체 및 팝업 텍스트
  private activeProjectiles: Active3DProjectile[] = [];
  private activePopups: Active3DPopup[] = [];
  private activeSparks: Active3DSpark[] = [];

  // 조명
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;

  // 카메라 쉐이크 & 시간
  private shakeRemainingMs: number = 0;
  private shakeIntensity: number = 0;
  private animClockMs: number = 0;

  // 3D 레이캐스터
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouseVec: THREE.Vector2 = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a14);
    this.scene.fog = new THREE.FogExp2(0x070a14, 0.022);

    // 1. TFT 쿼터뷰 3D 카메라 설정
    const aspect = (window.innerWidth || 800) / (window.innerHeight || 600);
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 120);
    this.camera.position.set(0, 16.5, 20.5);
    this.camera.lookAt(0, -0.5, 1.2);

    // 2. WebGL 렌더러
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth || 800, window.innerHeight || 600);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. 다크 판타지 전장 조명
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e1b4b, 1.35);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    this.dirLight.position.set(10, 24, 14);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 60;
    this.dirLight.shadow.camera.left = -15;
    this.dirLight.shadow.camera.right = 15;
    this.dirLight.shadow.camera.top = 15;
    this.dirLight.shadow.camera.bottom = -15;
    this.dirLight.shadow.bias = -0.0006;
    this.scene.add(this.dirLight);

    const blueRimLight = new THREE.PointLight(0x38bdf8, 2.5, 25);
    blueRimLight.position.set(-14, 8, -6);
    this.scene.add(blueRimLight);

    const goldRimLight = new THREE.PointLight(0xfacc15, 2.2, 25);
    goldRimLight.position.set(14, 8, 8);
    this.scene.add(goldRimLight);

    this.scene.add(this.boardGroup);
    this.scene.add(this.benchGroup);
    this.scene.add(this.unitsGroup);
    this.scene.add(this.projectilesGroup);
    this.scene.add(this.popupsGroup);
    this.scene.add(this.vfxGroup);

    this.build3DHexArena();
    this.build3DStoneBench();
    this.buildBattlefieldSurroundings();
  }

  /**
   * 유닛 템플릿 정보 및 특성을 분석하여 6가지 아키타입 중 하나로 매핑
   */
  public getChampionArchetype(unitId: string): ChampionArchetype {
    if (unitId.startsWith('creep_')) {
      return 'BEAST_GOLEM';
    }

    const tpl = UNIT_TEMPLATES[unitId];
    if (!tpl) {
      return 'WARRIOR';
    }

    const traits = tpl.traits || [];
    const range = tpl.stats?.range ?? 1;

    // 1. 순찰자 / 엘프 궁수 계열
    if (traits.includes('RANGER') || range >= 4) {
      return 'RANGER';
    }

    // 2. 대마법사 / 비전탑 계열
    if (
      traits.includes('ARCHMAGE') ||
      traits.includes('ARCANE_TOWER') ||
      range >= 3
    ) {
      return 'MAGE';
    }

    // 3. 그림자 암살자 계열
    if (traits.includes('SHADOW_ASSASSIN') || traits.includes('GOLDEN_GOBLIN')) {
      return 'ROGUE';
    }

    // 4. 용족 / 대형 괴물 계열
    if (
      traits.includes('DRAGONKIN') ||
      unitId.includes('dragon') ||
      unitId.includes('golem')
    ) {
      return 'BEAST_GOLEM';
    }

    // 5. 광전사 / 격투가 계열
    if (traits.includes('BERSERKER')) {
      return 'BRAWLER';
    }

    // 6. 선봉대 / 성기사 / 신성제국 기본 전사
    return 'WARRIOR';
  }

  /**
   * 8x7 입체 3D 헥사곤 전장 타일 생성
   */
  private build3DHexArena(): void {
    const tileGeo = new THREE.CylinderGeometry(
      this.hexRadius,
      this.hexRadius * 0.96,
      0.36,
      6
    );

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 7; c++) {
        const isAway = r < 4;
        const color = isAway
          ? (r + c) % 2 === 0
            ? 0x221c35
            : 0x1a1528
          : (r + c) % 2 === 0
          ? 0x1e293b
          : 0x0f172a;

        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.65,
          metalness: 0.25,
          flatShading: true,
        });

        const mesh = new THREE.Mesh(tileGeo, mat);
        mesh.rotation.y = Math.PI / 6;
        mesh.receiveShadow = true;

        const pos = this.hexToWorldPos(r, c);
        mesh.position.set(pos.x, 0, pos.z);
        mesh.userData = { type: 'HEX', row: r, col: c, originalColor: color };

        const key = `${r},${c}`;
        this.hexTileMeshes.set(key, mesh);
        this.boardGroup.add(mesh);

        // 타일 테두리 미세 발광 와이어프레임
        const edgeGeo = new THREE.EdgesGeometry(tileGeo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: isAway ? 0x6b21a8 : 0x0284c7,
          transparent: true,
          opacity: 0.45,
        });
        const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLine.rotation.y = Math.PI / 6;
        edgeLine.position.set(pos.x, 0.01, pos.z);
        this.boardGroup.add(edgeLine);
      }
    }
  }

  /**
   * 하단 1x9 입체 석조 대기석(Bench) 단상 생성
   */
  private build3DStoneBench(): void {
    const slotGeo = new THREE.BoxGeometry(1.65, 0.32, 1.65);
    const benchBaseGeo = new THREE.BoxGeometry(17.5, 0.25, 2.2);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1d,
      roughness: 0.8,
      metalness: 0.2,
    });
    const baseMesh = new THREE.Mesh(benchBaseGeo, baseMat);
    baseMesh.position.set(0, -0.08, this.benchZ);
    baseMesh.receiveShadow = true;
    this.benchGroup.add(baseMesh);

    for (let i = 0; i < 9; i++) {
      const slotMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x172554 : 0x0f172a,
        roughness: 0.6,
        metalness: 0.3,
      });

      const slot = new THREE.Mesh(slotGeo, slotMat);
      const slotX = (i - 4) * 1.85;
      slot.position.set(slotX, 0.05, this.benchZ);
      slot.receiveShadow = true;
      slot.userData = { type: 'BENCH', index: i, originalColor: slotMat.color.getHex() };

      this.benchTileMeshes.set(i, slot);
      this.benchGroup.add(slot);

      const edgeGeo = new THREE.EdgesGeometry(slotGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.35,
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.position.set(slotX, 0.06, this.benchZ);
      this.benchGroup.add(edges);
    }
  }

  /**
   * 경기장 주변 환경 (판타지 부유석 콜로세움 배경)
   */
  private buildBattlefieldSurroundings(): void {
    const groundGeo = new THREE.CylinderGeometry(24, 26, 1.2, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x05070e,
      roughness: 0.95,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -0.75, 1.5);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 공중에 떠 있는 룬 수정 기둥 4개
    const pylonGeo = new THREE.OctahedronGeometry(1.2, 0);
    const pylonColors = [0x38bdf8, 0x818cf8, 0xfacc15, 0x34d399];
    const pylonPositions = [
      [-13, 3.5, -9],
      [13, 3.5, -9],
      [-14, 3.5, 9],
      [14, 3.5, 9],
    ];

    pylonPositions.forEach((pos, idx) => {
      const mat = new THREE.MeshStandardMaterial({
        color: pylonColors[idx],
        emissive: pylonColors[idx],
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.8,
      });
      const pylon = new THREE.Mesh(pylonGeo, mat);
      pylon.position.set(pos[0], pos[1], pos[2]);
      this.scene.add(pylon);
    });
  }

  /**
   * 2D HexCoord (row, col) -> 3D World Position (X, Z)
   */
  public hexToWorldPos(row: number, col: number): { x: number; z: number } {
    const isOdd = row % 2 === 1;
    const offsetX = isOdd ? this.hexWidth * 0.5 : 0;
    const x = (col - 3) * this.hexWidth + offsetX;
    const z = (row - 3.5) * this.rowStepZ;
    return { x, z };
  }

  /**
   * 1x9 대기석 인덱스 -> 3D World Position
   */
  public benchIndexToWorldPos(index: number): { x: number; z: number } {
    const x = (index - 4) * 1.85;
    return { x, z: this.benchZ };
  }

  /**
   * 화면 2D 터치 좌표 -> 3D 헥사곤 / 대기석 타일 레이캐스팅 검출
   */
  public screenPointTo3DTarget(
    clientX: number,
    clientY: number
  ): { kind: 'HEX'; row: number; col: number } | { kind: 'BENCH'; index: number } | null {
    this.mouseVec.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouseVec.y = -(clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const allMeshes = [
      ...Array.from(this.hexTileMeshes.values()),
      ...Array.from(this.benchTileMeshes.values()),
    ];

    const intersects = this.raycaster.intersectObjects(allMeshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData.type === 'HEX') {
        return { kind: 'HEX', row: hit.userData.row, col: hit.userData.col };
      }
      if (hit.userData.type === 'BENCH') {
        return { kind: 'BENCH', index: hit.userData.index };
      }
    }
    return null;
  }

  /**
   * 6대 로우폴리 3D 챔피언 아키타입별 메시 생성 빌더
   */
  public create3DChampionMesh(
    unitId: string,
    cost: CostTier,
    starLevel: StarLevel
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `UNIT_${unitId}`;
    const archetype = this.getChampionArchetype(unitId);

    // 코스트별 팔레트 색상
    const costColors: Record<CostTier, { primary: number; trim: number; emissive: number }> = {
      1: { primary: 0x94a3b8, trim: 0x475569, emissive: 0x334155 }, // 실버 아이언
      2: { primary: 0x10b981, trim: 0x065f46, emissive: 0x047857 }, // 에메랄드
      3: { primary: 0x38bdf8, trim: 0x0369a1, emissive: 0x0284c7 }, // 사파이어
      4: { primary: 0xc084fc, trim: 0x6b21a8, emissive: 0x9333ea }, // 자수정
      5: { primary: 0xfacc15, trim: 0xb45309, emissive: 0xeab308 }, // 황금/신화
    };
    const palette = costColors[cost] || costColors[1];

    // 성급 스케일 (1성: 1.0배, 2성: 1.25배, 3성: 1.55배)
    const scale = starLevel === 3 ? 1.55 : starLevel === 2 ? 1.25 : 1.0;

    // 유닛 루트 바디 그룹 (애니메이션 틸트용)
    const bodyRoot = new THREE.Group();
    bodyRoot.name = 'BODY_ROOT';
    group.add(bodyRoot);

    // 오른손 무기 그룹 (스윙 애니메이션 타겟)
    const weaponRight = new THREE.Group();
    weaponRight.name = 'WEAPON_RIGHT';

    // 왼손 보조 장비 그룹
    const weaponLeft = new THREE.Group();
    weaponLeft.name = 'WEAPON_LEFT';

    // -------------------------------------------------------------
    // 아키타입별 디테일 로우폴리 메시 분기 생성
    // -------------------------------------------------------------
    switch (archetype) {
      // 1. WARRIOR (선봉대, 성기사): 판금 흉갑, 투구 바이저, 견갑, 검 + 방패
      case 'WARRIOR': {
        // 몸통 판금 흉갑
        const chestGeo = new THREE.BoxGeometry(0.8, 0.95, 0.55);
        const chestMat = new THREE.MeshStandardMaterial({
          color: palette.primary,
          roughness: 0.35,
          metalness: 0.75,
        });
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.y = 0.95;
        chest.castShadow = true;
        bodyRoot.add(chest);

        // 투구 & 바이저
        const helmGeo = new THREE.BoxGeometry(0.62, 0.62, 0.62);
        const helmMat = new THREE.MeshStandardMaterial({
          color: palette.trim,
          roughness: 0.3,
          metalness: 0.8,
        });
        const helm = new THREE.Mesh(helmGeo, helmMat);
        helm.position.y = 1.7;
        helm.castShadow = true;
        bodyRoot.add(helm);

        // 투구 슬릿 (발광 바이저)
        const visorGeo = new THREE.BoxGeometry(0.52, 0.14, 0.64);
        const visorMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: palette.emissive,
          emissiveIntensity: 0.8,
        });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 1.7, 0.05);
        bodyRoot.add(visor);

        // 양 어깨 플레이트 견갑
        const pauldronGeo = new THREE.BoxGeometry(0.38, 0.38, 0.48);
        const pauldronMat = new THREE.MeshStandardMaterial({
          color: palette.trim,
          metalness: 0.8,
          roughness: 0.3,
        });
        const leftP = new THREE.Mesh(pauldronGeo, pauldronMat);
        leftP.position.set(-0.58, 1.35, 0);
        const rightP = new THREE.Mesh(pauldronGeo, pauldronMat);
        rightP.position.set(0.58, 1.35, 0);
        bodyRoot.add(leftP);
        bodyRoot.add(rightP);

        // [오른손] 기사의 롱소드
        const swordBladeGeo = new THREE.BoxGeometry(0.16, 1.45, 0.06);
        const swordMat = new THREE.MeshStandardMaterial({
          color: 0xf1f5f9,
          emissive: palette.emissive,
          emissiveIntensity: 0.4,
          metalness: 0.95,
          roughness: 0.15,
        });
        const swordBlade = new THREE.Mesh(swordBladeGeo, swordMat);
        swordBlade.position.y = 0.65;
        weaponRight.add(swordBlade);

        const swordGuardGeo = new THREE.BoxGeometry(0.55, 0.08, 0.12);
        const guardMat = new THREE.MeshStandardMaterial({ color: palette.trim, metalness: 0.8 });
        const guard = new THREE.Mesh(swordGuardGeo, guardMat);
        weaponRight.add(guard);

        weaponRight.position.set(0.65, 0.9, 0.2);
        weaponRight.rotation.x = Math.PI / 10;
        bodyRoot.add(weaponRight);

        // [왼손] 기사의 방패 (Kite Shield)
        const shieldGeo = new THREE.BoxGeometry(0.55, 0.85, 0.1);
        const shieldMat = new THREE.MeshStandardMaterial({
          color: palette.primary,
          metalness: 0.7,
          roughness: 0.3,
        });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.set(-0.65, 0.95, 0.25);
        shield.rotation.y = Math.PI / 8;
        bodyRoot.add(shield);
        break;
      }

      // 2. MAGE (대마법사, 비전탑): 로브 치마단, 마법사 뾰족 고깔 모자, 룬 지팡이 + 마법 구체
      case 'MAGE': {
        // 상의 로브
        const chestGeo = new THREE.BoxGeometry(0.7, 0.9, 0.5);
        const chestMat = new THREE.MeshStandardMaterial({
          color: palette.trim,
          roughness: 0.6,
          metalness: 0.2,
        });
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.y = 0.95;
        bodyRoot.add(chest);

        // 하의 긴 로브 (Skirt Cone/Cylinder)
        const skirtGeo = new THREE.CylinderGeometry(0.38, 0.62, 0.85, 8);
        const skirtMat = new THREE.MeshStandardMaterial({
          color: palette.primary,
          roughness: 0.5,
          metalness: 0.2,
        });
        const skirt = new THREE.Mesh(skirtGeo, skirtMat);
        skirt.position.y = 0.42;
        bodyRoot.add(skirt);

        // 머리
        const headGeo = new THREE.BoxGeometry(0.54, 0.54, 0.54);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xfef08a });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.65;
        bodyRoot.add(head);

        // 마법사 뾰족 모자 (Wizard Cone Hat)
        const hatBrimGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.08, 12);
        const hatMat = new THREE.MeshStandardMaterial({
          color: palette.trim,
          roughness: 0.4,
          metalness: 0.4,
        });
        const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
        hatBrim.position.y = 1.95;
        bodyRoot.add(hatBrim);

        const hatConeGeo = new THREE.ConeGeometry(0.48, 1.1, 8);
        const hatCone = new THREE.Mesh(hatConeGeo, hatMat);
        hatCone.position.set(0, 2.45, -0.05);
        hatCone.rotation.x = -Math.PI / 14;
        bodyRoot.add(hatCone);

        // [오른손] 룬 지팡이 (Staff)
        const staffPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
        const pole = new THREE.Mesh(staffPoleGeo, poleMat);
        pole.position.y = 0.8;
        weaponRight.add(pole);

        // 지팡이 끝에 회전하며 빛나는 아케인 보주 (Orb)
        const orbGeo = new THREE.OctahedronGeometry(0.24, 0);
        const orbMat = new THREE.MeshStandardMaterial({
          color: palette.emissive,
          emissive: palette.emissive,
          emissiveIntensity: 1.2,
          roughness: 0.2,
          metalness: 0.9,
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.y = 1.75;
        orb.name = 'MAGE_ORB';
        weaponRight.add(orb);

        weaponRight.position.set(0.62, 0.7, 0.2);
        weaponRight.rotation.x = -Math.PI / 12;
        bodyRoot.add(weaponRight);
        break;
      }

      // 3. ROGUE (그림자 암살자, 고블린): 닌자 후드/마스크, 슬림 가죽 조끼, 쌍단검 (Dual Daggers)
      case 'ROGUE': {
        // 슬림 몸통
        const chestGeo = new THREE.BoxGeometry(0.65, 0.85, 0.45);
        const chestMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.7,
          metalness: 0.3,
        });
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.y = 0.88;
        bodyRoot.add(chest);

        // 암살자 머리 & 후드 (Ninja Hood)
        const hoodGeo = new THREE.BoxGeometry(0.64, 0.64, 0.64);
        const hoodMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.5,
          metalness: 0.4,
        });
        const hood = new THREE.Mesh(hoodGeo, hoodMat);
        hood.position.y = 1.62;
        bodyRoot.add(hood);

        // 눈가 발광 마스크
        const maskGeo = new THREE.BoxGeometry(0.5, 0.12, 0.68);
        const maskMat = new THREE.MeshStandardMaterial({
          color: palette.emissive,
          emissive: palette.emissive,
          emissiveIntensity: 0.9,
        });
        const mask = new THREE.Mesh(maskGeo, maskMat);
        mask.position.set(0, 1.62, 0.05);
        bodyRoot.add(mask);

        // [오른손 & 왼손] 날렵한 역수 쌍단검 (Dual Daggers)
        const daggerGeo = new THREE.BoxGeometry(0.1, 0.85, 0.05);
        const daggerMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          emissive: palette.emissive,
          emissiveIntensity: 0.5,
          metalness: 0.9,
          roughness: 0.2,
        });

        // 오른손 단검
        const d1 = new THREE.Mesh(daggerGeo, daggerMat);
        d1.position.y = -0.25; // 역수 그립
        weaponRight.add(d1);
        weaponRight.position.set(0.55, 0.85, 0.2);
        weaponRight.rotation.x = Math.PI / 4;
        bodyRoot.add(weaponRight);

        // 왼손 단검
        const d2 = new THREE.Mesh(daggerGeo, daggerMat);
        d2.position.y = -0.25;
        weaponLeft.add(d2);
        weaponLeft.position.set(-0.55, 0.85, 0.2);
        weaponLeft.rotation.x = Math.PI / 4;
        bodyRoot.add(weaponLeft);
        break;
      }

      // 4. RANGER (순찰자, 엘프 궁수): 깃털 모자, 등 뒤 화살통, 곡선 장궁 (Longbow)
      case 'RANGER': {
        // 날렵한 경갑
        const chestGeo = new THREE.BoxGeometry(0.68, 0.9, 0.48);
        const chestMat = new THREE.MeshStandardMaterial({
          color: palette.primary,
          roughness: 0.5,
          metalness: 0.4,
        });
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.y = 0.92;
        bodyRoot.add(chest);

        // 머리
        const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xfde047 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.65;
        bodyRoot.add(head);

        // 로빈 후드 캡 (Robin Hood Cap + Feather)
        const capGeo = new THREE.ConeGeometry(0.42, 0.45, 4);
        const capMat = new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.6 });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(0, 1.95, -0.05);
        cap.rotation.x = -Math.PI / 8;
        bodyRoot.add(cap);

        const featherGeo = new THREE.BoxGeometry(0.06, 0.35, 0.12);
        const featherMat = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 0.5,
        });
        const feather = new THREE.Mesh(featherGeo, featherMat);
        feather.position.set(-0.25, 2.1, -0.08);
        feather.rotation.z = Math.PI / 6;
        bodyRoot.add(feather);

        // 등 뒤 화살통 (Quiver with arrows)
        const quiverGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.85, 6);
        const quiverMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
        const quiver = new THREE.Mesh(quiverGeo, quiverMat);
        quiver.position.set(0.18, 1.1, -0.32);
        quiver.rotation.z = -Math.PI / 7;
        bodyRoot.add(quiver);

        // [오른손/전방] 장궁 (Recurve Bow)
        const bowCurveGeo = new THREE.TorusGeometry(0.65, 0.05, 6, 12, Math.PI * 0.9);
        const bowMat = new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.6,
          roughness: 0.3,
        });
        const bow = new THREE.Mesh(bowCurveGeo, bowMat);
        bow.rotation.y = Math.PI / 2;
        bow.rotation.z = Math.PI / 2;
        bow.position.set(0, 0, 0.3);
        weaponRight.add(bow);

        weaponRight.position.set(0.5, 0.95, 0.15);
        bodyRoot.add(weaponRight);
        break;
      }

      // 5. BRAWLER (광전사, 버서커): 헤드밴드 머리띠, 우람한 어깨 근육, 스파이크 헤비 건틀릿
      case 'BRAWLER': {
        // 우람한 상체 (Bulky Muscle Torso)
        const chestGeo = new THREE.BoxGeometry(0.95, 0.95, 0.6);
        const chestMat = new THREE.MeshStandardMaterial({
          color: palette.trim,
          roughness: 0.6,
          metalness: 0.3,
        });
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.y = 0.95;
        bodyRoot.add(chest);

        // 머리 & 격투가 헤드밴드
        const headGeo = new THREE.BoxGeometry(0.62, 0.62, 0.62);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xfcb88b });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.7;
        bodyRoot.add(head);

        const bandGeo = new THREE.BoxGeometry(0.66, 0.16, 0.66);
        const bandMat = new THREE.MeshStandardMaterial({
          color: 0xd946ef,
          emissive: 0xd946ef,
          emissiveIntensity: 0.6,
        });
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.position.set(0, 1.75, 0);
        bodyRoot.add(band);

        // [양손] 거대한 메탈 스파이크 건틀릿 (Heavy Spiked Gauntlets)
        const fistGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38);
        const fistMat = new THREE.MeshStandardMaterial({
          color: palette.primary,
          metalness: 0.85,
          roughness: 0.25,
        });

        const rFist = new THREE.Mesh(fistGeo, fistMat);
        weaponRight.add(rFist);
        weaponRight.position.set(0.68, 0.85, 0.25);
        bodyRoot.add(weaponRight);

        const lFist = new THREE.Mesh(fistGeo, fistMat);
        weaponLeft.add(lFist);
        weaponLeft.position.set(-0.68, 0.85, 0.25);
        bodyRoot.add(weaponLeft);
        break;
      }

      // 6. BEAST_GOLEM (용족, 골렘, 크립 몬스터): 바위 질감 외골격, 뿔, 흑요석 발톱
      case 'BEAST_GOLEM':
      default: {
        // 거대한 괴수/골렘 몸체
        const bodyGeo = new THREE.DodecahedronGeometry(0.65, 0);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: palette.primary,
          roughness: 0.85,
          metalness: 0.3,
          flatShading: true,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.95;
        bodyRoot.add(body);

        // 머리 및 거대한 뿔 2개
        const headGeo = new THREE.BoxGeometry(0.65, 0.55, 0.65);
        const headMat = new THREE.MeshStandardMaterial({
          color: palette.trim,
          roughness: 0.7,
          metalness: 0.4,
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.6;
        bodyRoot.add(head);

        const hornGeo = new THREE.ConeGeometry(0.12, 0.65, 5);
        const hornMat = new THREE.MeshStandardMaterial({
          color: palette.emissive,
          emissive: palette.emissive,
          emissiveIntensity: 0.7,
        });
        const hornL = new THREE.Mesh(hornGeo, hornMat);
        hornL.position.set(-0.35, 2.05, 0.1);
        hornL.rotation.z = Math.PI / 6;
        const hornR = new THREE.Mesh(hornGeo, hornMat);
        hornR.position.set(0.35, 2.05, 0.1);
        hornR.rotation.z = -Math.PI / 6;
        bodyRoot.add(hornL);
        bodyRoot.add(hornR);

        // 양손 거대 흑요석 발톱 (Obsidian Claws)
        const clawGeo = new THREE.ConeGeometry(0.16, 0.65, 4);
        const clawMat = new THREE.MeshStandardMaterial({
          color: 0x09090b,
          emissive: palette.emissive,
          emissiveIntensity: 0.4,
        });
        const clawR = new THREE.Mesh(clawGeo, clawMat);
        clawR.rotation.x = Math.PI / 2;
        weaponRight.add(clawR);
        weaponRight.position.set(0.7, 0.8, 0.3);
        bodyRoot.add(weaponRight);

        const clawL = new THREE.Mesh(clawGeo, clawMat);
        clawL.rotation.x = Math.PI / 2;
        weaponLeft.add(clawL);
        weaponLeft.position.set(-0.7, 0.8, 0.3);
        bodyRoot.add(weaponLeft);
        break;
      }
    }

    // -------------------------------------------------------------
    // 머리 위 실시간 3D 체력바 / 마나바 / 성급 빌보드 게이지
    // -------------------------------------------------------------
    const overheadGroup = new THREE.Group();
    overheadGroup.name = 'OVERHEAD_BAR';
    overheadGroup.position.set(0, 2.45, 0);

    // HP 배경 바
    const hpBgGeo = new THREE.PlaneGeometry(1.4, 0.18);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const hpBg = new THREE.Mesh(hpBgGeo, hpBgMat);
    overheadGroup.add(hpBg);

    // HP 게이지 바 (초록/적색)
    const hpFillGeo = new THREE.PlaneGeometry(1.36, 0.14);
    const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const hpFill = new THREE.Mesh(hpFillGeo, hpFillMat);
    hpFill.name = 'HP_FILL';
    hpFill.position.set(0, 0, 0.01);
    overheadGroup.add(hpFill);

    // 마나 바 (파란색)
    const manaBgGeo = new THREE.PlaneGeometry(1.4, 0.08);
    const manaBgMat = new THREE.MeshBasicMaterial({ color: 0x020617 });
    const manaBg = new THREE.Mesh(manaBgGeo, manaBgMat);
    manaBg.position.set(0, -0.12, 0);
    overheadGroup.add(manaBg);

    const manaFillGeo = new THREE.PlaneGeometry(1.36, 0.06);
    const manaFillMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const manaFill = new THREE.Mesh(manaFillGeo, manaFillMat);
    manaFill.name = 'MANA_FILL';
    manaFill.position.set(0, -0.12, 0.01);
    overheadGroup.add(manaFill);

    // 성급 별 표시 (1성: 1개, 2성: 2개, 3성: 3개 황금 큐브)
    const starCount = starLevel;
    const starGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const starMat = new THREE.MeshStandardMaterial({
      color: starLevel === 3 ? 0xfacc15 : starLevel === 2 ? 0xfef08a : 0x94a3b8,
      emissive: 0xfacc15,
      emissiveIntensity: starLevel === 3 ? 0.9 : 0.4,
    });
    for (let s = 0; s < starCount; s++) {
      const star = new THREE.Mesh(starGeo, starMat);
      const starX = (s - (starCount - 1) * 0.5) * 0.22;
      star.position.set(starX, 0.16, 0.02);
      overheadGroup.add(star);
    }

    group.add(overheadGroup);

    // 3성 기물 전용 바닥 회전 황금 마법진
    if (starLevel === 3) {
      const circleGeo = new THREE.RingGeometry(1.0, 1.22, 6);
      const circleMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const circle = new THREE.Mesh(circleGeo, circleMat);
      circle.rotation.x = Math.PI / 2;
      circle.position.y = 0.05;
      circle.name = 'STAR3_RING';
      group.add(circle);
    }

    group.scale.set(scale, scale, scale);
    return group;
  }

  /**
   * 전투 틱 이벤트 스트림 인제스트 (공격, 스킬, 도약, 데미지, 투사체 발사)
   */
  public ingestCombatEvents(events: CombatEvent[], units: CombatUnit[]): void {
    const unitMap = new Map<string, CombatUnit>();
    for (const u of units) {
      unitMap.set(u.instanceId, u);
    }

    for (const ev of events) {
      // 1. 유닛 이동 및 암살자 도약 (MOVE / LEAP)
      if (ev.type === 'MOVE' || ev.type === 'LEAP') {
        if (ev.sourceId && ev.fromRow !== undefined && ev.toRow !== undefined) {
          const juice = this.getOrInitJuice(ev.sourceId);
          const pFrom = this.hexToWorldPos(ev.fromRow, ev.fromCol ?? 0);
          const pTo = this.hexToWorldPos(ev.toRow, ev.toCol ?? 0);

          const dx = pTo.x - pFrom.x;
          const dz = pTo.z - pFrom.z;
          if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
            juice.facingY = Math.atan2(dx, dz);
          }

          if (ev.type === 'LEAP') {
            juice.leapProgress = 0.01;
            juice.leapStartPos.set(pFrom.x, 0.2, pFrom.z);
            juice.leapTargetPos.set(pTo.x, 0.2, pTo.z);
            this.spawnSparks(pFrom.x, 0.5, pFrom.z, 0x9333ea, 8);
            this.spawnSparks(pTo.x, 0.5, pTo.z, 0xc084fc, 12);
          }
        }
      }

      // 2. 기본 공격 및 스킬 시전 (BASIC_ATTACK / SKILL_CAST)
      else if (ev.type === 'BASIC_ATTACK' || ev.type === 'SKILL_CAST') {
        if (ev.sourceId) {
          const juice = this.getOrInitJuice(ev.sourceId);
          const attacker = unitMap.get(ev.sourceId);
          const isSkill = ev.type === 'SKILL_CAST';

          juice.lungeMaxMs = isSkill ? 240 : 160;
          juice.lungeTimerMs = juice.lungeMaxMs;
          juice.swingAngle = Math.PI * 0.45;

          // 공격 방향 산출
          if (ev.fromRow !== undefined && ev.toRow !== undefined) {
            const pFrom = this.hexToWorldPos(ev.fromRow, ev.fromCol ?? 0);
            const pTo = this.hexToWorldPos(ev.toRow, ev.toCol ?? 0);
            const dx = pTo.x - pFrom.x;
            const dz = pTo.z - pFrom.z;
            const len = Math.max(0.1, Math.hypot(dx, dz));
            juice.lungeDirX = (dx / len) * (isSkill ? 0.6 : 0.4);
            juice.lungeDirZ = (dz / len) * (isSkill ? 0.6 : 0.4);
            juice.facingY = Math.atan2(dx, dz);

            // 원거리 챔피언 투사체 발사 (사거리 2 이상)
            const isRanged = attacker && attacker.range > 1;
            if (isRanged) {
              const archetype = attacker ? this.getChampionArchetype(attacker.unitId) : 'WARRIOR';
              const projKind = archetype === 'RANGER' ? 'ARROW' : 'MAGIC_ORB';
              this.spawn3DProjectile(pFrom.x, 1.3, pFrom.z, pTo.x, 1.1, pTo.z, projKind);
            }
          }
        }
      }

      // 3. 피격 데미지 연출 (DAMAGE / CRIT_DAMAGE)
      else if (ev.type === 'DAMAGE') {
        if (ev.targetId) {
          const juice = this.getOrInitJuice(ev.targetId);
          juice.hitFlashTimerMs = 180;

          const targetUnit = unitMap.get(ev.targetId);
          if (targetUnit) {
            const p = this.hexToWorldPos(targetUnit.row, targetUnit.col);
            const amount = Math.round(ev.amount ?? 0);
            const isCrit = !!ev.isCrit;
            const text = isCrit ? `⚡${amount}!` : `${amount}`;
            const color = isCrit ? '#f97316' : '#f1f5f9';

            this.spawn3DFloatingPopup(
              new THREE.Vector3(p.x, 2.5, p.z),
              text,
              color,
              isCrit
            );
            this.spawnSparks(p.x, 1.2, p.z, isCrit ? 0xf59e0b : 0xef4444, isCrit ? 10 : 5);
          }
        }
      }

      // 4. 힐 / 쉴드 팝업
      else if (ev.type === 'HEAL' || ev.type === 'SHIELD') {
        if (ev.targetId) {
          const targetUnit = unitMap.get(ev.targetId);
          if (targetUnit) {
            const p = this.hexToWorldPos(targetUnit.row, targetUnit.col);
            const amount = Math.round(ev.amount ?? 0);
            const isHeal = ev.type === 'HEAL';
            const text = isHeal ? `+${amount}` : `🛡️${amount}`;
            const color = isHeal ? '#22c55e' : '#38bdf8';
            this.spawn3DFloatingPopup(new THREE.Vector3(p.x, 2.5, p.z), text, color, false);
          }
        }
      }

      // 5. 5코 3성 대재앙 권능
      else if (ev.type === 'FIVE_COST_3STAR_CATACLYSM') {
        this.triggerImpactShake(18, 600);
        this.spawn3DFloatingPopup(
          new THREE.Vector3(0, 4.0, 0),
          '⚡ 99,999! 5코 3성 절대 권능! ⚡',
          '#facc15',
          true
        );
        for (let i = 0; i < 25; i++) {
          this.spawnSparks(
            (Math.random() - 0.5) * 8,
            2,
            (Math.random() - 0.5) * 8,
            0xfacc15,
            15
          );
        }
      }
    }
  }

  /**
   * 3D 비행 투사체 생성 (화살 / 마법 구체)
   */
  private spawn3DProjectile(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    kind: 'ARROW' | 'MAGIC_ORB'
  ): void {
    const group = new THREE.Group();

    if (kind === 'ARROW') {
      const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.85, 4);
      const shaftMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 0.8,
      });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const headGeo = new THREE.ConeGeometry(0.1, 0.25, 4);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.rotation.x = -Math.PI / 2;
      head.position.z = 0.45;
      group.add(head);
    } else {
      const orbGeo = new THREE.SphereGeometry(0.26, 8, 8);
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.5,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      group.add(orb);
    }

    group.position.set(x1, y1, z1);
    this.projectilesGroup.add(group);

    this.activeProjectiles.push({
      mesh: group,
      startPos: new THREE.Vector3(x1, y1, z1),
      targetPos: new THREE.Vector3(x2, y2, z2),
      elapsedMs: 0,
      durationMs: 280,
      arcHeight: 1.2,
      kind,
    });
  }

  /**
   * 3D 플로팅 데미지 텍스트 팝업 (Canvas Texture Sprite)
   */
  public spawn3DFloatingPopup(
    worldPos: THREE.Vector3,
    text: string,
    color: string,
    isCrit: boolean
  ): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = isCrit
      ? '900 48px Impact, system-ui, sans-serif'
      : 'bold 38px Impact, system-ui, sans-serif';

    // 두꺼운 검정 외곽선
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 128, 64);

    // 텍스트 채우기
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    const spriteScale = isCrit ? 2.2 : 1.7;
    sprite.scale.set(spriteScale, spriteScale * 0.5, 1);
    sprite.position.copy(worldPos);

    this.popupsGroup.add(sprite);

    this.activePopups.push({
      sprite,
      startPos: worldPos.clone(),
      elapsedMs: 0,
      durationMs: 650,
      riseSpeed: 1.6,
    });
  }

  /**
   * 3D 파티클 스파크 생성
   */
  private spawnSparks(x: number, y: number, z: number, color: number, count: number): void {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.vfxGroup.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        2.5 + Math.random() * 3.0,
        Math.sin(angle) * speed
      );

      this.activeSparks.push({
        mesh,
        vel,
        lifeMs: 0,
        maxLifeMs: 350 + Math.random() * 200,
      });
    }
  }

  private getOrInitJuice(instanceId: string): UnitJuice3D {
    let juice = this.unitJuiceMap.get(instanceId);
    if (!juice) {
      juice = {
        facingY: 0,
        lungeTimerMs: 0,
        lungeMaxMs: 160,
        lungeDirX: 0,
        lungeDirZ: 0,
        swingAngle: 0,
        hitFlashTimerMs: 0,
        leapProgress: 0,
        leapStartPos: new THREE.Vector3(),
        leapTargetPos: new THREE.Vector3(),
      };
      this.unitJuiceMap.set(instanceId, juice);
    }
    return juice;
  }

  /**
   * 충격 진동 (Screen Shake)
   */
  public triggerImpactShake(intensity: number, durationMs: number): void {
    this.shakeIntensity = intensity * 0.04;
    this.shakeRemainingMs = durationMs;
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * 메인 3D 렌더링 프레임 루프
   */
  public renderFrame(dtMs: number, state: RenderState3D): void {
    this.animClockMs += dtMs;

    // 1. 카메라 쉐이크 연산
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (this.shakeRemainingMs > 0) {
      this.shakeRemainingMs = Math.max(0, this.shakeRemainingMs - dtMs);
      const decay = this.shakeRemainingMs / 200;
      shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * decay;
      shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * decay;
    }
    this.camera.position.x = shakeOffsetX;
    this.camera.position.y = 16.5 + shakeOffsetY;

    // 2. 호버링된 타일 하이라이트
    for (const [key, mesh] of this.hexTileMeshes) {
      const isHovered =
        state.hoveredHex &&
        `${state.hoveredHex.row},${state.hoveredHex.col}` === key;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (isHovered) {
        mat.emissive.setHex(0xfacc15);
        mat.emissiveIntensity = 0.55;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    // 3. 대기석 호버링 하이라이트
    for (const [idx, mesh] of this.benchTileMeshes) {
      const isHovered = state.hoveredBenchIndex === idx;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (isHovered) {
        mat.emissive.setHex(0x38bdf8);
        mat.emissiveIntensity = 0.65;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    // 4. 유닛 동기화 및 모션 갱신
    this.syncUnits3D(dtMs, state);

    // 5. 3D 투사체 업데이트
    this.updateProjectiles(dtMs);

    // 6. 3D 플로팅 데미지 팝업 업데이트
    this.updatePopups(dtMs);

    // 7. 3D 파티클 스파크 업데이트
    this.updateSparks(dtMs);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 3D 투사체 애니메이션 업데이트
   */
  private updateProjectiles(dtMs: number): void {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      p.elapsedMs += dtMs;
      const t = Math.min(1.0, p.elapsedMs / p.durationMs);

      // X, Z 선형 보간
      const curX = p.startPos.x + (p.targetPos.x - p.startPos.x) * t;
      const curZ = p.startPos.z + (p.targetPos.z - p.startPos.z) * t;
      // Y 포물선 궤적
      const curY =
        p.startPos.y +
        (p.targetPos.y - p.startPos.y) * t +
        Math.sin(t * Math.PI) * p.arcHeight;

      p.mesh.position.set(curX, curY, curZ);

      // 화살은 진행 방향을 바라봄
      if (p.kind === 'ARROW') {
        p.mesh.lookAt(p.targetPos.x, p.targetPos.y, p.targetPos.z);
      }

      if (t >= 1.0) {
        this.spawnSparks(p.targetPos.x, p.targetPos.y, p.targetPos.z, 0xfacc15, 6);
        this.projectilesGroup.remove(p.mesh);
        this.activeProjectiles.splice(i, 1);
      }
    }
  }

  /**
   * 3D 플로팅 데미지 팝업 애니메이션 업데이트
   */
  private updatePopups(dtMs: number): void {
    for (let i = this.activePopups.length - 1; i >= 0; i--) {
      const pop = this.activePopups[i];
      pop.elapsedMs += dtMs;
      const t = pop.elapsedMs / pop.durationMs;

      if (t >= 1.0) {
        this.popupsGroup.remove(pop.sprite);
        if (pop.sprite.material.map) pop.sprite.material.map.dispose();
        pop.sprite.material.dispose();
        this.activePopups.splice(i, 1);
        continue;
      }

      // 위로 부드럽게 솟구침
      pop.sprite.position.y = pop.startPos.y + (t * pop.riseSpeed);
      // 서서히 페이드아웃
      pop.sprite.material.opacity = 1.0 - t * t;
    }
  }

  /**
   * 3D 스파크 파티클 물리 업데이트
   */
  private updateSparks(dtMs: number): void {
    const dtSec = dtMs * 0.001;
    for (let i = this.activeSparks.length - 1; i >= 0; i--) {
      const s = this.activeSparks[i];
      s.lifeMs += dtMs;
      if (s.lifeMs >= s.maxLifeMs) {
        this.vfxGroup.remove(s.mesh);
        this.activeSparks.splice(i, 1);
        continue;
      }

      // 중력 적용
      s.vel.y -= 9.8 * dtSec;
      s.mesh.position.x += s.vel.x * dtSec;
      s.mesh.position.y += s.vel.y * dtSec;
      s.mesh.position.z += s.vel.z * dtSec;

      const scale = 1.0 - s.lifeMs / s.maxLifeMs;
      s.mesh.scale.set(scale, scale, scale);
    }
  }

  /**
   * 게임 상태의 유닛들을 3D 씬 오브젝트로 동기화 & 모션 적용
   */
  private syncUnits3D(dtMs: number, state: RenderState3D): void {
    const activeIds = new Set<string>();

    if (state.inCombat) {
      for (const cu of state.combatUnits) {
        if (cu.currentHp <= 0) continue;
        activeIds.add(cu.instanceId);

        let group = this.unitMeshesMap.get(cu.instanceId);
        if (!group) {
          group = this.create3DChampionMesh(cu.unitId, cu.cost, cu.starLevel);
          this.unitMeshesMap.set(cu.instanceId, group);
          this.unitsGroup.add(group);
        }

        const juice = this.getOrInitJuice(cu.instanceId);
        const targetPos = this.hexToWorldPos(cu.row, cu.col);

        // 공격 런지 및 모션 계산
        let lungeOffsetX = 0;
        let lungeOffsetZ = 0;
        if (juice.lungeTimerMs > 0) {
          juice.lungeTimerMs = Math.max(0, juice.lungeTimerMs - dtMs);
          const ratio = Math.sin((juice.lungeTimerMs / juice.lungeMaxMs) * Math.PI);
          lungeOffsetX = juice.lungeDirX * ratio;
          lungeOffsetZ = juice.lungeDirZ * ratio;
        }

        // 도약 중인 경우
        if (juice.leapProgress > 0 && juice.leapProgress < 1.0) {
          juice.leapProgress = Math.min(1.0, juice.leapProgress + dtMs * 0.0035);
          const lp = juice.leapProgress;
          const lx = juice.leapStartPos.x + (juice.leapTargetPos.x - juice.leapStartPos.x) * lp;
          const lz = juice.leapStartPos.z + (juice.leapTargetPos.z - juice.leapStartPos.z) * lp;
          const ly = juice.leapStartPos.y + Math.sin(lp * Math.PI) * 2.8;
          group.position.set(lx, ly, lz);
        } else {
          // 일반 보간 이동 + 런지
          group.position.x += (targetPos.x + lungeOffsetX - group.position.x) * 0.3;
          group.position.z += (targetPos.z + lungeOffsetZ - group.position.z) * 0.3;
          group.position.y = 0.2 + Math.sin(this.animClockMs * 0.005 + cu.row) * 0.05;
        }

        // 회전 (공격/마주보기)
        const targetRotY = cu.team === 'HOME' ? Math.PI : 0;
        group.rotation.y += (targetRotY - group.rotation.y) * 0.2;

        // 무기 스윙 모션
        const weaponRight = group.getObjectByName('WEAPON_RIGHT');
        if (weaponRight) {
          if (juice.lungeTimerMs > 0) {
            const swingRatio = Math.sin((juice.lungeTimerMs / juice.lungeMaxMs) * Math.PI);
            weaponRight.rotation.x = Math.PI * 0.1 + swingRatio * 0.9;
          } else {
            weaponRight.rotation.x = Math.PI * 0.1;
          }
        }

        // 마법사 지팡이 보주 회전
        const mageOrb = group.getObjectByName('MAGE_ORB');
        if (mageOrb) {
          mageOrb.rotation.y += 0.04;
        }

        // 3성 링 회전
        const star3Ring = group.getObjectByName('STAR3_RING');
        if (star3Ring) {
          star3Ring.rotation.z += 0.03;
        }

        // 피격 플래시
        if (juice.hitFlashTimerMs > 0) {
          juice.hitFlashTimerMs = Math.max(0, juice.hitFlashTimerMs - dtMs);
        }

        // 머리 위 체력/마나바 실시간 갱신 & 빌보드 회전
        const overhead = group.getObjectByName('OVERHEAD_BAR');
        if (overhead) {
          overhead.quaternion.copy(this.camera.quaternion);

          const hpRatio = Math.max(0, Math.min(1, cu.currentHp / Math.max(1, cu.maxHp)));
          const hpFill = overhead.getObjectByName('HP_FILL') as THREE.Mesh;
          if (hpFill) {
            hpFill.scale.x = hpRatio;
            hpFill.position.x = -(1.36 * (1 - hpRatio) * 0.5);
          }

          const manaRatio = Math.max(0, Math.min(1, cu.currentMana / Math.max(1, cu.maxMana)));
          const manaFill = overhead.getObjectByName('MANA_FILL') as THREE.Mesh;
          if (manaFill) {
            manaFill.scale.x = manaRatio;
            manaFill.position.x = -(1.36 * (1 - manaRatio) * 0.5);
          }
        }
      }
    } else {
      // 정비 페이즈: 보드 위 기물
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 7; c++) {
          const u = state.viewedParticipant.board[r][c];
          if (!u) continue;
          activeIds.add(u.instanceId);

          let group = this.unitMeshesMap.get(u.instanceId);
          if (!group) {
            group = this.create3DChampionMesh(u.unitId, u.cost, u.starLevel);
            this.unitMeshesMap.set(u.instanceId, group);
            this.unitsGroup.add(group);
          }

          const targetPos = this.hexToWorldPos(r + 4, c);
          const isDragged = state.draggedInstanceId === u.instanceId;
          const targetY = isDragged ? 1.8 : 0.2;

          group.position.x += (targetPos.x - group.position.x) * 0.25;
          group.position.z += (targetPos.z - group.position.z) * 0.25;
          group.position.y += (targetY - group.position.y) * 0.25;
          group.rotation.y = Math.PI;

          const overhead = group.getObjectByName('OVERHEAD_BAR');
          if (overhead) {
            overhead.quaternion.copy(this.camera.quaternion);
          }
        }
      }

      // 대기석 위 기물
      for (let i = 0; i < state.viewedParticipant.bench.length; i++) {
        const u = state.viewedParticipant.bench[i];
        if (!u) continue;
        activeIds.add(u.instanceId);

        let group = this.unitMeshesMap.get(u.instanceId);
        if (!group) {
          group = this.create3DChampionMesh(u.unitId, u.cost, u.starLevel);
          this.unitMeshesMap.set(u.instanceId, group);
          this.unitsGroup.add(group);
        }

        const targetPos = this.benchIndexToWorldPos(i);
        const isDragged = state.draggedInstanceId === u.instanceId;
        const targetY = isDragged ? 1.8 : 0.25;

        group.position.x += (targetPos.x - group.position.x) * 0.25;
        group.position.z += (targetPos.z - group.position.z) * 0.25;
        group.position.y += (targetY - group.position.y) * 0.25;
        group.rotation.y = Math.PI;

        const overhead = group.getObjectByName('OVERHEAD_BAR');
        if (overhead) {
          overhead.quaternion.copy(this.camera.quaternion);
        }
      }
    }

    // 소멸된 기물 제거
    for (const [id, group] of this.unitMeshesMap) {
      if (!activeIds.has(id)) {
        this.unitsGroup.remove(group);
        this.unitMeshesMap.delete(id);
        this.unitJuiceMap.delete(id);
      }
    }
  }
}
