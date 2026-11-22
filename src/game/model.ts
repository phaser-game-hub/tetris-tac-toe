export type SymbolType = 'X' | 'O';

export interface Cell {
    symbol: SymbolType;
    color: number;
}

export type Coord = [number, number];

export interface Piece {
    cells: Coord[];
    symbol: SymbolType;
    color: number;
    row: number;
    col: number;
}

export type Grid = (Cell | null)[][];

const SHAPES: Coord[][] = [
    // I
    [[0, 0], [0, 1], [0, 2], [0, 3]],
    // O
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    // T
    [[0, 0], [0, 1], [0, 2], [1, 1]],
    // S
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    // Z
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    // J
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    // L
    [[0, 2], [1, 0], [1, 1], [1, 2]],
];

const COLORS: Record<SymbolType, number[]> = {
    X: [0x3f8efc, 0x8b6cf0],
    O: [0xf59a3c, 0xf2649a],
};

export function createGrid(cols: number, rows: number): Grid {
    return Array.from({ length: rows }, () => Array<Cell | null>(cols).fill(null));
}

export function normalize(cells: Coord[]): Coord[] {
    const minRow = Math.min(...cells.map(([row]) => row));
    const minCol = Math.min(...cells.map(([, col]) => col));

    return cells.map(([row, col]) => [row - minRow, col - minCol]);
}

export function rotate(cells: Coord[]): Coord[] {
    const maxRow = Math.max(...cells.map(([row]) => row));

    return normalize(cells.map(([row, col]) => [col, maxRow - row]));
}

export function pieceWidth(cells: Coord[]): number {
    return Math.max(...cells.map(([, col]) => col)) + 1;
}

export function pieceHeight(cells: Coord[]): number {
    return Math.max(...cells.map(([row]) => row)) + 1;
}

export function randomPiece(): Piece {
    const cells = normalize(SHAPES[Math.floor(Math.random() * SHAPES.length)]);
    const symbol: SymbolType = Math.random() < 0.5 ? 'X' : 'O';
    const palette = COLORS[symbol];
    const color = palette[Math.floor(Math.random() * palette.length)];

    return { cells, symbol, color, row: 0, col: 0 };
}

function inside(grid: Grid, row: number, col: number): boolean {
    return row >= 0 && row < grid.length && col >= 0 && col < grid[0].length;
}

export type MatchDirection = 'horizontal' | 'vertical' | 'diagonal';

export interface MatchGroup {
    cells: Cell[];
    direction: MatchDirection;
}

const DIRECTIONS: { dr: number; dc: number; direction: MatchDirection }[] = [
    { dr: 0, dc: 1, direction: 'horizontal' },
    { dr: 1, dc: 0, direction: 'vertical' },
    { dr: 1, dc: 1, direction: 'diagonal' },
    { dr: 1, dc: -1, direction: 'diagonal' },
];

/**
 * Ищет все линии из 3+ одинаковых символов по горизонтали,
 * вертикали и обеим диагоналям. Возвращает группы клеток
 * вместе с направлением, чтобы вызывающий код мог задать приоритет.
 */
export function findMatchGroups(grid: Grid): MatchGroup[] {
    const groups: MatchGroup[] = [];
    const rows = grid.length;
    const cols = grid[0].length;

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const cell = grid[row][col];
            if (!cell) continue;

            for (const { dr, dc, direction } of DIRECTIONS) {
                const prevRow = row - dr;
                const prevCol = col - dc;
                if (inside(grid, prevRow, prevCol) && grid[prevRow][prevCol]?.symbol === cell.symbol) {
                    continue;
                }

                const run: Cell[] = [];
                let r = row;
                let c = col;

                while (inside(grid, r, c)) {
                    const current = grid[r][c];
                    if (!current || current.symbol !== cell.symbol) break;
                    run.push(current);
                    r += dr;
                    c += dc;
                }

                if (run.length >= 3) {
                    groups.push({ cells: run, direction });
                }
            }
        }
    }

    return groups;
}

export function applyGravity(grid: Grid): Set<Cell> {
    const moved = new Set<Cell>();
    const rows = grid.length;
    const cols = grid[0].length;

    for (let col = 0; col < cols; col += 1) {
        let writeRow = rows - 1;

        for (let row = rows - 1; row >= 0; row -= 1) {
            const cell = grid[row][col];
            if (!cell) continue;

            if (writeRow !== row) {
                grid[writeRow][col] = cell;
                grid[row][col] = null;
                moved.add(cell);
            }

            writeRow -= 1;
        }
    }

    return moved;
}
