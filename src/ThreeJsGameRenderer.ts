// src/ThreeJsGameRenderer.ts
/**
 * Three.js 3D WebGL Fantasy Auto-Battler Renderer.
 * High-End TFT Mobile Style with:
 * - Real 3D GLB Character Models (Knight, Mage, Rogue, Barbarian, Skeleton, Dragon) via GLTFLoader
 * - Dark Medieval Fantasy Colosseum Arena (No digital/neon wireframes, Real Stone Hexagons with Carved Runes)
 * - Warm Flickering Torches & Braziers with dynamic PointLight fire glows
 * - TFT-style 1:1 Responsive 3D Drag & Drop (Unit floats up, follows finger/cursor in 3D world space, snapped landing)
 * - 3D Overhead Billboard HP/Mana bars and 3D Floating Popups
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  CostTier,
  StarLevel,
  UNIT_TEMPLATES,
} from './GameData';
import { HexCoord } from './HexGridMath';
import { Participant } from './Participant';
import { CombatEvent, CombatUnit } from './SkillRegistry';

export type ChampionArchetype =
  | 'WARRIOR'      // 기사, 선봉대, 성기사 (Knight.glb)
  | 'MAGE'         // 대마법사, 비전탑 (Mage.glb)
  | 'ROGUE'        // 그림자 암살자, 고블린 (Rogue.glb)
  | 'BRAWLER'      // 광전사, 버서커 (Barbarian.glb)
  | 'SKELETON'     // 언데드, 사령술사 (Skeleton.glb)
  | 'BEAST_GOLEM'; // 용족, 몬스터, PVE 크립 (Dragon.glb)

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
  hitFlashTimerMs: number;
  leapProgress: number;
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

  // 3D 전장 그리드 메트릭 (World Space)
  public readonly hexRadius: number = 1.15;
  public readonly hexWidth: number = Math.sqrt(3) * 1.15; // ~1.99
  public readonly rowStepZ: number = 1.5 * 1.15; // 1.725
  public readonly benchZ: number = 4 * 1.725 + 2.2;

  // 3D 씬 계층 구조
  private boardGroup: THREE.Group = new THREE.Group();
  private benchGroup: THREE.Group = new THREE.Group();
  private unitsGroup: THREE.Group = new THREE.Group();
  private environmentGroup: THREE.Group = new THREE.Group();
  private projectilesGroup: THREE.Group = new THREE.Group();
  private popupsGroup: THREE.Group = new THREE.Group();
  private vfxGroup: THREE.Group = new THREE.Group();

  // 타일 메시 캐시
  private hexTileMeshes: Map<string, THREE.Mesh> = new Map();
  private benchTileMeshes: Map<number, THREE.Mesh> = new Map();
  private tileOriginalY: Map<THREE.Mesh, number> = new Map();

  // 유닛 3D 메시 및 쥬스 상태
  private unitMeshesMap: Map<string, THREE.Group> = new Map();
  private unitJuiceMap: Map<string, UnitJuice3D> = new Map();
  private unitMixers: Map<string, THREE.AnimationMixer> = new Map();

  // GLB 모델 에셋 캐시
  private glbLoadedTemplates: Map<ChampionArchetype, THREE.Group> = new Map();
  private glbAnimations: Map<ChampionArchetype, THREE.AnimationClip[]> = new Map();
  private glbLoader: GLTFLoader = new GLTFLoader();

  // 횃불 조명들 (Flickering Torches)
  private torchLights: { light: THREE.PointLight; baseIntensity: number; phase: number }[] = [];

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

  // 3D 레이캐스터 및 지면 평면
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouseVec: THREE.Vector2 = new THREE.Vector2();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private currentDragWorldPos: THREE.Vector3 = new THREE.Vector3();
  private isPointerDownOn3D: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    // 묵직한 중세 다크 판타지 밤하늘 & 결투장 배경색 (사이버 네온 완전 탈피)
    this.scene.background = new THREE.Color(0x0c0f18);
    this.scene.fog = new THREE.FogExp2(0x0c0f18, 0.024);

    // 1. TFT 쿼터뷰 3D 카메라 설정
    const aspect = (window.innerWidth || 800) / (window.innerHeight || 600);
    this.camera = new THREE.PerspectiveCamera(44, aspect, 0.5, 120);
    this.camera.position.set(0, 15.5, 18.0);
    this.camera.lookAt(0, 0, 2.2);

    // 2. WebGL 렌더러 (완전 불투명 렌더링으로 2D 화면과 철저히 분리)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth || 800, window.innerHeight || 600);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. 중세 판타지 분위기 조명 (디지털 네온 배제, 중세 달빛 + 따뜻한 횃불 조명)
    const ambientLight = new THREE.AmbientLight(0xfff5eb, 0.95);
    this.scene.add(ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1f2438, 1.4);
    this.scene.add(this.hemiLight);

    // 주광선 (차가운 달빛 느낌)
    this.dirLight = new THREE.DirectionalLight(0xffedd5, 2.6);
    this.dirLight.position.set(8, 22, 12);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 60;
    this.dirLight.shadow.camera.left = -14;
    this.dirLight.shadow.camera.right = 14;
    this.dirLight.shadow.camera.top = 14;
    this.dirLight.shadow.camera.bottom = -14;
    this.dirLight.shadow.bias = -0.0006;
    this.scene.add(this.dirLight);

    this.scene.add(this.boardGroup);
    this.scene.add(this.benchGroup);
    this.scene.add(this.unitsGroup);
    this.scene.add(this.environmentGroup);
    this.scene.add(this.projectilesGroup);
    this.scene.add(this.popupsGroup);
    this.scene.add(this.vfxGroup);

    this.buildMedievalStoneArena();
    this.buildMedievalStoneBench();
    this.buildColosseumSurroundingsAndTorches();

    // 4. 외부 고품질 GLB 캐릭터 모델 비동기 로딩 시작
    this.loadGlbCharacterModels();
  }

  /**
   * 외부 GLB 모델 파일 6종 비동기 사전 로딩
   */
  private loadGlbCharacterModels(): void {
    const modelSources: { archetype: ChampionArchetype; url: string; scale: number; offsetY: number }[] = [
      { archetype: 'WARRIOR', url: './models/Knight.glb', scale: 1.15, offsetY: 0 },
      { archetype: 'MAGE', url: './models/Mage.glb', scale: 1.15, offsetY: 0 },
      { archetype: 'ROGUE', url: './models/Rogue.glb', scale: 1.12, offsetY: 0 },
      { archetype: 'BRAWLER', url: './models/Barbarian.glb', scale: 1.22, offsetY: 0 },
      { archetype: 'SKELETON', url: './models/Skeleton.glb', scale: 1.15, offsetY: 0 },
      { archetype: 'BEAST_GOLEM', url: './models/Dragon.glb', scale: 0.95, offsetY: 0 },
    ];

    modelSources.forEach((src) => {
      this.glbLoader.load(
        src.url,
        (gltf) => {
          const root = gltf.scene;
          root.scale.set(src.scale, src.scale, src.scale);
          root.position.y = src.offsetY;

          // 그림자 활성화 & 재질 최적화
          root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const m = child as THREE.Mesh;
              m.castShadow = true;
              m.receiveShadow = true;
              if (m.material) {
                const mat = m.material as THREE.MeshStandardMaterial;
                mat.roughness = 0.55;
                mat.metalness = 0.35;
              }
            }
          });

          this.glbLoadedTemplates.set(src.archetype, root);
          if (gltf.animations && gltf.animations.length > 0) {
            this.glbAnimations.set(src.archetype, gltf.animations);
          }
        },
        undefined,
        (err) => {
          console.warn(`[ThreeJsGameRenderer] Model load fallback for ${src.archetype}:`, err);
        }
      );
    });
  }

  /**
   * 챔피언 아키타입 분류
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

    // 언데드
    if (traits.includes('UNDEAD_SCOURGE') || unitId.includes('skel')) {
      return 'SKELETON';
    }

    // 용족 / 크립
    if (traits.includes('DRAGONKIN') || unitId.includes('dragon')) {
      return 'BEAST_GOLEM';
    }

    // 마법사
    if (traits.includes('ARCHMAGE') || traits.includes('ARCANE_TOWER') || range >= 3) {
      return 'MAGE';
    }

    // 도적 / 암살자
    if (traits.includes('SHADOW_ASSASSIN') || traits.includes('GOLDEN_GOBLIN')) {
      return 'ROGUE';
    }

    // 광전사
    if (traits.includes('BERSERKER')) {
      return 'BRAWLER';
    }

    // 선봉대 / 기사
    return 'WARRIOR';
  }

  /**
   * 중세 석조 헥사곤 전장 타일 생성 (네온 와이어프레임 완전 철거, 자연스러운 고대 석조 대리석 재질)
   */
  private buildMedievalStoneArena(): void {
    const tileGeo = new THREE.CylinderGeometry(
      this.hexRadius,
      this.hexRadius * 0.95,
      0.38,
      6
    );

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 7; c++) {
        const isAway = r < 4;
        // 고대 석판 텍스처 컬러 (내 진영: 다크 슬레이트 블루 스톤 / 적 진영: 다크 옵시디언 스톤)
        const stoneColor = isAway
          ? (r + c) % 2 === 0
            ? 0x221a24
            : 0x1c151e
          : (r + c) % 2 === 0
          ? 0x242938
          : 0x1a202c;

        const mat = new THREE.MeshStandardMaterial({
          color: stoneColor,
          roughness: 0.88,
          metalness: 0.12,
          flatShading: true,
        });

        const mesh = new THREE.Mesh(tileGeo, mat);
        mesh.rotation.y = Math.PI / 6;
        mesh.receiveShadow = true;

        const pos = this.hexToWorldPos(r, c);
        mesh.position.set(pos.x, 0, pos.z);
        mesh.userData = {
          type: 'HEX',
          row: r,
          col: c,
          baseColor: stoneColor,
          baseY: 0,
        };

        const key = `${r},${c}`;
        this.hexTileMeshes.set(key, mesh);
        this.tileOriginalY.set(mesh, 0);
        this.boardGroup.add(mesh);

        // 윗면에 은은한 음각 석조 룬 라인 (사이버 네온이 아닌, 자연스러운 어두운 암석 각인선)
        const grooveGeo = new THREE.RingGeometry(this.hexRadius * 0.75, this.hexRadius * 0.78, 6);
        const grooveMat = new THREE.MeshStandardMaterial({
          color: isAway ? 0x140e18 : 0x111622,
          roughness: 0.95,
        });
        const groove = new THREE.Mesh(grooveGeo, grooveMat);
        groove.rotation.x = -Math.PI / 2;
        groove.rotation.z = Math.PI / 6;
        groove.position.set(pos.x, 0.191, pos.z);
        this.boardGroup.add(groove);
      }
    }
  }

  /**
   * 하단 1x9 중세 석조 대기석(Bench) 단상 생성
   */
  private buildMedievalStoneBench(): void {
    const slotGeo = new THREE.BoxGeometry(1.68, 0.36, 1.68);
    const benchBaseGeo = new THREE.BoxGeometry(17.6, 0.3, 2.4);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x121722,
      roughness: 0.9,
      metalness: 0.15,
      flatShading: true,
    });
    const baseMesh = new THREE.Mesh(benchBaseGeo, baseMat);
    baseMesh.position.set(0, -0.06, this.benchZ);
    baseMesh.receiveShadow = true;
    this.benchGroup.add(baseMesh);

    for (let i = 0; i < 9; i++) {
      const slotMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x1e2738 : 0x181f2c,
        roughness: 0.85,
        metalness: 0.2,
        flatShading: true,
      });

      const slot = new THREE.Mesh(slotGeo, slotMat);
      const slotX = (i - 4) * 1.85;
      slot.position.set(slotX, 0.08, this.benchZ);
      slot.receiveShadow = true;
      slot.userData = {
        type: 'BENCH',
        index: i,
        baseColor: slotMat.color.getHex(),
        baseY: 0.08,
      };

      this.benchTileMeshes.set(i, slot);
      this.tileOriginalY.set(slot, 0.08);
      this.benchGroup.add(slot);
    }
  }

  /**
   * 중세 콜로세움 배경 & 타오르는 판타지 횃불 화로 (Torches & Braziers)
   */
  private buildColosseumSurroundingsAndTorches(): void {
    // 웅장한 콜로세움 원형 석조 대지
    const groundGeo = new THREE.CylinderGeometry(24, 26, 1.5, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c14,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -0.9, 1.5);
    ground.receiveShadow = true;
    this.environmentGroup.add(ground);

    // 전장 모서리 4곳에 배치된 중세 석조 횃불 기둥 (Stone Braziers with Flickering Fire)
    const torchPositions = [
      [-11.5, 0, -8.0],
      [11.5, 0, -8.0],
      [-12.0, 0, 8.5],
      [12.0, 0, 8.5],
    ];

    torchPositions.forEach((pos, idx) => {
      const pillarGroup = new THREE.Group();
      pillarGroup.position.set(pos[0], pos[1], pos[2]);

      // 석조 기둥 베이스
      const pillarGeo = new THREE.CylinderGeometry(0.55, 0.75, 3.2, 8);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x222634,
        roughness: 0.85,
        flatShading: true,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.y = 1.6;
      pillar.castShadow = true;
      pillarGroup.add(pillar);

      // 횃불 화로 보울 (Brazier Bowl)
      const bowlGeo = new THREE.CylinderGeometry(0.85, 0.45, 0.5, 8);
      const bowlMat = new THREE.MeshStandardMaterial({
        color: 0x3d3025,
        metalness: 0.7,
        roughness: 0.35,
      });
      const bowl = new THREE.Mesh(bowlGeo, bowlMat);
      bowl.position.y = 3.3;
      pillarGroup.add(bowl);

      // 타오르는 화염 덩어리
      const flameGeo = new THREE.DodecahedronGeometry(0.35, 0);
      const flameMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff4400,
        emissiveIntensity: 1.8,
        roughness: 0.3,
      });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.y = 3.65;
      pillarGroup.add(flame);

      // 따뜻한 주황빛 포인트 라이트 (Flickering Flame Light)
      const fireLight = new THREE.PointLight(0xff7711, 2.4, 18);
      fireLight.position.set(0, 3.8, 0);
      pillarGroup.add(fireLight);

      this.torchLights.push({
        light: fireLight,
        baseIntensity: 2.4,
        phase: idx * 1.5,
      });

      this.environmentGroup.add(pillarGroup);
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
   * 3D 캐릭터 메시 빌더 (GLB 에셋 복제 또는 정교한 로우폴리 피규어)
   */
  public create3DChampionMesh(
    unitId: string,
    cost: CostTier,
    starLevel: StarLevel
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `UNIT_${unitId}`;
    const archetype = this.getChampionArchetype(unitId);

    // 코스트별 팔레트 (1코: 실버/아이언, 2코: 에메랄드, 3코: 사파이어, 4코: 자수정, 5코: 황금)
    const costColors: Record<CostTier, { primary: number; trim: number; emissive: number }> = {
      1: { primary: 0x94a3b8, trim: 0x475569, emissive: 0x334155 },
      2: { primary: 0x10b981, trim: 0x065f46, emissive: 0x047857 },
      3: { primary: 0x38bdf8, trim: 0x0369a1, emissive: 0x0284c7 },
      4: { primary: 0xc084fc, trim: 0x6b21a8, emissive: 0x9333ea },
      5: { primary: 0xfacc15, trim: 0xb45309, emissive: 0xeab308 },
    };
    const palette = costColors[cost] || costColors[1];
    const scaleMultiplier = starLevel === 3 ? 1.55 : starLevel === 2 ? 1.25 : 1.0;

    // A. 만약 고품질 외부 GLB 모델이 로드되어 있다면 실제 3D 모델 복제 사용!
    const glbTemplate = this.glbLoadedTemplates.get(archetype);
    if (glbTemplate) {
      const clonedModel = SkeletonUtils.clone(glbTemplate) as THREE.Group;
      clonedModel.name = 'GLB_MODEL_ROOT';

      // 코스트별 톤 미세 틴트 적용
      clonedModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.material) {
            const mat = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
            if (mat.color && cost >= 3) {
              mat.color.lerp(new THREE.Color(palette.primary), 0.25);
            }
            mesh.material = mat;
          }
        }
      });

      group.add(clonedModel);
    } else {
      // B. GLB 모델 로딩 전 또는 폴백용 세련된 판타지 미니어처 피규어 조형
      const fallbackRoot = new THREE.Group();
      fallbackRoot.name = 'FALLBACK_ROOT';

      // 머리, 투구, 눈 바이저, 흉갑, 어깨갑, 무기
      const chestGeo = new THREE.BoxGeometry(0.8, 0.95, 0.55);
      const chestMat = new THREE.MeshStandardMaterial({
        color: palette.primary,
        roughness: 0.4,
        metalness: 0.6,
      });
      const chest = new THREE.Mesh(chestGeo, chestMat);
      chest.position.y = 0.95;
      chest.castShadow = true;
      fallbackRoot.add(chest);

      const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      const headMat = new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.3, metalness: 0.7 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 1.68;
      head.castShadow = true;
      fallbackRoot.add(head);

      // 빛나는 바이저 눈
      const eyeGeo = new THREE.BoxGeometry(0.5, 0.14, 0.62);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: palette.emissive,
        emissive: palette.emissive,
        emissiveIntensity: 0.8,
      });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0, 1.68, 0.05);
      fallbackRoot.add(eye);

      // 망토 (Cape)
      const capeGeo = new THREE.BoxGeometry(0.7, 1.2, 0.08);
      const capeMat = new THREE.MeshStandardMaterial({
        color: palette.trim,
        roughness: 0.8,
      });
      const cape = new THREE.Mesh(capeGeo, capeMat);
      cape.position.set(0, 0.9, -0.32);
      cape.rotation.x = -Math.PI / 18;
      fallbackRoot.add(cape);

      // 오른손 무기
      const weaponGroup = new THREE.Group();
      weaponGroup.name = 'WEAPON_RIGHT';
      const swordGeo = new THREE.BoxGeometry(0.16, 1.4, 0.06);
      const swordMat = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        emissive: palette.emissive,
        emissiveIntensity: 0.35,
        metalness: 0.9,
      });
      const sword = new THREE.Mesh(swordGeo, swordMat);
      sword.position.y = 0.6;
      weaponGroup.add(sword);
      weaponGroup.position.set(0.65, 0.85, 0.2);
      fallbackRoot.add(weaponGroup);

      group.add(fallbackRoot);
    }

    // -------------------------------------------------------------
    // 머리 위 실시간 3D 체력바 / 마나바 / 성급 빌보드 게이지
    // -------------------------------------------------------------
    const overheadGroup = new THREE.Group();
    overheadGroup.name = 'OVERHEAD_BAR';
    overheadGroup.position.set(0, 2.45, 0);

    const hpBgGeo = new THREE.PlaneGeometry(1.4, 0.18);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const hpBg = new THREE.Mesh(hpBgGeo, hpBgMat);
    overheadGroup.add(hpBg);

    const hpFillGeo = new THREE.PlaneGeometry(1.36, 0.14);
    const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const hpFill = new THREE.Mesh(hpFillGeo, hpFillMat);
    hpFill.name = 'HP_FILL';
    hpFill.position.set(0, 0, 0.01);
    overheadGroup.add(hpFill);

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

    // 3성 전용 바닥 황금 룬 마법진
    if (starLevel === 3) {
      const circleGeo = new THREE.RingGeometry(1.0, 1.25, 6);
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

    group.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier);
    return group;
  }

  /**
   * 포인터 위치를 3D 지면 평면(y=0)과 교차시켜 3D 월드 좌표 계산 (드래그 실시간 추적용)
   */
  public updateDragPointerWorldPos(clientX: number, clientY: number): void {
    this.mouseVec.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouseVec.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.currentDragWorldPos);
  }

  /**
   * 전투 틱 이벤트 스트림 인제스트
   */
  public ingestCombatEvents(events: CombatEvent[], units: CombatUnit[]): void {
    const unitMap = new Map<string, CombatUnit>();
    for (const u of units) {
      unitMap.set(u.instanceId, u);
    }

    for (const ev of events) {
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
      } else if (ev.type === 'BASIC_ATTACK' || ev.type === 'SKILL_CAST') {
        if (ev.sourceId) {
          const juice = this.getOrInitJuice(ev.sourceId);
          const attacker = unitMap.get(ev.sourceId);
          const isSkill = ev.type === 'SKILL_CAST';

          juice.lungeMaxMs = isSkill ? 240 : 160;
          juice.lungeTimerMs = juice.lungeMaxMs;

          if (ev.fromRow !== undefined && ev.toRow !== undefined) {
            const pFrom = this.hexToWorldPos(ev.fromRow, ev.fromCol ?? 0);
            const pTo = this.hexToWorldPos(ev.toRow, ev.toCol ?? 0);
            const dx = pTo.x - pFrom.x;
            const dz = pTo.z - pFrom.z;
            const len = Math.max(0.1, Math.hypot(dx, dz));
            juice.lungeDirX = (dx / len) * (isSkill ? 0.6 : 0.4);
            juice.lungeDirZ = (dz / len) * (isSkill ? 0.6 : 0.4);
            juice.facingY = Math.atan2(dx, dz);

            const isRanged = attacker && attacker.range > 1;
            if (isRanged) {
              const archetype = attacker ? this.getChampionArchetype(attacker.unitId) : 'WARRIOR';
              const projKind = archetype === 'WARRIOR' || archetype === 'ROGUE' ? 'ARROW' : 'MAGIC_ORB';
              this.spawn3DProjectile(pFrom.x, 1.3, pFrom.z, pTo.x, 1.1, pTo.z, projKind);
            }
          }
        }
      } else if (ev.type === 'DAMAGE') {
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
      } else if (ev.type === 'HEAL' || ev.type === 'SHIELD') {
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
      } else if (ev.type === 'FIVE_COST_3STAR_CATACLYSM') {
        this.triggerImpactShake(18, 600);
        this.spawn3DFloatingPopup(
          new THREE.Vector3(0, 4.0, 0),
          '⚡ 99,999! 5코 3성 절대 권능! ⚡',
          '#facc15',
          true
        );
      }
    }
  }

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

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 128, 64);

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
        hitFlashTimerMs: 0,
        leapProgress: 0,
        leapStartPos: new THREE.Vector3(),
        leapTargetPos: new THREE.Vector3(),
      };
      this.unitJuiceMap.set(instanceId, juice);
    }
    return juice;
  }

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
    this.camera.position.y = 15.5 + shakeOffsetY;
    this.camera.position.z = 18.0;
    this.camera.lookAt(0, 0, 2.2);

    // 2. 판타지 횃불 깜빡임 (Flickering Torches)
    this.torchLights.forEach((t) => {
      const flicker = Math.sin(this.animClockMs * 0.008 + t.phase) * 0.4 +
                      Math.cos(this.animClockMs * 0.017 + t.phase) * 0.2;
      t.light.intensity = Math.max(1.2, t.baseIntensity + flicker);
    });

    // 3. 호버링/드래그 타일 물리적 엘리베이션 리프트 (Elevation Lift) & 황금 룬 반응
    for (const [key, mesh] of this.hexTileMeshes) {
      const isHovered =
        state.hoveredHex &&
        `${state.hoveredHex.row},${state.hoveredHex.col}` === key;
      const mat = mesh.material as THREE.MeshStandardMaterial;

      if (isHovered) {
        // 타일이 자석처럼 붕 떠오르고 황금 룬 발광
        mesh.position.y += (0.16 - mesh.position.y) * 0.35;
        mat.emissive.setHex(0xf59e0b);
        mat.emissiveIntensity = 0.65;
      } else {
        mesh.position.y += (0 - mesh.position.y) * 0.25;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    for (const [idx, mesh] of this.benchTileMeshes) {
      const isHovered = state.hoveredBenchIndex === idx;
      const mat = mesh.material as THREE.MeshStandardMaterial;

      if (isHovered) {
        mesh.position.y += (0.24 - mesh.position.y) * 0.35;
        mat.emissive.setHex(0x38bdf8);
        mat.emissiveIntensity = 0.7;
      } else {
        mesh.position.y += (0.08 - mesh.position.y) * 0.25;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    // 4. 유닛 동기화 및 3D 1:1 드래그 물리 모션 갱신
    this.syncUnits3D(dtMs, state);

    // 5. 투사체 & 팝업 & 스파크 업데이트
    this.updateProjectiles(dtMs);
    this.updatePopups(dtMs);
    this.updateSparks(dtMs);

    this.renderer.render(this.scene, this.camera);
  }

  private updateProjectiles(dtMs: number): void {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      p.elapsedMs += dtMs;
      const t = Math.min(1.0, p.elapsedMs / p.durationMs);

      const curX = p.startPos.x + (p.targetPos.x - p.startPos.x) * t;
      const curZ = p.startPos.z + (p.targetPos.z - p.startPos.z) * t;
      const curY =
        p.startPos.y +
        (p.targetPos.y - p.startPos.y) * t +
        Math.sin(t * Math.PI) * p.arcHeight;

      p.mesh.position.set(curX, curY, curZ);

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

      pop.sprite.position.y = pop.startPos.y + (t * pop.riseSpeed);
      pop.sprite.material.opacity = 1.0 - t * t;
    }
  }

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

      s.vel.y -= 9.8 * dtSec;
      s.mesh.position.x += s.vel.x * dtSec;
      s.mesh.position.y += s.vel.y * dtSec;
      s.mesh.position.z += s.vel.z * dtSec;

      const scale = 1.0 - s.lifeMs / s.maxLifeMs;
      s.mesh.scale.set(scale, scale, scale);
    }
  }

  /**
   * 유닛 3D 씬 오브젝트 동기화 & 1:1 손가락 추적 3D 드래그 모션
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

        let lungeOffsetX = 0;
        let lungeOffsetZ = 0;
        if (juice.lungeTimerMs > 0) {
          juice.lungeTimerMs = Math.max(0, juice.lungeTimerMs - dtMs);
          const ratio = Math.sin((juice.lungeTimerMs / juice.lungeMaxMs) * Math.PI);
          lungeOffsetX = juice.lungeDirX * ratio;
          lungeOffsetZ = juice.lungeDirZ * ratio;
        }

        if (juice.leapProgress > 0 && juice.leapProgress < 1.0) {
          juice.leapProgress = Math.min(1.0, juice.leapProgress + dtMs * 0.0035);
          const lp = juice.leapProgress;
          const lx = juice.leapStartPos.x + (juice.leapTargetPos.x - juice.leapStartPos.x) * lp;
          const lz = juice.leapStartPos.z + (juice.leapTargetPos.z - juice.leapStartPos.z) * lp;
          const ly = juice.leapStartPos.y + Math.sin(lp * Math.PI) * 2.8;
          group.position.set(lx, ly, lz);
        } else {
          group.position.x += (targetPos.x + lungeOffsetX - group.position.x) * 0.3;
          group.position.z += (targetPos.z + lungeOffsetZ - group.position.z) * 0.3;
          group.position.y = 0.2 + Math.sin(this.animClockMs * 0.005 + cu.row) * 0.05;
        }

        const targetRotY = cu.team === 'HOME' ? Math.PI : 0;
        group.rotation.y += (targetRotY - group.rotation.y) * 0.2;

        const star3Ring = group.getObjectByName('STAR3_RING');
        if (star3Ring) {
          star3Ring.rotation.z += 0.03;
        }

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
          const isDragged = state.isDraggingUnit && state.draggedInstanceId === u.instanceId;

          if (isDragged) {
            // [TFT 극상 조작감] 손가락 위치(currentDragWorldPos)를 1:1로 리얼타임 부드럽게 추종하며 공중에 둥실 뜸
            group.position.x += (this.currentDragWorldPos.x - group.position.x) * 0.45;
            group.position.z += (this.currentDragWorldPos.z - group.position.z) * 0.45;
            group.position.y += (1.45 - group.position.y) * 0.35;
          } else {
            group.position.x += (targetPos.x - group.position.x) * 0.28;
            group.position.z += (targetPos.z - group.position.z) * 0.28;
            group.position.y += (0.2 - group.position.y) * 0.28;
          }
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
        const isDragged = state.isDraggingUnit && state.draggedInstanceId === u.instanceId;

        if (isDragged) {
          group.position.x += (this.currentDragWorldPos.x - group.position.x) * 0.45;
          group.position.z += (this.currentDragWorldPos.z - group.position.z) * 0.45;
          group.position.y += (1.45 - group.position.y) * 0.35;
        } else {
          group.position.x += (targetPos.x - group.position.x) * 0.28;
          group.position.z += (targetPos.z - group.position.z) * 0.28;
          group.position.y += (0.25 - group.position.y) * 0.28;
        }
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
