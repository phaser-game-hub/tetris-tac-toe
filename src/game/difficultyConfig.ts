/**
 * Настройки сложности по уровням.
 *
 * Внешняя рамка поля всегда остаётся стандартной. С уровнем в текущем
 * конфиге, наоборот, становится меньше колонок и строк, поэтому сами
 * клетки крупнее, а фигуры из 4 клеток занимают большую часть поля.
 *
 * Для текущего уровня берётся запись с наибольшим `level`, который не
 * превышает текущий. Поэтому порядок записей в массиве не важен
 * (сейчас они перечислены по убыванию). Промежуточные уровни наследуют
 * ближайшую подходящую запись.
 *
 * - level     — с какого уровня включается настройка;
 * - cols      — количество колонок поля (минимум 4);
 * - rows      — количество строк поля; в текущем конфиге 2 × cols,
 *               чтобы клетки оставались квадратными и заполняли рамку,
 *               но код не подставляет это значение по умолчанию;
 * - dropDelay — задержка автоматического падения фигуры в миллисекундах
 *               (минимум 80 мс; сейчас 120 мс на всех уровнях).
 */
export interface DifficultyTier {
    level: number;
    cols: number;
    rows: number;
    dropDelay: number;
}

/** Сколько очищенных линий нужно для следующего уровня. */
export const LINES_PER_LEVEL = 10;

export const DIFFICULTY_CONFIG: DifficultyTier[] = [
  { level: 40, cols: 6, rows: 12, dropDelay: 120 },
  { level: 20, cols: 8, rows: 16, dropDelay: 120 },
  { level: 10, cols: 9, rows: 18, dropDelay: 120 },
  { level: 9, cols: 10, rows: 20, dropDelay: 120 },
  { level: 8, cols: 11, rows: 22, dropDelay: 120 },
  { level: 7, cols: 12, rows: 24, dropDelay: 120 },
  { level: 6, cols: 13, rows: 26, dropDelay: 120 },
  { level: 5, cols: 14, rows: 28, dropDelay: 120 },
  { level: 4, cols: 15, rows: 30, dropDelay: 120 },
  { level: 3, cols: 16, rows: 32, dropDelay: 120 },
  { level: 2, cols: 17, rows: 34, dropDelay: 120 },
  { level: 1, cols: 18, rows: 36, dropDelay: 120 },
];

/** Используется, если конфиг пуст или в нём нет подходящей записи. */
export const FALLBACK_DIFFICULTY: DifficultyTier = {
    level: 1,
    cols: 10,
    rows: 20,
    dropDelay: 800,
};

/** Настройки для уровня: запись с наибольшим `level`, не превышающим текущий. */
export function difficultyFor(level: number): DifficultyTier {
    let tier = FALLBACK_DIFFICULTY;

    for (const entry of DIFFICULTY_CONFIG) {
        if (entry.level <= level && entry.level >= tier.level) {
            tier = entry;
        }
    }

    return {
        ...tier,
        cols: Math.max(4, Math.floor(tier.cols)),
        rows: Math.max(4, Math.floor(tier.rows)),
        dropDelay: Math.max(80, Math.floor(tier.dropDelay)),
    };
}
