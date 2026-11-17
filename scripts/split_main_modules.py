#!/usr/bin/env python3
from pathlib import Path
import re

orig = Path('/tmp/main.orig.ts').read_text().splitlines(keepends=True)
root = Path('/agent/repos/WWCHESS')

RANGES = {
    'domBindings.ts': (195, 535),
    'pointerDrag.ts': (537, 1218),
    'hudModals.ts': (1224, 2086),
    'renderBridge.ts': (2092, 2243),
}

HEADER = Path(root / 'scripts/app_module_header.ts').read_text()

def convert_lines(lines):
    out = []
    for line in lines:
        m = re.match(r'^  private (\w+)\(', line)
        if m:
            name = m.group(1)
            paren = line.index('(', m.start())
            after_open = line[paren + 1 :]
            if after_open.startswith(')'):
                line = f'export function {name}(app: FantasyAutoBattlerApp{after_open}'
            else:
                line = f'export function {name}(app: FantasyAutoBattlerApp, {after_open}'
        line = line.replace('this.', 'app.')
        out.append(line)
    return '\n' + ''.join(out)

for fname, (a, b) in RANGES.items():
    chunk = orig[a - 1 : b]
    (root / 'src/app' / fname).write_text(
        HEADER.replace('__FNAME__', fname) + convert_lines(chunk)
    )

types_start = next(i for i, l in enumerate(orig) if l.startswith('type DragPayload'))

extracted = set()
for a, b in RANGES.values():
    extracted.update(range(a, b + 1))

keep = []
for i, line in enumerate(orig, 1):
    if i < 64 or i > 2367:
        continue
    if 'class FantasyAutoBattlerApp' in line:
        continue
    if i in extracted:
        continue
    keep.append(line)

body = ''.join(keep)

public_fields = [
    'game', 'fxCanvas', 'pixiCanvas', 'threeCanvas', 'pixelRenderer', 'pixiVfx', 'threeRenderer',
    'is3DViewMode', 'lastProcessedCombatTick', 'lastProcessedCombatEngine', 'lastTriggeredLaserKey',
    'lastKnownPhase', 'knownThreeStarUnits', 'isPortraitRotated', 'isShopManuallyCollapsed',
    'activePointerId', 'pointerDownTime', 'pointerStartX', 'pointerStartY', 'isDragging',
    'dragPayload', 'tapCallback', 'hoveredHex', 'hoveredBenchIndex', 'selectedUnitInstanceId',
    'pendingAvatarMove', 'isInGameSession',
]
for field in public_fields:
    body = body.replace(f'private {field}:', f'public {field}:')
for fn in [
    'clientToCanvasPoint', 'isShopCurrentlyExpanded', 'tryLockNativeLandscape',
    'enableImmersiveFullscreen', 'exitFullscreen', 'refreshLobbyContentBadges',
    'startNewGameFromLobby', 'returnToLobbyScreen', 'openSettingsModal', 'closeSettingsModal',
]:
    body = body.replace(f'private {fn}(', f'public {fn}(')

METHOD_MAP = {
    'bindGlobalDOMEvents': 'domBindings',
    'handleCanvasPointerDown': 'pointerDrag', 'startPointerInteraction': 'pointerDrag',
    'handlePointerMove': 'pointerDrag', 'handlePointerUp': 'pointerDrag',
    'showDragGhost': 'pointerDrag', 'updateDragGhostPosition': 'pointerDrag',
    'hideDragGhost': 'pointerDrag', 'showSellDropzoneOverlay': 'pointerDrag',
    'hideSellDropzoneOverlay': 'pointerDrag', 'completeDropAtPoint': 'pointerDrag',
    'onGameStateUpdated': 'hudModals', 'renderAllHUD': 'hudModals', 'renderTopHud': 'hudModals',
    'renderLeftFloatingDock': 'hudModals', 'renderLootOrbs': 'hudModals',
    'renderRightLeaderboard': 'hudModals', 'renderShopAndControls': 'hudModals',
    'renderPhaseModals': 'hudModals', 'openPoolInspectorModal': 'hudModals',
    'openRankModal': 'hudModals', 'showTapTooltip': 'hudModals', 'showUnitDetailTooltip': 'hudModals',
    'showCombatUnitTooltip': 'hudModals', 'checkNewStarUpgrades': 'hudModals',
    'resizeCanvas': 'renderBridge', 'startRenderLoop': 'renderBridge',
}
delegators = ''.join(
    f"  public {name}(...args: unknown[]): unknown {{\n"
    f"    return ({mod}.{name} as (app: FantasyAutoBattlerApp, ...a: unknown[]) => unknown)(this, ...args);\n"
    f"  }}\n\n"
    for name, mod in METHOD_MAP.items()
)

imports = ''.join(orig[:types_start]).replace('// src/main.ts', '// src/FantasyAutoBattlerApp.ts')
imports += "import { DragPayload, PERSONA_BADGE_LABELS } from './app/types';\n"
for m in ['pointerDrag', 'hudModals', 'renderBridge', 'domBindings']:
    imports += f"import * as {m} from './app/{m}';\n"

(root / 'src/FantasyAutoBattlerApp.ts').write_text(
    imports + '\nexport class FantasyAutoBattlerApp {\n' + body + delegators + '}\n'
)