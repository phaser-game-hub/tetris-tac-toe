import Phaser from 'phaser';
import { Game } from '../game/Game';
import type { ClearStep, ClearedCell } from '../game/Game';
import { MUSIC_CONFIG, SOUND_CONFIG, audioUrl } from '../game/audioConfig';
import type { SoundKey } from '../game/audioConfig';
import { loadBestScore, saveBestScore } from '../game/bestScore';
import type { Grid, SymbolType } from '../game/model';
import type { TaskCompletion, TaskState } from '../game/taskConfig';

/**
 * Стандартная рамка поля. Она не меняется с уровнем: в текущем конфиге
 * количество клеток внутри уменьшается, поэтому сами клетки крупнее.
 */
const BOARD_X = 170;
const BOARD_Y = 100;
const BOARD_W = 380;
const BOARD_H = 760;
const MIN_CELL = 10;

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const TEXT_COLOR = '#f4f2ff';
const MUTED_COLOR = '#b9b4e8';

const PANEL_FILL = 0x2a2f74;
const PANEL_EDGE = 0x6a5fe0;
const SLOT_FILL = 0x1b1f52;
const BUTTON_FILL = 0x3a3f92;
const BUTTON_EDGE = 0x7c6cf0;

const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT,
    fontSize: '12px',
    fontStyle: 'bold',
    color: MUTED_COLOR,
};

const valueStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT,
    fontSize: '24px',
    fontStyle: 'bold',
    color: TEXT_COLOR,
};

export default class MainScene extends Phaser.Scene {
    private state!: Game;
    private boardGfx!: Phaser.GameObjects.Graphics;
    private tilesGfx!: Phaser.GameObjects.Graphics;
    private nextGfx!: Phaser.GameObjects.Graphics;
    private cell = 38;
    private gridX = BOARD_X;
    private gridY = BOARD_Y;
    private gridW = BOARD_W;
    private gridH = BOARD_H;
    private boardCols = 0;
    private boardRows = 0;
    private scoreText!: Phaser.GameObjects.Text;
    private bestText!: Phaser.GameObjects.Text;
    private levelText!: Phaser.GameObjects.Text;
    private linesText!: Phaser.GameObjects.Text;
    private tasksText!: Phaser.GameObjects.Text;
    private destroyedXText!: Phaser.GameObjects.Text;
    private destroyedOText!: Phaser.GameObjects.Text;
    private bestScore = 0;
    private overlay!: Phaser.GameObjects.Container;
    private overlayTitle!: Phaser.GameObjects.Text;
    private overlayHint!: Phaser.GameObjects.Text;
    private comboBadge!: Phaser.GameObjects.Container;
    private comboLabel!: Phaser.GameObjects.Text;
    private comboGain!: Phaser.GameObjects.Text;
    private taskTitle!: Phaser.GameObjects.Text;
    private taskDescription!: Phaser.GameObjects.Text;
    private taskProgressText!: Phaser.GameObjects.Text;
    private taskRewardText!: Phaser.GameObjects.Text;
    private taskProgressGfx!: Phaser.GameObjects.Graphics;
    private taskToast!: Phaser.GameObjects.Container;
    private taskToastReward!: Phaser.GameObjects.Text;
    private recordPopup!: Phaser.GameObjects.Container;
    private recordPopupScore!: Phaser.GameObjects.Text;
    private fireworkEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private fireworksTimer?: Phaser.Time.TimerEvent;
    private levelPopup!: Phaser.GameObjects.Container;
    private levelPopupTitle!: Phaser.GameObjects.Text;
    private levelPopupHint!: Phaser.GameObjects.Text;
    private levelPopupTimer?: Phaser.Time.TimerEvent;
    private levelUpEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private levelUpLoop = 0;
    private levelUpActive = false;

    private music?: Phaser.Sound.BaseSound;
    private lastLockedPieces = 0;

    private paused = false;
    private dropAcc = 0;

    private resolving = false;
    private displayGrid: Grid | null = null;
    private flashCells: Set<string> | null = null;
    private clearGlowGfx!: Phaser.GameObjects.Graphics;
    private clearGlowFx: Phaser.Filters.Glow | null = null;
    private clearGlowTween?: Phaser.Tweens.Tween;
    private clearEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private clearSteps: ClearStep[] = [];
    private clearTimer?: Phaser.Time.TimerEvent;
    private displayScore: number | null = null;
    private displayLevel: number | null = null;
    private displayLines: number | null = null;
    private displayCompletedTasks: number | null = null;
    private displayDestroyedX: number | null = null;
    private displayDestroyedO: number | null = null;
    private displayTask: TaskState | null = null;

    constructor() {
        super('MainScene');
    }

    preload(): void {
        (Object.keys(SOUND_CONFIG) as SoundKey[]).forEach((key) => {
            this.load.audio(key, audioUrl(SOUND_CONFIG[key].file));
        });

        if (MUSIC_CONFIG.volume > 0) {
            this.load.audio('music', audioUrl(MUSIC_CONFIG.file));
        }
    }

    create(): void {
        this.state = new Game();
        this.bestScore = loadBestScore();

        this.startMusic();
        this.drawBackground();
        this.boardGfx = this.add.graphics();
        this.tilesGfx = this.add.graphics();
        this.createClearEffects();
        this.layoutBoard(this.state.cols, this.state.rows);
        this.drawPanels();
        this.createUi();
        this.createComboBadge();
        this.createTaskToast();
        this.nextGfx = this.add.graphics();
        this.createButtons();
        this.createOverlay();
        this.createRecordCelebration();
        this.createLevelCelebration();
        this.bindKeys();
        this.render();
    }

    update(_time: number, delta: number): void {
        if (!this.active) return;

        this.dropAcc += delta;

        if (this.dropAcc >= this.dropDelay()) {
            this.dropAcc = 0;
            this.handleSteps(this.state.tick());
        }
    }

    private get active(): boolean {
        return !this.paused && !this.state.gameOver && !this.resolving;
    }

    private dropDelay(): number {
        return this.state.dropDelay;
    }

    /**
     * Запускает фоновую музыку. Если браузер блокирует автовоспроизведение,
     * Phaser включит её после первого касания или нажатия клавиши.
     */
    private startMusic(): void {
        if (MUSIC_CONFIG.volume <= 0) return;

        this.music?.stop();
        this.music = this.sound.add('music', {
            loop: MUSIC_CONFIG.loop,
            volume: MUSIC_CONFIG.volume,
        });
        this.music.play();
    }

    private playSound(key: SoundKey): void {
        const config = SOUND_CONFIG[key];
        if (config.volume <= 0) return;

        this.sound.play(key, {
            volume: config.volume,
            rate: config.rate ?? 1,
        });
    }

    private drawBackground(): void {
        const g = this.add.graphics();

        for (let y = 0; y < 1280; y += 8) {
            const t = y / 1280;
            const r = Math.round(0x22 + (0x3d - 0x22) * t);
            const gr = Math.round(0x23 + (0x43 - 0x23) * t);
            const b = Math.round(0x5f + (0xa3 - 0x5f) * t);
            g.fillStyle((r << 16) | (gr << 8) | b, 1);
            g.fillRect(0, y, 720, 8);
        }

        const deco = this.add.graphics();
        deco.lineStyle(9, 0xffffff, 0.05);
        deco.strokeCircle(64, 46, 34);
        deco.strokeCircle(688, 1236, 42);
        deco.strokeCircle(646, 30, 18);
        this.drawSymbol(deco, 682, 86, 30, 'X', 0.06);
        this.drawSymbol(deco, 54, 1204, 34, 'O', 0.06);
        this.drawSymbol(deco, 700, 430, 22, 'X', 0.05);
    }

    /**
     * Пересчитывает размер клетки под текущее количество строк и колонок.
     * Рамка поля при этом остаётся стандартной, а сетка центрируется
     * внутри неё. Чем меньше клеток, тем крупнее каждая из них.
     */
    private layoutBoard(cols: number, rows: number): void {
        if (cols === this.boardCols && rows === this.boardRows) return;

        this.boardCols = cols;
        this.boardRows = rows;
        this.cell = Math.max(MIN_CELL, Math.min(BOARD_W / cols, BOARD_H / rows));
        this.gridW = this.cell * cols;
        this.gridH = this.cell * rows;
        this.gridX = BOARD_X + (BOARD_W - this.gridW) / 2;
        this.gridY = BOARD_Y + (BOARD_H - this.gridH) / 2;

        this.drawBoard();
    }

    private drawBoard(): void {
        const g = this.boardGfx;
        g.clear();

        for (let i = 6; i >= 1; i -= 1) {
            g.lineStyle(i * 3, PANEL_EDGE, 0.035);
            g.strokeRoundedRect(BOARD_X - 9, BOARD_Y - 9, BOARD_W + 18, BOARD_H + 18, 22);
        }

        g.fillStyle(0x161a44, 1);
        g.fillRoundedRect(BOARD_X - 7, BOARD_Y - 7, BOARD_W + 14, BOARD_H + 14, 18);

        g.fillStyle(0x232a5e, 1);
        g.fillRoundedRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 12);

        g.lineStyle(1, 0xffffff, 0.05);
        for (let col = 1; col < this.boardCols; col += 1) {
            const x = this.gridX + col * this.cell;
            g.lineBetween(x, this.gridY, x, this.gridY + this.gridH);
        }
        for (let row = 1; row < this.boardRows; row += 1) {
            const y = this.gridY + row * this.cell;
            g.lineBetween(this.gridX, y, this.gridX + this.gridW, y);
        }

        g.lineStyle(4, PANEL_EDGE, 0.9);
        g.strokeRoundedRect(BOARD_X - 7, BOARD_Y - 7, BOARD_W + 14, BOARD_H + 14, 18);
    }

    private panel(x: number, y: number, w: number, h: number): void {
        const g = this.add.graphics();
        g.fillStyle(0x14173f, 0.3);
        g.fillRoundedRect(x + 2, y + 5, w, h, 20);
        g.fillStyle(PANEL_FILL, 0.72);
        g.fillRoundedRect(x, y, w, h, 20);
        g.lineStyle(2, PANEL_EDGE, 0.5);
        g.strokeRoundedRect(x, y, w, h, 20);
    }

    private divider(x1: number, y: number, x2: number): void {
        const g = this.add.graphics();
        g.lineStyle(1, 0x8f86e8, 0.4);
        g.lineBetween(x1, y, x2, y);
    }

    private drawPanels(): void {
        this.panel(16, 96, 134, 374);
        this.panel(16, 486, 134, 178);
        this.panel(570, 96, 134, 500);
        this.panel(570, 606, 134, 244);

        const g = this.add.graphics();
        for (let i = 0; i < 4; i += 1) {
            g.fillStyle(SLOT_FILL, 0.85);
            g.fillRoundedRect(580, 146 + i * 110, 114, 100, 14);
            g.lineStyle(1, PANEL_EDGE, 0.35);
            g.strokeRoundedRect(580, 146 + i * 110, 114, 100, 14);
        }
    }

    private createUi(): void {
        const logo = { fontFamily: FONT, fontSize: '27px', fontStyle: 'bold' };

        this.add.text(18, 12, 'TETRIS', { ...logo, color: '#9cc4ff' }).setShadow(0, 3, '#000000', 6);
        this.add.text(18, 42, 'TAC TOE', { ...logo, color: '#ff9ab8' }).setShadow(0, 3, '#000000', 6);

        this.add.text(32, 112, 'SCORE', labelStyle);
        this.scoreText = this.add.text(32, 130, '0', valueStyle);
        this.divider(32, 164, 134);

        this.add.text(32, 170, 'BEST', labelStyle);
        this.bestText = this.add.text(32, 188, '0', valueStyle);
        this.divider(32, 222, 134);

        this.add.text(32, 228, 'LEVEL', labelStyle);
        this.levelText = this.add.text(32, 246, '1', valueStyle);
        this.divider(32, 280, 134);

        this.add.text(32, 286, 'LINES', labelStyle);
        this.linesText = this.add.text(32, 304, '0', valueStyle);
        this.divider(32, 338, 134);

        this.add.text(32, 344, 'TASKS', labelStyle);
        this.tasksText = this.add.text(32, 362, '0', valueStyle);
        this.divider(32, 396, 134);

        this.add.text(32, 402, 'DESTROYED', labelStyle);
        this.destroyedXText = this.add.text(32, 420, 'X 0', {
            ...valueStyle,
            fontSize: '18px',
            color: '#9cc4ff',
        });
        this.destroyedOText = this.add.text(92, 420, 'O 0', {
            ...valueStyle,
            fontSize: '18px',
            color: '#ffb26b',
        });

        this.add.text(32, 504, 'TIP', {
            fontFamily: FONT,
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#ffd76a',
        });
        this.add.text(32, 528, 'Собери 3 в ряд. С уровнем клеток меньше, а сами они крупнее.', {
            fontFamily: FONT,
            fontSize: '13px',
            color: MUTED_COLOR,
            wordWrap: { width: 104 },
            lineSpacing: 4,
        });

        this.add.text(32, 606, 'Сначала прямые, потом диагонали.', {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#ffd76a',
            wordWrap: { width: 104 },
            lineSpacing: 2,
        });

        this.add.text(637, 112, 'NEXT', {
            fontFamily: FONT,
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#cfc9ff',
        }).setOrigin(0.5, 0);

        this.add.text(637, 618, 'TASK', {
            fontFamily: FONT,
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#cfc9ff',
        }).setOrigin(0.5, 0);

        this.taskTitle = this.add.text(637, 646, '', {
            fontFamily: FONT,
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ffd76a',
            align: 'center',
            wordWrap: { width: 114 },
            lineSpacing: 2,
        }).setOrigin(0.5, 0);

        this.taskDescription = this.add.text(637, 690, '', {
            fontFamily: FONT,
            fontSize: '11px',
            color: MUTED_COLOR,
            align: 'center',
            wordWrap: { width: 114 },
            lineSpacing: 2,
        }).setOrigin(0.5, 0);

        this.taskProgressText = this.add.text(637, 740, '', {
            fontFamily: FONT,
            fontSize: '13px',
            fontStyle: 'bold',
            color: TEXT_COLOR,
        }).setOrigin(0.5, 0);

        this.taskProgressGfx = this.add.graphics();

        this.taskRewardText = this.add.text(637, 784, '', {
            fontFamily: FONT,
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#ffd76a',
        }).setOrigin(0.5, 0);

        this.add.text(637, 810, 'НАГРАДА', {
            fontFamily: FONT,
            fontSize: '9px',
            fontStyle: 'bold',
            color: MUTED_COLOR,
        }).setOrigin(0.5, 0);
    }

    private createComboBadge(): void {
        const bg = this.add.graphics();
        bg.fillStyle(0x14173f, 0.9);
        bg.fillRoundedRect(-150, -64, 300, 128, 22);
        bg.lineStyle(2, 0xffd76a, 0.85);
        bg.strokeRoundedRect(-150, -64, 300, 128, 22);

        this.comboLabel = this.add.text(0, -18, '', {
            fontFamily: FONT,
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#ffd76a',
        }).setOrigin(0.5);

        this.comboGain = this.add.text(0, 32, '', {
            fontFamily: FONT,
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#f4f2ff',
        }).setOrigin(0.5);

        this.comboBadge = this.add.container(360, 470, [bg, this.comboLabel, this.comboGain]);
        this.comboBadge.setDepth(60).setVisible(false);
    }

    private createTaskToast(): void {
        const bg = this.add.graphics();
        bg.fillStyle(0x14173f, 0.94);
        bg.fillRoundedRect(-170, -48, 340, 96, 20);
        bg.lineStyle(2, 0xffd76a, 0.9);
        bg.strokeRoundedRect(-170, -48, 340, 96, 20);

        const label = this.add.text(0, -22, 'ЗАДАНИЕ ВЫПОЛНЕНО', {
            fontFamily: FONT,
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#ffd76a',
        }).setOrigin(0.5);

        this.taskToastReward = this.add.text(0, 18, '', {
            fontFamily: FONT,
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#f4f2ff',
        }).setOrigin(0.5);

        this.taskToast = this.add.container(360, 268, [bg, label, this.taskToastReward]);
        this.taskToast.setDepth(60).setVisible(false);
    }

    private createButtons(): void {
        this.makeButton(40, 900, 120, 100, '◀', () => this.move(-1));
        this.makeButton(300, 900, 120, 100, '↻', () => this.rotate());
        this.makeButton(560, 900, 120, 100, '▶', () => this.move(1));

        this.makeButton(40, 1020, 120, 100, 'II', () => this.togglePause());
        this.makeButton(300, 1020, 120, 100, '▼', () => this.softDrop());
        this.makeButton(560, 1020, 120, 100, 'DROP', () => this.hardDrop(), '18px');

        this.add.text(360, 1150, '← → двигать · ↑ поворот', {
            fontFamily: FONT,
            fontSize: '14px',
            color: MUTED_COLOR,
        }).setOrigin(0.5);

        this.add.text(360, 1176, 'Space — сброс · P — пауза · R — заново', {
            fontFamily: FONT,
            fontSize: '14px',
            color: MUTED_COLOR,
        }).setOrigin(0.5);
    }

    private makeButton(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        onClick: () => void,
        fontSize = '28px',
    ): void {
        const g = this.add.graphics();
        g.fillStyle(0x14173f, 0.35);
        g.fillRoundedRect(x + 2, y + 5, w, h, 18);
        g.fillStyle(BUTTON_FILL, 0.95);
        g.fillRoundedRect(x, y, w, h, 18);
        g.fillStyle(0xffffff, 0.1);
        g.fillRoundedRect(x + 3, y + 3, w - 6, h * 0.42, 14);
        g.lineStyle(2, BUTTON_EDGE, 0.85);
        g.strokeRoundedRect(x, y, w, h, 18);

        this.add.text(x + w / 2, y + h / 2, label, {
            fontFamily: FONT,
            fontSize,
            fontStyle: 'bold',
            color: TEXT_COLOR,
        }).setOrigin(0.5);

        const zone = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', onClick);
    }

    private createOverlay(): void {
        const dim = this.add.rectangle(0, 0, 720, 1280, 0x0b0d24, 0.78).setOrigin(0, 0);
        const title = this.add.text(360, 520, '', {
            fontFamily: FONT,
            fontSize: '48px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5);
        const hint = this.add.text(360, 600, '', {
            fontFamily: FONT,
            fontSize: '20px',
            color: '#cfc9ff',
            align: 'center',
            lineSpacing: 8,
        }).setOrigin(0.5);

        this.overlay = this.add.container(0, 0, [dim, title, hint]);
        this.overlay.setDepth(100).setVisible(false);

        this.overlayTitle = title;
        this.overlayHint = hint;

        dim.setInteractive();
        dim.on('pointerdown', () => {
            if (this.state.gameOver) {
                this.restart();
            } else {
                this.togglePause();
            }
        });
    }

    private createRecordCelebration(): void {
        this.createFireworkTexture();

        const bg = this.add.graphics();
        bg.fillStyle(0x14173f, 0.96);
        bg.fillRoundedRect(-190, -62, 380, 124, 26);
        bg.lineStyle(3, 0xffd76a, 0.95);
        bg.strokeRoundedRect(-190, -62, 380, 124, 26);
        bg.lineStyle(1, 0xffffff, 0.18);
        bg.strokeRoundedRect(-185, -57, 370, 114, 23);

        const title = this.add.text(0, -30, 'НОВЫЙ РЕКОРД!', {
            fontFamily: FONT,
            fontSize: '30px',
            fontStyle: 'bold',
            color: '#ffd76a',
        }).setOrigin(0.5);

        this.recordPopupScore = this.add.text(0, 20, '', {
            fontFamily: FONT,
            fontSize: '28px',
            fontStyle: 'bold',
            color: TEXT_COLOR,
        }).setOrigin(0.5);

        this.recordPopup = this.add.container(360, 300, [bg, title, this.recordPopupScore]);
        this.recordPopup.setDepth(120).setVisible(false);

        this.fireworkEmitter = this.add.particles(0, 0, 'firework-spark', {
            lifespan: { min: 700, max: 1300 },
            speed: { min: 100, max: 320 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 1, end: 0 },
            gravityY: 140,
            blendMode: 'ADD',
            emitting: false,
        });
        this.fireworkEmitter.setDepth(105);
    }

    /**
     * Мягкая светящаяся точка для частиц фейерверка. Текстура рисуется
     * кодом, поэтому игра не зависит от загрузки внешних ресурсов.
     */
    private createFireworkTexture(): void {
        const key = 'firework-spark';
        if (this.textures.exists(key)) return;

        const g = this.make.graphics({}, false);
        g.fillStyle(0xffffff, 0.22);
        g.fillCircle(8, 8, 8);
        g.fillStyle(0xffffff, 0.55);
        g.fillCircle(8, 8, 5.5);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(8, 8, 3);
        g.generateTexture(key, 16, 16);
        g.destroy();
    }

    /**
     * Создаёт эффекты очистки линий: отдельный слой с glow-фильтром для
     * пульсирующего свечения и эмиттер для разлетающихся осколков.
     * Свечение живёт на своём Graphics, чтобы не подсвечивать всё поле.
     */
    private createClearEffects(): void {
        this.createClearSparkTexture();

        this.clearGlowGfx = this.add.graphics();
        this.clearGlowGfx.setDepth(2);
        this.clearGlowGfx.enableFilters();
        this.clearGlowFx =
            this.clearGlowGfx.filters?.external.addGlow(0xfff2b0, 0, 0, 1, false, 10, 24) ??
            null;

        if (this.clearGlowFx) this.clearGlowFx.active = false;

        this.clearEmitter = this.add.particles(0, 0, 'clear-spark', {
            lifespan: { min: 380, max: 720 },
            speed: { min: 100, max: 300 },
            angle: { min: 0, max: 360 },
            gravityY: 720,
            scale: { start: 0.85, end: 0 },
            alpha: { start: 1, end: 0 },
            rotate: { min: -220, max: 220 },
            tint: [0x9cc4ff, 0x8b6cf0, 0xffb26b, 0xf2649a, 0xfff2b0],
            blendMode: 'ADD',
            emitting: false,
        });
        this.clearEmitter.setDepth(30);
    }

    /**
     * Осколок для взрыва клеток: маленький светящийся квадрат,
     * который тонируется в цвета фигур.
     */
    private createClearSparkTexture(): void {
        const key = 'clear-spark';
        if (this.textures.exists(key)) return;

        const g = this.make.graphics({}, false);
        g.fillStyle(0xffffff, 0.18);
        g.fillCircle(8, 8, 8);
        g.fillStyle(0xffffff, 0.55);
        g.fillRoundedRect(3.5, 3.5, 9, 9, 2.5);
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(5, 5, 6, 6, 1.5);
        g.generateTexture(key, 16, 16);
        g.destroy();
    }

    private showRecordCelebration(): void {
        this.recordPopupScore.setText(this.formatScore(this.bestScore));

        this.tweens.killTweensOf(this.recordPopup);
        this.recordPopup.setVisible(true).setAlpha(1).setScale(0.75);

        this.tweens.add({
            targets: this.recordPopup,
            scale: 1,
            duration: 320,
            ease: 'Back.Out',
        });
        this.tweens.add({
            targets: this.recordPopup,
            alpha: 0.82,
            delay: 400,
            duration: 750,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
        });

        this.startFireworks();
    }

    private startFireworks(): void {
        this.fireworksTimer?.remove(false);

        const colors = [0xffd76a, 0xff6b8a, 0x9cc4ff, 0x7cffb2, 0xffffff];
        const burst = () => {
            this.fireworkEmitter.setParticleTint(
                colors[Phaser.Math.Between(0, colors.length - 1)],
            );
            this.fireworkEmitter.explode(
                Phaser.Math.Between(34, 56),
                Phaser.Math.Between(205, 515),
                Phaser.Math.Between(180, 470),
            );
        };

        burst();
        this.fireworksTimer = this.time.addEvent({
            delay: 420,
            repeat: 7,
            callback: burst,
        });
    }

    private hideRecordCelebration(): void {
        this.fireworksTimer?.remove(false);
        this.fireworksTimer = undefined;
        this.fireworkEmitter.killAll();

        this.tweens.killTweensOf(this.recordPopup);
        this.recordPopup.setVisible(false).setAlpha(1).setScale(1);
    }

    private createLevelCelebration(): void {
        this.createFireworkTexture();

        const bg = this.add.graphics();
        bg.fillStyle(0x14173f, 0.95);
        bg.fillRoundedRect(-190, -50, 380, 100, 22);
        bg.lineStyle(3, 0x9cc4ff, 0.95);
        bg.strokeRoundedRect(-190, -50, 380, 100, 22);
        bg.lineStyle(1, 0xffffff, 0.16);
        bg.strokeRoundedRect(-185, -45, 370, 90, 19);

        this.levelPopupTitle = this.add.text(0, -22, '', {
            fontFamily: FONT,
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#9cc4ff',
        }).setOrigin(0.5);

        this.levelPopupHint = this.add.text(0, 20, '', {
            fontFamily: FONT,
            fontSize: '14px',
            fontStyle: 'bold',
            color: TEXT_COLOR,
            align: 'center',
            wordWrap: { width: 330 },
            lineSpacing: 3,
        }).setOrigin(0.5);

        this.levelPopup = this.add.container(360, 158, [
            bg,
            this.levelPopupTitle,
            this.levelPopupHint,
        ]);
        this.levelPopup.setDepth(70).setVisible(false);

        this.levelUpEmitter = this.add.particles(360, 480, 'firework-spark', {
            blendMode: 'ADD',
            lifespan: 900,
            frequency: 18,
            scale: { start: 1.1, end: 0.05 },
            alpha: { start: 1, end: 0 },
            tint: [0x9cc4ff, 0xffd76a, 0xff9ab8, 0x7cffb2],
            stopAfter: 64,
            emitting: false,
        });
        this.levelUpEmitter.addEmitZone({
            type: 'edge',
            source: new Phaser.Geom.Rectangle(-190, -380, 380, 760),
            quantity: 64,
        });
        this.levelUpEmitter.setDepth(45);
        this.levelUpEmitter.on('complete', () => {
            if (!this.levelUpActive) return;

            this.levelUpLoop += 1;

            if (this.levelUpLoop < 2) {
                this.levelUpEmitter.start();
            } else {
                this.levelUpActive = false;
            }
        });
    }

    private showLevelCelebration(level: number, fieldChanged: boolean): void {
        this.playSound('levelUp');

        this.levelPopupTitle.setText(`УРОВЕНЬ ${level}`);
        this.levelPopupHint.setText(
            fieldChanged
                ? 'Сложность выросла — поле стало меньше'
                : 'Сложность выросла',
        );

        this.levelPopupTimer?.remove(false);
        this.tweens.killTweensOf(this.levelPopup);
        this.levelPopup.setVisible(true).setAlpha(1).setScale(0.78);

        this.tweens.add({
            targets: this.levelPopup,
            scale: 1,
            duration: 300,
            ease: 'Back.Out',
        });

        this.levelUpActive = true;
        this.levelUpLoop = 0;
        this.levelUpEmitter.stop(true);
        this.levelUpEmitter.killAll();
        this.levelUpEmitter.start();

        this.levelPopupTimer = this.time.delayedCall(2700, () => {
            this.tweens.add({
                targets: this.levelPopup,
                alpha: 0,
                duration: 250,
                onComplete: () => this.levelPopup.setVisible(false).setAlpha(1),
            });
        });
    }

    private hideLevelCelebration(): void {
        this.levelPopupTimer?.remove(false);
        this.levelPopupTimer = undefined;
        this.levelUpActive = false;
        this.levelUpEmitter.stop(true);
        this.levelUpEmitter.killAll();

        this.tweens.killTweensOf(this.levelPopup);
        this.levelPopup.setVisible(false).setAlpha(1).setScale(1);
    }

    private bindKeys(): void {
        const keyboard = this.input.keyboard;
        if (!keyboard) return;

        keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');

        keyboard.on('keydown-LEFT', () => this.move(-1));
        keyboard.on('keydown-A', () => this.move(-1));
        keyboard.on('keydown-RIGHT', () => this.move(1));
        keyboard.on('keydown-D', () => this.move(1));
        keyboard.on('keydown-DOWN', () => this.softDrop());
        keyboard.on('keydown-S', () => this.softDrop());
        keyboard.on('keydown-UP', () => this.rotate());
        keyboard.on('keydown-W', () => this.rotate());
        keyboard.on('keydown-X', () => this.rotate());
        keyboard.on('keydown-SPACE', () => this.hardDrop());
        keyboard.on('keydown-P', () => this.togglePause());
        keyboard.on('keydown-R', () => this.restart());
    }

    private move(direction: number): void {
        if (!this.active) return;
        if (this.state.move(direction)) this.render();
    }

    private rotate(): void {
        if (!this.active) return;
        if (this.state.rotateCurrent()) this.render();
    }

    private softDrop(): void {
        if (!this.active) return;

        const steps = this.state.softDrop();
        this.dropAcc = 0;
        this.handleSteps(steps);
    }

    private hardDrop(): void {
        if (!this.active) return;

        const steps = this.state.hardDrop();
        this.dropAcc = 0;
        this.handleSteps(steps);
    }

    private togglePause(): void {
        if (this.state.gameOver || this.resolving) return;

        this.paused = !this.paused;

        if (this.paused) {
            this.overlayTitle.setText('PAUSED');
            this.overlayHint.setText('P или тап — продолжить');
            this.overlay.setVisible(true);
        } else {
            this.overlay.setVisible(false);
            this.dropAcc = 0;
        }
    }

    private showGameOver(): void {
        const newRecord = this.recordBest();

        this.hideLevelCelebration();
        this.overlayTitle.setText('GAME OVER');
        this.overlayHint.setText(
            `Счёт: ${this.formatScore(this.state.score)}\nРекорд: ${this.formatScore(this.bestScore)}\nЗаданий выполнено: ${this.state.completedTasks}\nR или тап — заново`,
        );
        this.overlay.setVisible(true);

        this.playSound(newRecord ? 'victory' : 'defeat');

        if (newRecord) this.showRecordCelebration();
    }

    /**
     * Запоминает лучший счёт завершённой сессии. Рекорд обновляется,
     * только когда текущая игра его превысила, и сохраняется в localStorage.
     * Возвращает true, если рекорд был побит.
     */
    private recordBest(): boolean {
        if (this.state.score <= this.bestScore) return false;

        this.bestScore = this.state.score;
        saveBestScore(this.bestScore);
        this.bestText.setText(this.formatScore(this.bestScore));
        return true;
    }

    private restart(): void {
        this.recordBest();
        this.sound.stopByKey('victory');
        this.sound.stopByKey('defeat');
        this.hideRecordCelebration();
        this.hideLevelCelebration();
        this.clearTimer?.remove();
        this.clearTimer = undefined;
        this.stopClearGlow();
        this.clearEmitter.killAll();
        this.resolving = false;
        this.displayGrid = null;
        this.flashCells = null;
        this.clearSteps = [];
        this.displayScore = null;
        this.displayLevel = null;
        this.displayLines = null;
        this.displayCompletedTasks = null;
        this.displayDestroyedX = null;
        this.displayDestroyedO = null;
        this.displayTask = null;
        this.hideCombo();
        this.hideTaskToast();

        this.state = new Game();
        this.lastLockedPieces = 0;
        this.paused = false;
        this.dropAcc = 0;
        this.overlay.setVisible(false);
        this.render();
    }

    private handleSteps(steps: ClearStep[]): void {
        if (this.state.piecesLocked !== this.lastLockedPieces) {
            this.lastLockedPieces = this.state.piecesLocked;
            this.playSound('pieceFall');
        }

        if (steps.length === 0) {
            this.render();
            if (this.state.gameOver) this.showGameOver();
            return;
        }

        this.resolving = true;
        this.clearSteps = steps;
        this.showClearStep(0);
    }

    private showClearStep(index: number): void {
        const step = this.clearSteps[index];

        this.displayGrid = step.before;
        this.flashCells = new Set(step.cleared.map(({ row, col }) => `${row},${col}`));
        this.displayScore = step.score;
        this.displayLevel = step.level;
        this.displayLines = step.lines;
        this.displayCompletedTasks = step.completedTasks;
        this.displayDestroyedX = step.destroyedX;
        this.displayDestroyedO = step.destroyedO;
        this.displayTask = step.task;
        this.render();
        this.showCombo(step);
        this.startClearGlow();

        if (step.levelUp) {
            this.showLevelCelebration(step.level, step.fieldChanged);
        }

        if (step.taskCompleted) {
            this.showTaskComplete(step.taskCompleted);
        }

        const hold = step.combo >= 2 ? 520 : 380;

        this.clearTimer?.remove();
        this.clearTimer = this.time.delayedCall(hold, () => {
            this.explodeClear(step.cleared);

            if (index + 1 < this.clearSteps.length) {
                this.showClearStep(index + 1);
            } else {
                this.finishClear();
            }
        });
    }

    /**
     * Пульсирующее свечение очищаемых клеток: сила glow-фильтра
     * плавно ходит туда-обратно, пока клетки ещё видны.
     */
    private startClearGlow(): void {
        const fx = this.clearGlowFx;
        if (!fx) return;

        this.clearGlowTween?.remove();
        fx.active = true;
        fx.outerStrength = 2;
        fx.innerStrength = 0;

        this.clearGlowTween = this.tweens.add({
            targets: fx,
            outerStrength: 13,
            innerStrength: 1.6,
            duration: 180,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
        });
    }

    private stopClearGlow(): void {
        this.clearGlowTween?.remove();
        this.clearGlowTween = undefined;

        const fx = this.clearGlowFx;
        if (!fx) return;

        fx.active = false;
        fx.outerStrength = 0;
        fx.innerStrength = 0;
    }

    /**
     * Взрыв очищенных клеток: из центра каждой клетки разлетаются
     * частицы, а камера коротко вздрагивает.
     */
    private explodeClear(cells: ClearedCell[]): void {
        this.stopClearGlow();

        if (cells.length === 0) return;

        this.playSound('cellDestroy');

        const cell = this.cell;

        for (const { row, col } of cells) {
            this.clearEmitter.explode(
                Phaser.Math.Between(6, 10),
                this.gridX + (col + 0.5) * cell,
                this.gridY + (row + 0.5) * cell,
            );
        }

        this.cameras.main.shake(220, 0.012, true);
    }

    private showCombo(step: ClearStep): void {
        this.comboLabel.setText(step.badge);
        this.comboLabel.setColor(step.badgeColor);
        this.comboGain.setText(`+${step.gained}`);

        this.tweens.killTweensOf(this.comboBadge);
        this.comboBadge.setVisible(true).setAlpha(1).setScale(0.75);

        this.tweens.add({
            targets: this.comboBadge,
            scale: 1,
            duration: 150,
            ease: 'Back.Out',
        });
        this.tweens.add({
            targets: this.comboBadge,
            alpha: 0,
            delay: step.combo >= 2 ? 280 : 160,
            duration: 120,
        });
    }

    private hideCombo(): void {
        this.tweens.killTweensOf(this.comboBadge);
        this.comboBadge.setVisible(false).setAlpha(1).setScale(1);
    }

    private showTaskComplete(completion: TaskCompletion): void {
        this.playSound('taskComplete');

        this.taskToastReward.setText(`+${completion.reward}`);

        this.tweens.killTweensOf(this.taskToast);
        this.taskToast.setVisible(true).setAlpha(1).setScale(0.8);

        this.tweens.add({
            targets: this.taskToast,
            scale: 1,
            duration: 180,
            ease: 'Back.Out',
        });
        this.tweens.add({
            targets: this.taskToast,
            alpha: 0,
            delay: 900,
            duration: 220,
        });
    }

    private hideTaskToast(): void {
        this.tweens.killTweensOf(this.taskToast);
        this.taskToast.setVisible(false).setAlpha(1).setScale(1);
    }

    private finishClear(): void {
        this.clearTimer = undefined;
        this.stopClearGlow();
        this.resolving = false;
        this.displayGrid = null;
        this.flashCells = null;
        this.clearSteps = [];
        this.displayScore = null;
        this.displayLevel = null;
        this.displayLines = null;
        this.displayCompletedTasks = null;
        this.displayDestroyedX = null;
        this.displayDestroyedO = null;
        this.displayTask = null;
        this.hideCombo();
        this.render();

        if (this.state.gameOver) this.showGameOver();
    }

    private render(): void {
        const g = this.tilesGfx;
        g.clear();

        const grid = this.displayGrid ?? this.state.grid;
        const rows = grid.length;
        const cols = grid[0].length;

        this.layoutBoard(cols, rows);

        const cell = this.cell;

        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                const tile = grid[row][col];
                if (!tile) continue;
                this.drawTile(
                    g,
                    this.gridX + col * cell,
                    this.gridY + row * cell,
                    cell,
                    tile.color,
                    tile.symbol,
                );
            }
        }

        this.renderClearHighlight(grid);

        const piece = this.resolving ? null : this.state.current;
        if (piece) {
            const ghost = this.state.ghostRow();

            if (ghost !== piece.row) {
                for (const [r, c] of piece.cells) {
                    this.drawGhost(
                        g,
                        this.gridX + (piece.col + c) * cell,
                        this.gridY + (ghost + r) * cell,
                        cell,
                        piece.color,
                        piece.symbol,
                    );
                }
            }

            for (const [r, c] of piece.cells) {
                this.drawTile(
                    g,
                    this.gridX + (piece.col + c) * cell,
                    this.gridY + (piece.row + r) * cell,
                    cell,
                    piece.color,
                    piece.symbol,
                );
            }
        }

        this.scoreText.setText(this.formatScore(this.displayScore ?? this.state.score));
        this.bestText.setText(this.formatScore(this.bestScore));
        this.levelText.setText(String(this.displayLevel ?? this.state.level));
        this.linesText.setText(String(this.displayLines ?? this.state.lines));
        this.tasksText.setText(String(this.displayCompletedTasks ?? this.state.completedTasks));
        this.destroyedXText.setText(
            `X ${this.formatScore(this.displayDestroyedX ?? this.state.destroyedX)}`,
        );
        this.destroyedOText.setText(
            `O ${this.formatScore(this.displayDestroyedO ?? this.state.destroyedO)}`,
        );
        this.renderTask(this.displayTask ?? this.state.task);
        this.renderNext();
    }

    /**
     * Рисует подложку под glow-фильтр: клетки сохраняют свой цвет,
     * а белая обводка и лёгкая заливка создают источник свечения.
     */
    private renderClearHighlight(grid: Grid): void {
        const g = this.clearGlowGfx;
        g.clear();

        if (!this.flashCells) return;

        const cell = this.cell;
        const inset = Math.max(1, cell * 0.08);
        const radius = Math.max(3, cell * 0.2);

        for (const key of this.flashCells) {
            const [row, col] = key.split(',').map(Number);
            const x = this.gridX + col * cell + inset;
            const y = this.gridY + row * cell + inset;
            const size = cell - inset * 2;
            const color = grid[row]?.[col]?.color ?? 0xffffff;

            g.fillStyle(color, 0.38);
            g.fillRoundedRect(x, y, size, size, radius);
            g.fillStyle(0xffffff, 0.16);
            g.fillRoundedRect(x + 2, y + 2, size - 4, size * 0.4, radius * 0.7);
            g.lineStyle(Math.max(2, cell * 0.07), 0xffffff, 0.95);
            g.strokeRoundedRect(x, y, size, size, radius);
        }
    }

    private renderTask(task: TaskState): void {
        const definition = task.definition;
        const titleColor =
            definition.symbol === 'X'
                ? '#9cc4ff'
                : definition.symbol === 'O'
                  ? '#ffb26b'
                  : '#ffd76a';

        this.taskTitle.setText(definition.title).setColor(titleColor);
        this.taskDescription.setText(definition.description);
        this.taskProgressText.setText(
            `${Math.min(task.progress, definition.target)} / ${definition.target}`,
        );
        this.taskRewardText.setText(`+${definition.reward}`);

        const g = this.taskProgressGfx;
        g.clear();

        const x = 580;
        const y = 766;
        const width = 114;
        const height = 9;
        const ratio = definition.target > 0 ? Math.min(1, task.progress / definition.target) : 0;

        g.fillStyle(SLOT_FILL, 0.9);
        g.fillRoundedRect(x, y, width, height, height / 2);
        g.lineStyle(1, PANEL_EDGE, 0.45);
        g.strokeRoundedRect(x, y, width, height, height / 2);

        if (ratio > 0) {
            g.fillStyle(0xffd76a, 0.95);
            g.fillRoundedRect(x, y, Math.max(height, width * ratio), height, height / 2);
        }
    }

    private renderNext(): void {
        const g = this.nextGfx;
        g.clear();

        const slotW = 114;
        const slotH = 100;

        // Превью использует тот же размер клетки, что и поле, без уменьшения.
        // Ограничение нужно только для того, чтобы фигура не выходила за слот.
        const previewCell = Math.min(this.cell, slotW / 4, slotH / 2);

        this.state.queue.forEach((piece, index) => {
            const width = (Math.max(...piece.cells.map(([, col]) => col)) + 1) * previewCell;
            const height = (Math.max(...piece.cells.map(([row]) => row)) + 1) * previewCell;
            const originX = 580 + (slotW - width) / 2;
            const originY = 146 + index * 110 + (slotH - height) / 2;

            for (const [r, c] of piece.cells) {
                this.drawTile(
                    g,
                    originX + c * previewCell,
                    originY + r * previewCell,
                    previewCell,
                    piece.color,
                    piece.symbol,
                );
            }
        });
    }

    private drawTile(
        g: Phaser.GameObjects.Graphics,
        x: number,
        y: number,
        size: number,
        color: number,
        symbol: SymbolType,
    ): void {
        const pad = Math.max(1.5, size * 0.08);
        const tile = size - pad * 2;
        const radius = Math.max(3, size * 0.22);

        g.fillStyle(0x000000, 0.28);
        g.fillRoundedRect(x + pad + 1, y + pad + 3, tile, tile, radius);

        g.fillStyle(color, 1);
        g.fillRoundedRect(x + pad, y + pad, tile, tile, radius);

        g.fillStyle(0xffffff, 0.16);
        g.fillRoundedRect(x + pad + 2, y + pad + 2, tile - 4, tile * 0.4, radius * 0.7);

        g.lineStyle(2, 0xffffff, 0.22);
        g.strokeRoundedRect(x + pad, y + pad, tile, tile, radius);

        this.drawSymbol(g, x + size / 2, y + size / 2, size * 0.2, symbol);
    }

    private drawGhost(
        g: Phaser.GameObjects.Graphics,
        x: number,
        y: number,
        size: number,
        color: number,
        symbol: SymbolType,
    ): void {
        const pad = Math.max(1.5, size * 0.08);
        const tile = size - pad * 2;
        const radius = Math.max(3, size * 0.22);

        g.fillStyle(color, 0.1);
        g.fillRoundedRect(x + pad, y + pad, tile, tile, radius);
        g.lineStyle(2, color, 0.5);
        g.strokeRoundedRect(x + pad, y + pad, tile, tile, radius);

        this.drawSymbol(g, x + size / 2, y + size / 2, size * 0.17, symbol, 0.35);
    }

    private drawSymbol(
        g: Phaser.GameObjects.Graphics,
        cx: number,
        cy: number,
        radius: number,
        symbol: SymbolType,
        alpha = 1,
    ): void {
        g.lineStyle(Math.max(1.5, radius * 0.62), 0xffffff, alpha);

        if (symbol === 'X') {
            g.lineBetween(cx - radius, cy - radius, cx + radius, cy + radius);
            g.lineBetween(cx + radius, cy - radius, cx - radius, cy + radius);
        } else {
            g.strokeCircle(cx, cy, radius);
        }
    }

    private formatScore(value: number): string {
        return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
}
