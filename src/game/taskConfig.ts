import type { MatchDirection, SymbolType } from './model';

/**
 * Настройки заданий.
 *
 * Каждая запись — отдельное задание:
 * - id          — уникальный идентификатор (используется, чтобы не выдавать
 *                 одно и то же задание два раза подряд);
 * - title       — короткий заголовок для плашки задания;
 * - description — текст задания;
 * - symbol      — какой символ нужен в линии ('X', 'O' или 'any');
 * - direction   — направление линии ('horizontal', 'vertical', 'diagonal'
 *                 или 'any');
 * - target      — сколько подходящих линий нужно собрать;
 * - minLength   — минимальная длина линии (по умолчанию 3);
 * - reward      — сколько очков начисляется за выполнение.
 *
 * Задание считается выполненным, когда очищено нужное количество
 * подходящих линий. После этого начисляется reward и случайным образом
 * выбирается новое задание.
 */
export type TaskSymbol = SymbolType | 'any';
export type TaskDirection = MatchDirection | 'any';

export interface TaskDefinition {
    id: string;
    title: string;
    description: string;
    symbol: TaskSymbol;
    direction: TaskDirection;
    target: number;
    minLength?: number;
    reward: number;
}

/** Текущее состояние задания: определение и прогресс по линиям. */
export interface TaskState {
    definition: TaskDefinition;
    progress: number;
}

/** Выполненное задание — используется для показа награды. */
export interface TaskCompletion {
    definition: TaskDefinition;
    reward: number;
}

/** Очищенная линия, по которой проверяется прогресс задания. */
export interface TaskLine {
    symbol: SymbolType;
    direction: MatchDirection;
    length: number;
}

export const TASK_CONFIG: TaskDefinition[] = [
    {
        id: 'x-horizontal',
        title: 'РЯД КРЕСТИКОВ',
        description: 'Собери горизонтальную линию из X',
        symbol: 'X',
        direction: 'horizontal',
        target: 1,
        reward: 300,
    },
    {
        id: 'x-vertical',
        title: 'СТОЛБЕЦ КРЕСТИКОВ',
        description: 'Собери вертикальную линию из X',
        symbol: 'X',
        direction: 'vertical',
        target: 1,
        reward: 300,
    },
    {
        id: 'x-diagonal',
        title: 'ДИАГОНАЛЬ КРЕСТИКОВ',
        description: 'Собери диагональ из X',
        symbol: 'X',
        direction: 'diagonal',
        target: 1,
        reward: 450,
    },
    {
        id: 'o-horizontal',
        title: 'РЯД НОЛИКОВ',
        description: 'Собери горизонтальную линию из O',
        symbol: 'O',
        direction: 'horizontal',
        target: 1,
        reward: 300,
    },
    {
        id: 'o-vertical',
        title: 'СТОЛБЕЦ НОЛИКОВ',
        description: 'Собери вертикальную линию из O',
        symbol: 'O',
        direction: 'vertical',
        target: 1,
        reward: 300,
    },
    {
        id: 'o-diagonal',
        title: 'ДИАГОНАЛЬ НОЛИКОВ',
        description: 'Собери диагональ из O',
        symbol: 'O',
        direction: 'diagonal',
        target: 1,
        reward: 450,
    },
    {
        id: 'double-line',
        title: 'ДВОЙНАЯ ЛИНИЯ',
        description: 'Собери 2 любые линии',
        symbol: 'any',
        direction: 'any',
        target: 2,
        reward: 700,
    },
    {
        id: 'long-x',
        title: 'ДЛИННЫЙ РЯД X',
        description: 'Собери линию из 4 X',
        symbol: 'X',
        direction: 'any',
        target: 1,
        minLength: 4,
        reward: 600,
    },
    {
        id: 'long-o',
        title: 'ДЛИННЫЙ РЯД O',
        description: 'Собери линию из 4 O',
        symbol: 'O',
        direction: 'any',
        target: 1,
        minLength: 4,
        reward: 600,
    },
];

/** Используется, если в конфиге не оказалось ни одного задания. */
export const FALLBACK_TASK: TaskDefinition = {
    id: 'fallback',
    title: 'ЛИНИЯ',
    description: 'Собери любую линию из 3 символов',
    symbol: 'any',
    direction: 'any',
    target: 1,
    reward: 300,
};

/** Случайное задание из конфига. Предыдущее задание исключается. */
export function randomTask(previousId?: string): TaskDefinition {
    if (TASK_CONFIG.length === 0) return FALLBACK_TASK;

    const pool = TASK_CONFIG.filter((task) => task.id !== previousId);
    const source = pool.length > 0 ? pool : TASK_CONFIG;

    return source[Math.floor(Math.random() * source.length)];
}

/** Подходит ли очищенная линия под условие задания. */
export function taskMatchesLine(task: TaskDefinition, line: TaskLine): boolean {
    if (task.symbol !== 'any' && task.symbol !== line.symbol) return false;
    if (task.direction !== 'any' && task.direction !== line.direction) return false;

    return line.length >= (task.minLength ?? 3);
}
