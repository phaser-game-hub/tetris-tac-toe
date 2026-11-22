import Phaser from 'phaser';
import { Game } from '../game/Game';
import type { ClearStep } from '../game/Game';
import { COLS, ROWS } from '../game/model';
import type { Grid, SymbolType } from '../game/model';
import type { TaskCompletion, TaskState } from '../game/taskConfig';

const CELL = 38;
const BOARD_X = 170;
const BOARD_Y = 100;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;

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
    private tilesGfx!: Phaser.GameObjects.Graphics;
    private nextGfx!: Phaser.GameObjects.Graphics;
    private scoreText!: Phaser.GameObjects.Text;
    private levelText!: Phaser.GameObjects.Text;
    private linesText!: Phaser.GameObjects.Text;
    private tasksText!: Phaser.GameObjects.Text;
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

    private paused = false;
    private dropAcc = 0;

    private resolving = false;
    private displayGrid: Grid | null = null;
    private flashCells: Set<string> | null = null;
    private clearSteps: ClearStep[] = [];
    private clearTimer?: Phaser.Time.TimerEvent;
    private displayScore: number | null = null;
    private displayLevel: number | null = null;
    private displayLines: number | null = null;
    private displayCompletedTasks: number | null = null;
    private displayTask: TaskState | null = null;

    constructor() {
        super('MainScene');
    }

    create(): void {
        this.state = new Game();

        this.drawBackground();
        this.drawBoard();
        this.tilesGfx = this.add.graphics();
        this.drawPanels();
        this.createUi();
        this.createComboBadge();
        this.createTaskToast();
        this.nextGfx = this.add.graphics();
        this.createButtons();
        this.createOverlay();
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
        return Math.max(120, 800 - (this.state.level - 1) * 70);
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

    private drawBoard(): void {
        const g = this.add.graphics();

        for (let i = 6; i >= 1; i -= 1) {
            g.lineStyle(i * 3, PANEL_EDGE, 0.035);
            g.strokeRoundedRect(BOARD_X - 9, BOARD_Y - 9, BOARD_W + 18, BOARD_H + 18, 22);
        }

        g.fillStyle(0x161a44, 1);
        g.fillRoundedRect(BOARD_X - 7, BOARD_Y - 7, BOARD_W + 14, BOARD_H + 14, 18);

        g.fillStyle(0x232a5e, 1);
        g.fillRoundedRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 12);

        g.lineStyle(1, 0xffffff, 0.05);
        for (let col = 1; col < COLS; col += 1) {
            g.lineBetween(BOARD_X + col * CELL, BOARD_Y, BOARD_X + col * CELL, BOARD_Y + BOARD_H);
        }
        for (let row = 1; row < ROWS; row += 1) {
            g.lineBetween(BOARD_X, BOARD_Y + row * CELL, BOARD_X + BOARD_W, BOARD_Y + row * CELL);
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
        this.panel(16, 96, 134, 300);
        this.panel(16, 412, 134, 178);
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
        this.divider(32, 176, 134);

        this.add.text(32, 190, 'LEVEL', labelStyle);
        this.levelText = this.add.text(32, 208, '1', valueStyle);
        this.divider(32, 252, 134);

        this.add.text(32, 266, 'LINES', labelStyle);
        this.linesText = this.add.text(32, 284, '0', valueStyle);
        this.divider(32, 318, 134);

        this.add.text(32, 330, 'TASKS', labelStyle);
        this.tasksText = this.add.text(32, 348, '0', valueStyle);

        this.add.text(32, 430, 'TIP', {
            fontFamily: FONT,
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#ffd76a',
        });
        this.add.text(32, 454, 'Собери 3 одинаковых символа в ряд, чтобы они исчезли.', {
            fontFamily: FONT,
            fontSize: '13px',
            color: MUTED_COLOR,
            wordWrap: { width: 104 },
            lineSpacing: 4,
        });

        this.add.text(32, 548, 'Сначала прямые, потом диагонали.', {
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
        this.overlayTitle.setText('GAME OVER');
        this.overlayHint.setText(
            `Счёт: ${this.formatScore(this.state.score)}\nЗаданий выполнено: ${this.state.completedTasks}\nR или тап — заново`,
        );
        this.overlay.setVisible(true);
    }

    private restart(): void {
        this.clearTimer?.remove();
        this.clearTimer = undefined;
        this.resolving = false;
        this.displayGrid = null;
        this.flashCells = null;
        this.clearSteps = [];
        this.displayScore = null;
        this.displayLevel = null;
        this.displayLines = null;
        this.displayCompletedTasks = null;
        this.displayTask = null;
        this.hideCombo();
        this.hideTaskToast();

        this.state = new Game();
        this.paused = false;
        this.dropAcc = 0;
        this.overlay.setVisible(false);
        this.render();
    }

    private handleSteps(steps: ClearStep[]): void {
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
        this.displayTask = step.task;
        this.render();
        this.showCombo(step);

        if (step.taskCompleted) {
            this.showTaskComplete(step.taskCompleted);
        }

        const hold = step.combo >= 2 ? 420 : 300;

        this.clearTimer?.remove();
        this.clearTimer = this.time.delayedCall(hold, () => {
            if (index + 1 < this.clearSteps.length) {
                this.showClearStep(index + 1);
            } else {
                this.finishClear();
            }
        });
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
        this.resolving = false;
        this.displayGrid = null;
        this.flashCells = null;
        this.clearSteps = [];
        this.displayScore = null;
        this.displayLevel = null;
        this.displayLines = null;
        this.displayCompletedTasks = null;
        this.displayTask = null;
        this.hideCombo();
        this.render();

        if (this.state.gameOver) this.showGameOver();
    }

    private render(): void {
        const g = this.tilesGfx;
        g.clear();

        const grid = this.displayGrid ?? this.state.grid;

        for (let row = 0; row < ROWS; row += 1) {
            for (let col = 0; col < COLS; col += 1) {
                const cell = grid[row][col];
                if (!cell) continue;
                this.drawTile(
                    g,
                    BOARD_X + col * CELL,
                    BOARD_Y + row * CELL,
                    CELL,
                    cell.color,
                    cell.symbol,
                );
            }
        }

        if (this.flashCells) {
            for (const key of this.flashCells) {
                const [row, col] = key.split(',').map(Number);
                const x = BOARD_X + col * CELL + 3;
                const y = BOARD_Y + row * CELL + 3;

                g.fillStyle(0xffffff, 0.55);
                g.fillRoundedRect(x, y, CELL - 6, CELL - 6, 8);
                g.lineStyle(3, 0xffffff, 0.95);
                g.strokeRoundedRect(x, y, CELL - 6, CELL - 6, 8);
            }
        }

        const piece = this.resolving ? null : this.state.current;
        if (piece) {
            const ghost = this.state.ghostRow();

            if (ghost !== piece.row) {
                for (const [r, c] of piece.cells) {
                    this.drawGhost(
                        g,
                        BOARD_X + (piece.col + c) * CELL,
                        BOARD_Y + (ghost + r) * CELL,
                        CELL,
                        piece.color,
                        piece.symbol,
                    );
                }
            }

            for (const [r, c] of piece.cells) {
                this.drawTile(
                    g,
                    BOARD_X + (piece.col + c) * CELL,
                    BOARD_Y + (piece.row + r) * CELL,
                    CELL,
                    piece.color,
                    piece.symbol,
                );
            }
        }

        this.scoreText.setText(this.formatScore(this.displayScore ?? this.state.score));
        this.levelText.setText(String(this.displayLevel ?? this.state.level));
        this.linesText.setText(String(this.displayLines ?? this.state.lines));
        this.tasksText.setText(String(this.displayCompletedTasks ?? this.state.completedTasks));
        this.renderTask(this.displayTask ?? this.state.task);
        this.renderNext();
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

        const previewCell = 22;
        const slotW = 114;
        const slotH = 100;

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
        const pad = Math.max(2, size * 0.08);
        const tile = size - pad * 2;
        const radius = Math.max(5, size * 0.22);

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
        const pad = Math.max(2, size * 0.08);
        const tile = size - pad * 2;
        const radius = Math.max(5, size * 0.22);

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
        g.lineStyle(Math.max(2.5, radius * 0.62), 0xffffff, alpha);

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
