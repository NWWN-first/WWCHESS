// src/main.ts — thin bootstrap
import { FantasyAutoBattlerApp } from './FantasyAutoBattlerApp';

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    new FantasyAutoBattlerApp();
  });
} else {
  new FantasyAutoBattlerApp();
}
