// src/ThreeJsGameRenderer.ts
/**
 * Three.js 3D WebGL Low-Poly Fantasy Auto-Battler Renderer (Style A).
 * Implements TFT-style 3D Quarter-view Perspective Camera, Extruded Beveled 3D Hexagon Tiles,
 * Dynamic Directional Shadows, 3D Raycaster Hit Testing, and Procedural Low-Poly Champion Models.
 */

import * as THREE from 'three';
import {
  CostTier,
  ItemId,
  StarLevel,
  UNIT_TEMPLATES,
} from './GameData';
import { HexCoord } from './HexGridMath';
import { Participant, UnitInstance } from './Participant';
import { CombatEvent, CombatUnit } from './SkillRegistry';

export type WeaponKind =
  | 'GREATSWORD'
  | 'SWORD_SHIELD'
  | 'DUAL_DAGGERS'
  | 'BOW'
  | 'ARCANE_STAFF'
  | 'NATURE_STAFF'
  | 'SCYTHE'
  | 'DRAGON_CLAW'
  | 'SPEAR';

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

export class ThreeJsGameRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;

  // 3D 전장 그리드 메트릭 (3D World Space)
  public readonly hexRadius: number = 1.15;
  public readonly hexWidth: number = Math.sqrt(3) * 1.15; // ~1.99
  public readonly rowStepZ: number = 1.5 * 1.15; // 1.725
  public readonly benchZ: number = 4 * 1.725 + 2.2;

  // 3D 오브젝트 컬렉션
  private boardGroup: THREE.Group = new THREE.Group();
  private benchGroup: THREE.Group = new THREE.Group();
  private unitsGroup: THREE.Group = new THREE.Group();
  private vfxGroup: THREE.Group = new THREE.Group();

  // 타일 및 벤치 메시 맵 (Raycasting용)
  private hexTileMeshes: Map<string, THREE.Mesh> = new Map();
  private benchTileMeshes: Map<number, THREE.Mesh> = new Map();
  private tileDefaultMaterials: Map<string, THREE.Material> = new Map();

  // 유닛 3D 메시 캐시
  private unitMeshes: Map<string, THREE.Group> = new THREE.Group() as unknown as Map<string, THREE.Group>;
  private unitMeshesMap: Map<string, THREE.Group> = new Map();

  // 조명
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;

  // 카메라 쉐이크
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

    // 1. TFT 롤토체스 쿼터뷰 3D 카메라 설정
    const aspect = (window.innerWidth || 800) / (window.innerHeight || 600);
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 120);
    this.camera.position.set(0, 16.5, 20.5);
    this.camera.lookAt(0, -0.5, 1.2);

    // 2. 고성능 WebGL 3D 렌더러
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
    this.scene.add(this.vfxGroup);

    this.build3DHexArena();
    this.build3DStoneBench();
    this.buildBattlefieldSurroundings();
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
        this.tileDefaultMaterials.set(key, mat);
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

      // 테두리 라인
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
    // 웅장한 콜로세움 석조 바닥 베이스
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
   * 2D HexCoord (row, col) -> 3D World Position (X, Y, Z)
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
   * 3D 로우폴리 캐릭터 메시 빌더 (Style A: 캐주얼 판타지 전사/마법사/암살자/궁수)
   */
  public create3DChampionMesh(
    unitId: string,
    cost: CostTier,
    starLevel: StarLevel
  ): THREE.Group {
    const group = new THREE.Group();
    const template = UNIT_TEMPLATES[unitId];

    // 코스트별 팔레트 색상
    const costColors: Record<CostTier, number> = {
      1: 0x94a3b8, // 실버
      2: 0x10b981, // 에메랄드
      3: 0x38bdf8, // 사파이어
      4: 0xc084fc, // 자수정
      5: 0xfacc15, // 황금
    };
    const mainColor = costColors[cost] || 0x38bdf8;

    // 성급 스케일 (1성: 1.0배, 2성: 1.25배, 3성: 1.55배)
    const scale = starLevel === 3 ? 1.55 : starLevel === 2 ? 1.25 : 1.0;

    // 1. 몸통 (Body Box/Cylinder)
    const bodyGeo = new THREE.BoxGeometry(0.75, 0.95, 0.55);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      roughness: 0.4,
      metalness: 0.5,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.95;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // 2. 머리 & 투구 (Head & Helm)
    const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.3,
      metalness: 0.6,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.7;
    head.castShadow = true;
    group.add(head);

    // 투구 장식 뿔 / 바이저
    const visorGeo = new THREE.BoxGeometry(0.5, 0.16, 0.64);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: mainColor,
      emissiveIntensity: 0.5,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.7, 0.05);
    group.add(visor);

    // 3. 어깨 갑주 견갑 (Pauldrons)
    const pauldronGeo = new THREE.BoxGeometry(0.35, 0.35, 0.45);
    const pauldronMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.7,
      roughness: 0.3,
    });
    const leftPauldron = new THREE.Mesh(pauldronGeo, pauldronMat);
    leftPauldron.position.set(-0.55, 1.35, 0);
    const rightPauldron = new THREE.Mesh(pauldronGeo, pauldronMat);
    rightPauldron.position.set(0.55, 1.35, 0);
    group.add(leftPauldron);
    group.add(rightPauldron);

    // 4. 상징 3D 무기 (Weapon)
    const weaponGroup = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(0.18, 1.4, 0.08);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: mainColor,
      emissiveIntensity: 0.3,
      metalness: 0.9,
      roughness: 0.2,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.6;
    weaponGroup.add(blade);

    // 힐트
    const hiltGeo = new THREE.BoxGeometry(0.5, 0.1, 0.15);
    const hiltMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const hilt = new THREE.Mesh(hiltGeo, hiltMat);
    weaponGroup.add(hilt);

    weaponGroup.position.set(0.65, 0.9, 0.2);
    weaponGroup.rotation.x = Math.PI / 8;
    group.add(weaponGroup);

    // 5. 3성 기물 전용 회전 황금 마법진
    if (starLevel === 3) {
      const circleGeo = new THREE.RingGeometry(1.0, 1.15, 6);
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

    // 4. 유닛 동기화 및 렌더링
    this.syncUnits3D(state);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 게임 상태의 유닛들을 3D 씬 오브젝트로 동기화
   */
  private syncUnits3D(state: RenderState3D): void {
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

        const targetPos = this.hexToWorldPos(cu.row, cu.col);
        // 부드러운 위치 보간 (Lerp)
        group.position.x += (targetPos.x - group.position.x) * 0.25;
        group.position.z += (targetPos.z - group.position.z) * 0.25;
        group.position.y = 0.2 + Math.sin(this.animClockMs * 0.005 + cu.row) * 0.06;

        // 적군을 바라보도록 Y 회전
        const targetRotY = cu.team === 'HOME' ? Math.PI : 0;
        group.rotation.y += (targetRotY - group.rotation.y) * 0.2;

        // 3성 링 회전
        const star3Ring = group.getObjectByName('STAR3_RING');
        if (star3Ring) {
          star3Ring.rotation.z += 0.03;
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
      }
    }

    // 소멸된 기물 제거
    for (const [id, group] of this.unitMeshesMap) {
      if (!activeIds.has(id)) {
        this.unitsGroup.remove(group);
        this.unitMeshesMap.delete(id);
      }
    }
  }
}
