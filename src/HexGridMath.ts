// src/HexGridMath.ts

/**
 * 뾰족한 끝이 위로 가는 육각형(Pointy-top Odd-R Offset Hex Grid) 수학 및 좌표 변환 모듈.
 *
 * - 행(row): 0 ~ 7 (총 8행: 상단 0~3행은 적군 AWAY, 하단 4~7행은 아군 HOME)
 * - 열(col): 0 ~ 6 (총 7열)
 * - Odd-R 규칙: 홀수 행(row % 2 === 1)의 타일들은 짝수 행보다 가로(x) 방향으로 반 칸(+hexWidth / 2) 오른쪽으로 밀려서 벌집 모양으로 맞물린다.
 * - 세로(y) 간격은 hexHeight * 0.75로 맞물려 배치된다.
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
  originX: number; // row=0, col=0 타일의 중심 X 좌표
  originY: number; // row=0, col=0 타일의 중심 Y 좌표
  hexRadius: number; // 육각형 중심에서 꼭짓점까지의 반지름 R
  hexWidth: number; // sqrt(3) * R
  hexHeight: number; // 2 * R
  rowStepY: number; // hexHeight * 0.75 (1.5 * R)
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
    const x1 = c1 + (r1 % 2 === 1 ? 0.5 : 0);
    const y1 = r1 * (Math.sqrt(3) / 2);
    const x2 = c2 + (r2 % 2 === 1 ? 0.5 : 0);
    const y2 = r2 * (Math.sqrt(3) / 2);
    return Math.hypot(x2 - x1, y2 - y1);
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
   * 6) 주어진 전장 영역(캔버스 내 사각형 박스) 안에 8행 x 7열 Pointy-top Odd-R 육각형 보드가
   *    꽉 차고 중앙 정렬되도록 메트릭스(hexWidth, hexHeight, originX, originY)를 계산한다.
   */
  public static computeBoardMetrics(
    areaLeft: number,
    areaTop: number,
    areaWidth: number,
    areaHeight: number,
    rows: number = HexGridMath.ROWS,
    cols: number = HexGridMath.COLS
  ): HexBoardViewportMetrics {
    // 가로 전체 폭 = (cols + 0.5) * hexWidth = (cols + 0.5) * sqrt(3) * R
    // 세로 전체 높이 = ((rows - 1) * 0.75 + 1.0) * hexHeight = ((rows - 1) * 1.5 + 2.0) * R
    const maxRadiusByWidth = areaWidth / ((cols + 0.55) * HexGridMath.SQRT3);
    const maxRadiusByHeight = areaHeight / ((rows - 1) * 1.5 + 2.15);

    const hexRadius = Math.max(14, Math.min(maxRadiusByWidth, maxRadiusByHeight));
    const hexWidth = HexGridMath.SQRT3 * hexRadius;
    const hexHeight = 2 * hexRadius;
    const rowStepY = hexHeight * 0.75;

    const totalGridWidth = (cols - 1) * hexWidth + hexWidth * 0.5;
    const totalGridHeight = (rows - 1) * rowStepY;

    const originX = areaLeft + (areaWidth - totalGridWidth) * 0.5;
    const originY = areaTop + (areaHeight - totalGridHeight) * 0.5;

    return {
      originX,
      originY,
      hexRadius,
      hexWidth,
      hexHeight,
      rowStepY,
    };
  }

  /**
   * 7) 육각형 (row, col) -> 화면 픽셀 중심점 (x, y) 변환
   * - 홀수 행(row % 2 === 1)은 짝수 행보다 +hexWidth / 2 만큼 오른쪽으로 오프셋
   * - 세로 간격은 hexHeight * 0.75
   */
  public static hexToScreenCenter(
    row: number,
    col: number,
    metrics: HexBoardViewportMetrics
  ): ScreenPoint {
    const isOddRow = Math.abs(row % 2) === 1;
    const x =
      metrics.originX +
      col * metrics.hexWidth +
      (isOddRow ? metrics.hexWidth * 0.5 : 0);
    const y = metrics.originY + row * metrics.rowStepY;
    return { x, y };
  }

  /**
   * 8) 실수(보간된) 육각형 행/열 또는 두 육각형 타일 간 보간 좌표 계산
   */
  public static lerpHexScreenPoint(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    t: number,
    metrics: HexBoardViewportMetrics
  ): ScreenPoint {
    const p1 = HexGridMath.hexToScreenCenter(fromRow, fromCol, metrics);
    const p2 = HexGridMath.hexToScreenCenter(toRow, toCol, metrics);
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
  }

  /**
   * 9) 화면 터치/포인터 좌표 (px, py)에서 가장 가까운 육각형 타일 (row, col)을 찾아 반환한다.
   *    가장 가까운 중심점과의 거리가 hexRadius * 1.12 이내일 때만 유효한 타일 히트로 판정한다.
   */
  public static screenPointToHex(
    px: number,
    py: number,
    metrics: HexBoardViewportMetrics,
    rows: number = HexGridMath.ROWS,
    cols: number = HexGridMath.COLS
  ): HexCoord | null {
    let bestRow = -1;
    let bestCol = -1;
    let bestDistSq = Infinity;
    const maxHitDist = metrics.hexRadius * 1.12;
    const maxHitDistSq = maxHitDist * maxHitDist;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const center = HexGridMath.hexToScreenCenter(r, c, metrics);
        const dx = px - center.x;
        const dy = py - center.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq && distSq <= maxHitDistSq) {
          bestDistSq = distSq;
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
   * 10) Pointy-top 육각형의 6개 꼭짓점 좌표 배열 반환 (상단 뾰족 끝 -90도부터 시계 방향)
   */
  public static getHexPolygonVertices(
    cx: number,
    cy: number,
    radius: number,
    verticalScale: number = 1.0
  ): ScreenPoint[] {
    const pts: ScreenPoint[] = [];
    for (let i = 0; i < 6; i++) {
      const angleRad = ((60 * i - 30) * Math.PI) / 180;
      pts.push({
        x: cx + radius * Math.cos(angleRad),
        y: cy + radius * Math.sin(angleRad) * verticalScale,
      });
    }
    return pts;
  }
}
