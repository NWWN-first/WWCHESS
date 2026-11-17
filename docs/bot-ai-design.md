# WWCHESS 봇 AI 설계 메모

**목표:** ONNX·인라인 신경망을 살려 **페르소나마다 다른 매크로**, **벤치/보드 실수 감소**, **전술적 리롤**을 달성한다.

## 추론 경로

| 환경 | 동작 |
|------|------|
| 브라우저(WebView) | `NeuralBotEngine.tryInitOnnx()` → 세션 준비 시 `predictONNX`, 실패·대기 중 `predictSync` |
| Node 시뮬 (기본) | `window` 없음 → `predictSync` (가중치는 ONNX export와 동일) |
| Node 시뮬 (`USE_ONNX_SIM=1`) | 시작 시 ONNX·SYNC 패리티 검증 → 게임 본문 SYNC |

`AIBotController.runNeuralInferenceForBrain()`:

1. 봇별 `decisionSeed`·`policyTemperature`·`logitBias(페르소나)`로 **동일 상태도 다른 매크로** 샘플링
2. `preferOnnxBackend` 봇은 ONNX 결과가 오면 매크로·골드 하한을 **재적용**
3. **게임당 1회** DevTools: `[WWCHESS AI] … inference backend: ONNX|SYNC`

## 페르소나 배정 (로비)

**독립 가중 랜덤** — 봇 7명 각각 `PERSONA_WEIGHT_TABLE`에서 추첨.

- 여러 봇이 같은 페르소나 가능
- 7명 전원 동일 페르소나도 가능
- 예전처럼 7종을 한 번씩 섞어 나누는 방식은 사용하지 않음

| 페르소나 | 성향 | 로짓 바이어스 요약 |
|----------|------|-------------------|
| `HYPER_ROLLER` | 고속 리롤 | SAVE −, ROLL/STABILIZE + |
| `LOW_COST_REROLLER` | 저코 3성 | HYPER와 유사 |
| `FAST_NINE_GREEDY` | 9렙·고코 | SAVE +, ROLL − |
| `FAST_NINE_ECONOMIST` | 이자·레벨템포 | SAVE/TEMPO +, ROLL − |
| `GOBLIN_GAMBLER` | 황금·올인 | ROLL/STABILIZE + |
| `FLEX_MASTER` | 밸런스 | 소폭 TEMPO/STABILIZE |
| `FLEX_BALANCED` | 변형 플렉스 | TEMPO/STABILIZE + |

## 매크로 → 행동 (Phase 1.5)

- `SAVE_INTEREST` → 페르소나별 이자 마진 (FAST9는 full cap, 리롤러는 ~24–36G로 완화해 평상시 리롤 여력 유지)
- `TEMPO_LEVEL` → 골드 하한 −18·effective ≤10G, **연속 buyXp** (스테이지+2~9렙 목표)
- `ROLLDOWN` / `STABILIZE_REROLL` → 리롤 상한·골드 하한 완화(6G)
- `getEffectiveGoldFloor()` → 대기석·보드 미충원·저코 리롤 윈도(5~7렙) 추가 완화

## 플레이 품질 (Phase 1)

- `ensureCombatReadyBoard` / `trimExcessBenchUnits`
- 정비 틱·`executeAITurn` 종료 시 위 로직 실행

## 검증 (GAMES=200)

| 지표 | Phase 1 (PR #5 이전) | Phase 1.5 |
|------|----------------------|-----------|
| 크래시/데드락 | 0 / 0 | 0 / 0 |
| 대기석 가득 전투 | 0.0% | 0.0% |
| 평상시 리롤 실행률 | ~0% | **7.6%** |
| 평상시 골드하한 차단률 | **100%** | **91.4%** |
| TEMPO_LEVEL 매크로 비중 | **0%** | **1~4%** (페르소나별, `[1-C2]`) |
| 올인 리롤 실행률 | ~9.9% | ~8.9% |

> **ONNX:** KPI·기본 시뮬은 SYNC. `USE_ONNX_SIM=1`로 헤드레스 ONNX 패리티 검증 가능. 브라우저는 게임당 봇 1줄 debug 로그.

## 다음 반복 (Phase 2+)

- `main.ts` 분할, `GameData` 모듈화
- ONNX 시뮬 검증 (`onnxruntime-node` 옵션)
- KPI 기반 추가 리롤/이자 튜닝

*로드맵: `docs/wwchess-cleanup-plan.md` (repo) · Project store `docs/wwchess-cleanup-plan.md`*