// src/PixiVfxEngine.ts
/**
 * Pixi.js v8 WebGL Hardware-Accelerated VFX Engine.
 * Adds cinematic dark fantasy atmosphere, glowing additive particles,
 * hex placement shockwaves, and spell impact flashes over the battlefield.
 */

import { Application, Container, Graphics } from 'pixi.js';

interface HexShockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: number;
  alpha: number;
  lineWidth: number;
}

interface ArcaneEmber {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  color: number;
  wobbleSpeed: number;
  wobbleAmount: number;
}

export class PixiVfxEngine {
  private app: Application | null = null;
  private canvas: HTMLCanvasElement;
  private particleLayer: Container = new Container();
  private shockwaveLayer: Container = new Container();
  private shockwaveGraphics: Graphics = new Graphics();
  private emberGraphics: Graphics = new Graphics();

  private shockwaves: HexShockwave[] = [];
  private embers: ArcaneEmber[] = [];
  private maxEmbers: number = 45;

  private isInitialized: boolean = false;
  private viewportW: number = 800;
  private viewportH: number = 600;
  private dpr: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.app = new Application();
      await this.app.init({
        canvas: this.canvas,
        width: window.innerWidth || 800,
        height: window.innerHeight || 600,
        backgroundAlpha: 0,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: 'webgl',
      });

      this.app.stage.addChild(this.particleLayer);
      this.app.stage.addChild(this.shockwaveLayer);
      this.shockwaveLayer.addChild(this.shockwaveGraphics);
      this.particleLayer.addChild(this.emberGraphics);

      this.initEmbers();
      this.isInitialized = true;
    } catch (err) {
      console.warn('PixiVfxEngine initialization skipped (fallback active):', err);
    }
  }

  private initEmbers(): void {
    const colors = [0x38bdf8, 0x818cf8, 0xfacc15, 0x34d399, 0xf43f5e];
    this.embers = [];
    for (let i = 0; i < this.maxEmbers; i++) {
      this.embers.push({
        x: Math.random() * (window.innerWidth || 800),
        y: Math.random() * (window.innerHeight || 600),
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.3 + Math.random() * 0.6),
        size: 1.5 + Math.random() * 2.5,
        alpha: Math.random() * 0.6,
        maxAlpha: 0.35 + Math.random() * 0.45,
        color: colors[Math.floor(Math.random() * colors.length)],
        wobbleSpeed: 0.02 + Math.random() * 0.04,
        wobbleAmount: 0.5 + Math.random() * 1.2,
      });
    }
  }

  public resize(width: number, height: number, dpr: number = 1): void {
    this.viewportW = width;
    this.viewportH = height;
    this.dpr = dpr;
    if (this.app && this.app.renderer) {
      this.app.renderer.resize(width, height);
    }
  }

  /**
   * 유닛을 보드에 쿵 내려놓았을 때 발생하는 육각형 발광 충격파 (Placement Shockwave)
   */
  public triggerPlacementShockwave(
    x: number,
    y: number,
    color: number = 0x38bdf8
  ): void {
    this.shockwaves.push({
      x,
      y,
      radius: 12,
      maxRadius: 58,
      color,
      alpha: 0.95,
      lineWidth: 3.5,
    });
  }

  /**
   * 스킬 시전 및 치명타 시 발생하는 폭발적 WebGL 링 충격파
   */
  public triggerSkillExplosion(
    x: number,
    y: number,
    color: number = 0xfacc15
  ): void {
    this.shockwaves.push({
      x,
      y,
      radius: 8,
      maxRadius: 85,
      color,
      alpha: 1.0,
      lineWidth: 4.5,
    });
  }

  /**
   * 매 프레임 WebGL 파티클 및 충격파 렌더링 갱신
   */
  public update(dtMs: number): void {
    if (!this.isInitialized || !this.app) return;

    const dt = Math.min(dtMs, 50);

    // 1. Arcane Embers 업데이트
    this.emberGraphics.clear();
    for (const em of this.embers) {
      em.y += em.vy * (dt / 16.6);
      em.x += (em.vx + Math.sin(em.y * em.wobbleSpeed) * em.wobbleAmount) * (dt / 16.6);

      if (em.y < -10) {
        em.y = this.viewportH + 10;
        em.x = Math.random() * this.viewportW;
      }
      if (em.x < -10) em.x = this.viewportW + 10;
      if (em.x > this.viewportW + 10) em.x = -10;

      this.emberGraphics.circle(em.x, em.y, em.size);
      this.emberGraphics.fill({ color: em.color, alpha: em.alpha });
    }

    // 2. Shockwaves 렌더링 & 수명 처리
    this.shockwaveGraphics.clear();
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      const progress = sw.radius / sw.maxRadius;
      sw.radius += (sw.maxRadius - sw.radius) * 0.18 + 0.8;
      sw.alpha = Math.max(0, 1 - progress);
      sw.lineWidth = Math.max(1, (1 - progress) * 4);

      if (sw.alpha <= 0.02 || sw.radius >= sw.maxRadius - 1) {
        this.shockwaves.splice(i, 1);
        continue;
      }

      // Draw Hexagonal shockwave
      this.drawHexPolygon(
        this.shockwaveGraphics,
        sw.x,
        sw.y,
        sw.radius,
        sw.color,
        sw.alpha,
        sw.lineWidth
      );
    }
  }

  private drawHexPolygon(
    g: Graphics,
    cx: number,
    cy: number,
    radius: number,
    color: number,
    alpha: number,
    lineWidth: number
  ): void {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      const hx = cx + radius * Math.cos(angle);
      const hy = cy + radius * Math.sin(angle);
      if (i === 0) g.moveTo(hx, hy);
      else g.lineTo(hx, hy);
    }
    g.closePath();
    g.stroke({ width: lineWidth, color, alpha });
  }
}
