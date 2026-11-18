# WWCHESS Fantasy AutoBattler

브라우저·Android에서 플레이하는 8인 헥사 오토배틀러(TFT 스타일). **ONNX Runtime Web** + 인라인 신경망 가중치로 오프라인 AI 봇이 동작합니다.

## 요구 사항

- Node.js 20+
- Android APK 로컬 빌드 시 JDK 17

## 웹 개발

```bash
npm ci
npm run dev
```

기본 주소: `http://localhost:5173`

### 브라우저 봇 매크로 ONNX

웹·WebView에서는 `public/models/wwchess_bot.onnx`를 `onnxruntime-web`으로 로드합니다. 세션이 준비되면 **모든 봇** 매크로가 ONNX 추론으로 갱신되고, 로드 실패·대기 중에는 인라인 `predictSync`가 그대로 사용됩니다.

| 환경 변수 | 의미 |
|-----------|------|
| *(미설정)* | 브라우저에서 ONNX 매크로 사용 (기본) |
| `VITE_USE_ONNX_BOT=0` | 브라우저에서도 SYNC만 (`preferOnnxBackend` 봇만 예외적으로 ONNX 재시도) |

```bash
VITE_USE_ONNX_BOT=0 npm run dev   # 디버그: SYNC 고정
```

## 프로덕션 빌드

```bash
npm run build
npm run preview
```

## 헤드리스 밸런스 시뮬 (봇 QA)

```bash
npm run simulate
# CI 스모크 (기본 50판): GAMES=50 npm run simulate
# AI KPI (200판 + 게이트): GAMES=200 SIM_KPI=1 npm run simulate
# ONNX parity (optional, onnxruntime-node): USE_ONNX_SIM=1 GAMES=50 npm run simulate
# 또는: npm run simulate:onnx
```

기본 시뮬·KPI CI는 **SYNC** (`predictSync`)만 사용합니다. `USE_ONNX_SIM=1`이면 시작 시 `onnxruntime-node`로 ONNX·SYNC 로짓 패리티를 검증한 뒤, 게임 본문은 SYNC로 진행합니다(성능·CI 시간). 선택 워크플로: `simulate-onnx-parity.yml`.

### 시뮬 KPI (SIM_KPI=1)

| 지표 | 임계값 |
|------|--------|
| 게임 크래시 | 0 |
| 데드락 / 라운드캡 중단 | 0 |
| 대기석 가득 찬 채 전투 진입 비율 | ≤ 5% (`KPI_MAX_BENCH_FULL_RATE`, 기본 `0.05`) |

매크로 분포·APM 등은 로그만 출력하며 첫 CI 반복에서는 실패 조건에 넣지 않습니다.

## Android APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

산출물: `android/app/build/outputs/apk/debug/app-debug.apk`

**디버그 WebView** (`allowMixedContent`, `webContentsDebuggingEnabled`)는 프로덕션 기본값 `false`입니다. 로컬 디버그 시:

```bash
CAPACITOR_DEBUG=1 npx cap sync android
```

## 프로젝트 구조

| 경로 | 설명 |
|------|------|
| `src/main.ts` | UI·렌더 루프 |
| `src/GameLoopManager.ts` | 라운드·페이즈 |
| `src/AIBotController.ts` | 페르소나·신경망·상점/배치 |
| `src/NeuralBotEngine.ts` | `predictONNX` / `predictSync` |
| `public/models/wwchess_bot.onnx` | 학습 ONNX (웹 추론) |
| `scripts/simulate1000.ts` | 헤드리스 시뮬 |

## CI

| 워크플로 | 트리거 | 시뮬 |
|---------|--------|------|
| `simulate-smoke.yml` | PR·push (`main`, `cursor/**`) | `GAMES=50` — 크래시·데드락만 관찰 (하드 게이트 없음) |
| `simulate-ai-kpi.yml` | PR (봇/AI 경로 변경) · `workflow_dispatch` | `GAMES=200` + `SIM_KPI=1` (위 KPI 표) |
| `simulate-onnx-parity.yml` | PR (봇/ONNX 경로) · `workflow_dispatch` | `GAMES=50` + `USE_ONNX_SIM=1` (KPI 게이트 없음) |
| `build-apk.yml` | `main` 푸시 | APK 빌드 · Release 태그 `apk-<run>-<sha>` |

수동 장회: Actions → **Simulate AI KPI** → `games` 입력 (기본 500).