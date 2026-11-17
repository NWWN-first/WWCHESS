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

## 프로덕션 빌드

```bash
npm run build
npm run preview
```

## 헤드리스 밸런스 시뮬 (봇 QA)

```bash
npm run simulate
# 빠른 스모크: GAMES=200 npm run simulate
```

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

`main` 푸시 시 GitHub Actions가 APK를 빌드하고 `apk-<run>-<sha>` 태그로 Release에 올립니다.