// src/HexGridMath.ts

/**
 * 뾰족한 끝이 위로 가는 육각형(Pointy-top Odd-R Offset Hex Grid) 수학 및
 * 가로모드(Landscape) 전장 + 대기석(1x9) 통합 스케일러 모듈.
 *
 * - 행(row): 0 ~ 7 (총 8행: 상단 0~3행은 적군 AWAY, 하단 4~7행은 아군 HOME)
 * - 열(col): 0 ~ 6 (총 7열)
 * - Odd-R 규칙: 홀수 행(row % 2 === 1)의 타일들은 짝수 행보다 가로(x) 방향으로 반 칸(+hexWidth / 2) 오른쪽으로 밀려서 벌집 모양으로 맞물린다.
 * - 2.5D 원근 비율(perspectiveRatio = 0.78) 및 하단 1x9 석조 대기석 단상과 절대 겹치지 않는 수직 통합 메트릭스 산출.
 */

export interface HexCoord {
  row: number;
  col: number;
}

export interface CubeCoord {
  q: number;
  r: number;
  s: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface HexBoardViewportMetrics {
  arenaLeft: number;
  arenaTop: number;
  arenaWidth: number;
  arenaHeight: number;
  centerX: number;
  centerY: number;
  originX: number; // row=0, col=0 타일의 중심 X 좌표
  originY: number; // row=0, col=0 타일의 중심 Y 좌표
  hexRadius: number; // 육각형 기본 반지름 R
  perspectiveRatio: number; // 0.78 (2.5D 쿼터뷰 원근 비율)
  gapPx: number; // 타일 간 2px 미세 간격
  hexWidth: number; // Math.sqrt(3) * hexRadius
  hexHeight: number; // 2 * hexRadius * perspectiveRatio
  rowStepY: number; // 1.5 * hexRadius * perspectiveRatio
  boardTopY: number; // row=0 타일 상단 꼭짓점 Y
  boardBottomY: number; // row=7 타일 하단 꼭짓점(+베벨) Y
  benchTopY: number; // 1x9 대기석 단상 시작 Y (boardBottomY 아래 고정 간격)
  benchHeight: number; // 1x9 대기석 슬롯 높이
}

/**
 * Pointy-top Odd-R 육각형에서 짝수 행(row % 2 === 0)과 홀수 행(row % 2 === 1)의 6방향 인접 오프셋 테이블
 * 순서: 북동(NE), 동(E), 남동(SE), 남서(SW), 서(W), 북서(NW)
 */
const EVEN_ROW_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], // NE
  [0, 1], // E
  [1, 0], // SE
  [1, -1], // SW
  [0, -1], // W
  [-1, -1], // NW
];

const ODD_ROW_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 1], // NE
  [0, 1], // E
  [1, 1], // SE
  [1, 0], // SW
  [0, -1], // W
  [-1, 0], // NW
];

export class HexGridMath {
  public static readonly ROWS = 8;
  public static readonly COLS = 7;
  public static readonly PERSPECTIVE_RATIO = 0.78;
  public static readonly TILE_GAP_PX = 2;
  private static readonly SQRT3 = Math.sqrt(3);

  /**
   * 1) Odd-R 오프셋 좌표 (row, col) -> 3축 큐브 좌표 (q, r, s) 변환 (q + r + s === 0)
   */
  public static offsetToCube(row: number, col: number): CubeCoord {
    const q = col - ((row - (row & 1)) >> 1);
    const r = row;
    const s = -q - r;
    return { q, r, s };
  }

  /**
   * 2) 3축 큐브 좌표 (q, r, s) -> Odd-R 오프셋 좌표 (row, col) 변환
   */
  public static cubeToOffset(cube: CubeCoord): HexCoord {
    const col = cube.q + ((cube.r - (cube.r & 1)) >> 1);
    const row = cube.r;
    return { row, col };
  }

  /**
   * 3) 두 육각형 타일 간의 정확한 육각형 칸 거리(Hex Distance) 계산
   * 공식: (|dq| + |dr| + |ds|) / 2
   * 사거리 1 = 나를 둘러싼 육각형 6칸
   */
  public static hexDistance(
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ): number {
    const a = HexGridMath.offsetToCube(r1, c1);
    const b = HexGridMath.offsetToCube(r2, c2);
    return (
      (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2
    );
  }

  /**
   * 4) 두 육각형 타일 간의 유클리드 평면 거리 (타이브레이커용, 정규화된 hexWidth=1 기준)
   */
  public static hexEuclideanDistance(
    r1: number,
    c1: number,
    r2: number,
    c2: number
  ): number {
    const a = HexGridMath.offsetToPlane(r1, c1);
    const b = HexGridMath.offsetToPlane(r2, c2);
    return Math.hypot(b.x - a.x, b.z - a.z);
  }

  /** Odd-R 오프셋 → 연속 평면 좌표 (전투 자유이동용) */
  public static offsetToPlane(row: number, col: number): { x: number; z: number } {
    return {
      x: col + (Math.abs(Math.round(row)) % 2 === 1 ? 0.5 : 0),
      z: row * (Math.sqrt(3) / 2),
    };
  }

  public static planeDistance(
    ax: number,
    az: number,
    bx: number,
    bz: number
  ): number {
    return Math.hypot(bx - ax, bz - az);
  }

  /** 평면 좌표 → 가장 가까운 정수 헥스 (스킬/점유용) */
  public static planeToNearestOffset(
    x: number,
    z: number,
    maxRows: number = HexGridMath.ROWS,
    maxCols: number = HexGridMath.COLS
  ): HexCoord {
    const approxRow = z / (Math.sqrt(3) / 2);
    let best: HexCoord = {
      row: Math.max(0, Math.min(maxRows - 1, Math.round(approxRow))),
      col: Math.max(0, Math.min(maxCols - 1, Math.round(x))),
    };
    let bestDist = Infinity;
    const r0 = Math.max(0, Math.floor(approxRow) - 1);
    const r1 = Math.min(maxRows - 1, Math.ceil(approxRow) + 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < maxCols; c++) {
        const p = HexGridMath.offsetToPlane(r, c);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestDist) {
          bestDist = d;
          best = { row: r, col: c };
        }
      }
    }
    return best;
  }

  public static clampPlaneToBoard(
    x: number,
    z: number,
    maxRows: number = HexGridMath.ROWS,
    maxCols: number = HexGridMath.COLS
  ): { x: number; z: number } {
    const minP = HexGridMath.offsetToPlane(0, 0);
    const maxP = HexGridMath.offsetToPlane(maxRows - 1, maxCols - 1);
    // 홀수 행 오프셋까지 포함해 살짝 여유
    const minX = Math.min(minP.x, HexGridMath.offsetToPlane(1, 0).x) - 0.15;
    const maxX = Math.max(maxP.x, HexGridMath.offsetToPlane(1, maxCols - 1).x) + 0.15;
    const minZ = minP.z - 0.1;
    const maxZ = maxP.z + 0.1;
    return {
      x: Math.min(maxX, Math.max(minX, x)),
      z: Math.min(maxZ, Math.max(minZ, z)),
    };
  }

  /** 평면 좌표 → 2D 화면 픽셀 (자유이동 렌더용) */
  public static planeToScreen(
    posX: number,
    posZ: number,
    metrics: HexBoardViewportMetrics
  ): ScreenPoint {
    const rowFrac = posZ / (Math.sqrt(3) / 2);
    return {
      x: metrics.originX + posX * metrics.hexWidth,
      y: metrics.originY + rowFrac * metrics.rowStepY,
    };
  }

  /**
   * 5) 특정 육각형 타일 (row, col)과 맞닿아 있는 유효한 6방향 인접 이웃 타일 목록 반환
   * 짝수 행과 홀수 행의 대각선 인접 열 오프셋을 엄격히 구분한다.
   */
  public static getHexNeighbors(
    row: number,
    col: number,
    maxRows: number = HexGridMath.ROWS,
    maxCols: number = HexGridMath.COLS
  ): HexCoord[] {
    const offsets =
      Math.abs(row % 2) === 1
        ? ODD_ROW_NEIGHBOR_OFFSETS
        : EVEN_ROW_NEIGHBOR_OFFSETS;

    const neighbors: HexCoord[] = [];
    for (const [dr, dc] of offsets) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < maxRows && nc >= 0 && nc < maxCols) {
        neighbors.push({ row: nr, col: nc });
      }
    }
    return neighbors;
  }

  /**
   * 6) 가용 전장 영역(arenaLeft, arenaTop, arenaWidth, arenaHeight) 안에
   *    8행 x 7열 육각형 그리드 + 하단 1x9 대기석 단상(Bench Row)이
   *    단 1px의 겹침도 없이 수직 일체형으로 들어가도록 메트릭스를 산출한다.
   */
  public static computeBoardMetrics(
    arenaLeft: number,
    arenaTop: number,
    arenaWidth: number,
    arenaHeight: number,
    rows: number = HexGridMath.ROWS,
    cols: number = HexGridMath.COLS
  ): HexBoardViewportMetrics {
    const perspectiveRatio = HexGridMath.PERSPECTIVE_RATIO; // 0.78
    const gapPx = HexGridMath.TILE_GAP_PX; // 2px

    // 가로/세로 여백을 줄여 TFT처럼 필드가 화면을 더 크게 채우도록
    const maxRByWidth = (arenaWidth * 0.96) / (7.6 * Math.sqrt(3));
    const maxRByHeight = (arenaHeight * 0.98) / 12.65;
    const hexRadius = Math.max(
      9,
      Math.floor(Math.min(maxRByWidth, maxRByHeight))
    );

    const hexWidth = HexGridMath.SQRT3 * hexRadius;
    const hexHeight = 2 * hexRadius * perspectiveRatio;
    const rowStepY = 1.5 * hexRadius * perspectiveRatio;

    const spanCentersX = (cols - 1) * hexWidth + hexWidth * 0.5;
    const spanCentersY = (rows - 1) * rowStepY;

    // 상단 스프라이트/체력바 여백 + 8행 보드 + 대기석 단상 전체 높이를 구해 arenaHeight 정중앙에 배치
    const topHeadroom = hexRadius * 1.45;
    const bottomTileExtent = hexRadius * perspectiveRatio + 5;
    const benchGap = Math.max(6, Math.round(hexRadius * 0.34));
    const benchHeight = Math.max(24, Math.round(hexRadius * 1.48));
    const totalEnsembleHeight =
      topHeadroom + spanCentersY + bottomTileExtent + benchGap + benchHeight;

    const ensembleTop =
      arenaTop + Math.max(2, (arenaHeight - totalEnsembleHeight) * 0.5);

    const centerX = arenaLeft + arenaWidth * 0.5;
    const originX = centerX - spanCentersX * 0.5;
    const originY = ensembleTop + topHeadroom;
    const centerY = originY + spanCentersY * 0.5;

    const boardTopY = originY - hexRadius * perspectiveRatio;
    const boardBottomY = originY + spanCentersY + bottomTileExtent;
    const benchTopY = boardBottomY + benchGap;

    return {
      arenaLeft,
      arenaTop,
      arenaWidth,
      arenaHeight,
      centerX,
      centerY,
      originX,
      originY,
      hexRadius,
      perspectiveRatio,
      gapPx,
      hexWidth,
      hexHeight,
      rowStepY,
      boardTopY,
      boardBottomY,
      benchTopY,
      benchHeight,
    };
  }

  /**
   * 7) 육각형 타일 (row, col)의 2.5D 원근 적용 화면 픽셀 중심점 (x, y) 반환
   *    (실수형 보간 row/col도 지원하여 6방향 이동 시 부드러운 대각선 보간이 가능함)
   */
  public static hexToScreenCenter(
    row: number,
    col: number,
    metrics: HexBoardViewportMetrics
  ): ScreenPoint {
    const rFloor = Math.floor(row);
    const rFrac = row - rFloor;
    const oddShiftFloor = (Math.abs(rFloor) % 2 === 1 ? 0.5 : 0) * metrics.hexWidth;
    const oddShiftCeil =
      (Math.abs(rFloor + 1) % 2 === 1 ? 0.5 : 0) * metrics.hexWidth;
    const interpolatedShift =
      oddShiftFloor + (oddShiftCeil - oddShiftFloor) * rFrac;

    const x = metrics.originX + col * metrics.hexWidth + interpolatedShift;
    const y = metrics.originY + row * metrics.rowStepY;
    return { x, y };
  }

  /**
   * 8) 특정 중심점 (cx, cy)을 기준으로 2.5D 원근(perspectiveRatio = 0.78)이 적용된
   *    Pointy-top 육각형의 6개 꼭짓점 좌표 배열 반환
   */
  public static getHexPolygonVertices(
    cx: number,
    cy: number,
    radius: number,
    perspectiveRatio: number = HexGridMath.PERSPECTIVE_RATIO
  ): ScreenPoint[] {
    const pts: ScreenPoint[] = [];
    for (let i = 0; i < 6; i++) {
      const angleRad = ((60 * i - 30) * Math.PI) / 180;
      pts.push({
        x: cx + radius * Math.cos(angleRad),
        y: cy + radius * Math.sin(angleRad) * perspectiveRatio,
      });
    }
    return pts;
  }

  /**
   * 9) 화면 포인터 좌표 (px, py)로부터 가장 가까운 유효 육각형 타일 (row, col) 역산 (2.5D 원근 보정 히트 테스트)
   */
  public static screenPointToHex(
    px: number,
    py: number,
    metrics: HexBoardViewportMetrics,
    maxRows: number = HexGridMath.ROWS,
    maxCols: number = HexGridMath.COLS,
    toleranceMultiplier: number = 1.4
  ): HexCoord | null {
    let bestRow = -1;
    let bestCol = -1;
    let bestNormDistSq = Infinity;

    const hitRadiusX = metrics.hexRadius * toleranceMultiplier;
    const hitRadiusY = metrics.hexRadius * metrics.perspectiveRatio * (toleranceMultiplier * 1.05);

    for (let r = 0; r < maxRows; r++) {
      for (let c = 0; c < maxCols; c++) {
        const center = HexGridMath.hexToScreenCenter(r, c, metrics);
        const nx = (px - center.x) / hitRadiusX;
        const ny = (py - center.y) / hitRadiusY;
        const normDistSq = nx * nx + ny * ny;
        if (normDistSq <= 1.0 && normDistSq < bestNormDistSq) {
          bestNormDistSq = normDistSq;
          bestRow = r;
          bestCol = c;
        }
      }
    }

    if (bestRow === -1 || bestCol === -1) {
      return null;
    }
    return { row: bestRow, col: bestCol };
  }

  /**
   * 10) 두 육각형 타일 (fromRow, fromCol) -> (toRow, toCol) 사이의 6방향 직선 보간 픽셀 좌표 반환
   */
  public static lerpHexScreenPoint(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    t: number,
    metrics: HexBoardViewportMetrics
  ): ScreenPoint {
    const clampedT = Math.max(0, Math.min(1, t));
    const p1 = HexGridMath.hexToScreenCenter(fromRow, fromCol, metrics);
    const p2 = HexGridMath.hexToScreenCenter(toRow, toCol, metrics);
    return {
      x: p1.x + (p2.x - p1.x) * clampedT,
      y: p1.y + (p2.y - p1.y) * clampedT,
    };
  }
}

