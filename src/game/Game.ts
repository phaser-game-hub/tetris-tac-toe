import type { Cell, Coord, Grid, MatchGroup, Piece, SymbolType } from './model';
import { comboTierFor } from './comboConfig';
import { randomTask, taskMatchesLine } from './taskConfig';
import type { TaskCompletion, TaskLine, TaskState } from './taskConfig';
import {
    COLS,
    ROWS,
    applyGravity,
    createGrid,
    findMatchGroups,
    pieceWidth,
    randomPiece,
    rotate,
} from './model';

export interface ClearedCell {
    row: number;
    col: number;
    symbol: SymbolType;
    color: number;
}

export interface ClearStep {
    /** Поле непосредственно перед очисткой этой группы. */
    before: Grid;
    cleared: ClearedCell[];
    groups: number;
    combo: number;
    /** Плашка комбо из конфига. */
    badge: string;
    badgeColor: string;
    /** Базовые очки до множителя. */
    base: number;
    multiplier: number;
    bonus: number;
    gained: number;
    score: number;
    level: number;
    lines: number;
    /** Количество выполненных заданий после этого шага. */
    completedTasks: number;
    /** Линии, очищенные на этом шаге. */
    matches: TaskLine[];
    /** Состояние задания после этого шага. */
    task: TaskState;
    /** Задание, выполненное на этом шаге (если есть). */
    taskCompleted?: TaskCompletion;
}

export class Game {
    readonly grid: Grid = createGrid();
    readonly queue: Piece[] = [];

    current: Piece | null = null;
    score = 0;
    level = 1;
    lines = 0;
    completedTasks = 0;
    gameOver = false;
    task: TaskState = { definition: randomTask(), progress: 0 };

    constructor() {
        for (let i = 0; i < 4; i += 1) {
            this.queue.push(randomPiece());
        }
        this.spawn();
    }

    move(direction: number): boolean {
        return this.tryMove(0, direction);
    }

    rotateCurrent(): boolean {
        const piece = this.current;
        if (!piece || this.gameOver) return false;

        const rotated = rotate(piece.cells);

        for (const kick of [0, -1, 1, -2, 2]) {
            if (!this.collides(piece.row, piece.col + kick, rotated)) {
                piece.cells = rotated;
                piece.col += kick;
                return true;
            }
        }

        return false;
    }

    softDrop(): ClearStep[] {
        if (this.gameOver || !this.current) return [];

        if (this.tryMove(1, 0)) {
            this.score += 1;
            return [];
        }

        return this.lock();
    }

    hardDrop(): ClearStep[] {
        if (this.gameOver || !this.current) return [];

        let distance = 0;
        while (this.tryMove(1, 0)) {
            distance += 1;
        }

        this.score += distance * 2;
        return this.lock();
    }

    tick(): ClearStep[] {
        if (this.gameOver || !this.current) return [];

        if (!this.tryMove(1, 0)) {
            return this.lock();
        }

        return [];
    }

    ghostRow(): number {
        const piece = this.current;
        if (!piece) return 0;

        let row = piece.row;
        while (!this.collides(row + 1, piece.col, piece.cells)) {
            row += 1;
        }
        return row;
    }

    private tryMove(dr: number, dc: number): boolean {
        const piece = this.current;
        if (!piece || this.gameOver) return false;

        if (this.collides(piece.row + dr, piece.col + dc, piece.cells)) {
            return false;
        }

        piece.row += dr;
        piece.col += dc;
        return true;
    }

    private collides(row: number, col: number, cells: Coord[]): boolean {
        for (const [r, c] of cells) {
            const targetRow = row + r;
            const targetCol = col + c;

            if (targetCol < 0 || targetCol >= COLS || targetRow >= ROWS) {
                return true;
            }
            if (targetRow >= 0 && this.grid[targetRow][targetCol]) {
                return true;
            }
        }

        return false;
    }

    private spawn(): void {
        const next = this.queue.shift();
        if (!next) {
            this.gameOver = true;
            return;
        }

        this.queue.push(randomPiece());
        next.row = 0;
        next.col = Math.floor((COLS - pieceWidth(next.cells)) / 2);
        this.current = next;

        if (this.collides(next.row, next.col, next.cells)) {
            this.gameOver = true;
        }
    }

    private lock(): ClearStep[] {
        const piece = this.current;
        if (!piece) return [];

        const newCells = new Set<Cell>();

        for (const [r, c] of piece.cells) {
            const row = piece.row + r;
            const col = piece.col + c;
            if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
                const cell: Cell = { symbol: piece.symbol, color: piece.color };
                this.grid[row][col] = cell;
                newCells.add(cell);
            }
        }

        this.current = null;
        const steps = this.resolve(newCells);
        this.spawn();
        return steps;
    }

    /**
     * Линия очищается, только если она собрана из клеток упавшей фигуры
     * и клеток, которые уже были на поле. Поэтому фигура не может
     * уничтожить саму себя сразу после приземления.
     *
     * Каскады (линии, образовавшиеся после гравитации) очищаются
     * отдельными шагами и только если в них есть клетки, которые
     * реально сдвинулись вниз.
     */
    private resolve(newCells: Set<Cell>): ClearStep[] {
        const steps: ClearStep[] = [];
        let combo = 0;
        let firstPass = true;
        const movedEver = new Set<Cell>();

        for (;;) {
            const groups = findMatchGroups(this.grid);
            const qualifying: MatchGroup[] = [];

            for (const group of groups) {
                const hasNew = group.cells.some((cell) => newCells.has(cell));
                const hasOld = group.cells.some((cell) => !newCells.has(cell));

                if (firstPass) {
                    if (!hasNew || !hasOld) continue;
                } else if (!hasOld || (!hasNew && !group.cells.some((cell) => movedEver.has(cell)))) {
                    // После первого шага разрешаем линии, которые остались
                    // отложенными по приоритету (в них есть клетки новой фигуры),
                    // и линии, которые реально собрались после гравитации.
                    continue;
                }

                qualifying.push(group);
            }

            if (qualifying.length === 0) break;

            // Приоритет: сначала горизонтальные и вертикальные линии.
            // Диагонали проверяются только если прямых линий нет.
            const straight = qualifying.filter((group) => group.direction !== 'diagonal');
            const pool = straight.length > 0 ? straight : qualifying;

            // За один шаг убираем линии только одного символа,
            // чтобы X и O не исчезали одновременно.
            const symbol = pool[0].cells[0].symbol;
            const selected = pool.filter((group) => group.cells[0].symbol === symbol);
            const toClear = new Set<Cell>();

            for (const group of selected) {
                for (const cell of group.cells) {
                    toClear.add(cell);
                }
            }

            const groupsCleared = selected.length;
            const matches: TaskLine[] = selected.map((group) => ({
                symbol: group.cells[0].symbol,
                direction: group.direction,
                length: group.cells.length,
            }));

            combo += 1;
            const before = this.grid.map((row) => row.slice());
            const cleared: ClearedCell[] = [];

            for (let row = 0; row < ROWS; row += 1) {
                for (let col = 0; col < COLS; col += 1) {
                    const cell = this.grid[row][col];
                    if (cell && toClear.has(cell)) {
                        cleared.push({ row, col, symbol: cell.symbol, color: cell.color });
                        this.grid[row][col] = null;
                    }
                }
            }

            const tier = comboTierFor(combo);
            const base = cleared.length * 50;
            const bonus = tier.bonus ?? 0;
            const gained = base * tier.multiplier + bonus;
            this.score += gained;
            this.lines += groupsCleared;
            this.level = 1 + Math.floor(this.lines / 10);
            const taskCompleted = this.advanceTask(matches);

            steps.push({
                before,
                cleared,
                groups: groupsCleared,
                combo,
                badge: tier.label,
                badgeColor: tier.color,
                base,
                multiplier: tier.multiplier,
                bonus,
                gained,
                score: this.score,
                level: this.level,
                lines: this.lines,
                completedTasks: this.completedTasks,
                matches,
                task: { definition: this.task.definition, progress: this.task.progress },
                taskCompleted,
            });

            const moved = applyGravity(this.grid);
            for (const cell of moved) {
                movedEver.add(cell);
            }
            firstPass = false;
        }

        return steps;
    }

    /**
     * Продвигает текущее задание по очищенным линиям. Когда прогресс
     * достигает цели, начисляет награду и выбирает новое случайное задание.
     */
    private advanceTask(matches: TaskLine[]): TaskCompletion | undefined {
        const matched = matches.filter((line) => taskMatchesLine(this.task.definition, line)).length;
        if (matched === 0) return undefined;

        this.task.progress += matched;

        if (this.task.progress < this.task.definition.target) {
            return undefined;
        }

        const completion: TaskCompletion = {
            definition: this.task.definition,
            reward: this.task.definition.reward,
        };

        this.score += completion.reward;
        this.completedTasks += 1;
        this.task = { definition: randomTask(completion.definition.id), progress: 0 };

        return completion;
    }
}
