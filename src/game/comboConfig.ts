/**
 * Настройки комбо.
 *
 * Каждая запись — отдельная плашка:
 * - cascades   — сколько очисток подряд нужно, чтобы плашка включилась;
 * - label      — текст плашки;
 * - color      — цвет текста плашки;
 * - multiplier — множитель очков за каждую очищенную клетку;
 * - bonus      — дополнительные очки за шаг (необязательно).
 *
 * Для текущего каскада берётся запись с наибольшим `cascades`,
 * который не превышает номер каскада. Поэтому записи можно делать
 * не для каждого шага, а только для нужных порогов.
 *
 * Пример: если указать только 1, 3 и 5, то каскады 1–2 получат
 * первую плашку, 3–4 — вторую, 5 и больше — третью.
 */
export interface ComboTier {
    cascades: number;
    label: string;
    color: string;
    multiplier: number;
    bonus?: number;
}

export const COMBO_CONFIG: ComboTier[] = [
    { cascades: 1, label: 'CLEAR', color: '#9cc4ff', multiplier: 1 },
    { cascades: 2, label: 'COMBO ×2', color: '#ffd76a', multiplier: 2 },
    { cascades: 3, label: 'COMBO ×3', color: '#ffd76a', multiplier: 3 },
    { cascades: 4, label: 'COMBO ×4', color: '#ffb347', multiplier: 4 },
    { cascades: 5, label: 'MEGA COMBO', color: '#ff6b8a', multiplier: 5, bonus: 250 },
    { cascades: 6, label: 'ULTRA COMBO', color: '#ff4d6d', multiplier: 6, bonus: 500 },
];

/** Используется, если в конфиге нет ни одной подходящей плашки. */
export const FALLBACK_COMBO_TIER: ComboTier = {
    cascades: 1,
    label: 'CLEAR',
    color: '#9cc4ff',
    multiplier: 1,
};

export function comboTierFor(combo: number): ComboTier {
    let tier = FALLBACK_COMBO_TIER;

    for (const entry of COMBO_CONFIG) {
        if (entry.cascades <= combo && entry.cascades >= tier.cascades) {
            tier = entry;
        }
    }

    return tier;
}
