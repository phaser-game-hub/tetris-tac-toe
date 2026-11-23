/**
 * Хранит лучший счёт между игровыми сессиями в localStorage.
 * Если хранилище недоступно (приватный режим, ограничения браузера),
 * игра продолжает работать с рекордом 0.
 */
const BEST_SCORE_KEY = 'tetris-tac-toe.best-score';

export function loadBestScore(): number {
    try {
        const raw = window.localStorage.getItem(BEST_SCORE_KEY);
        if (!raw) return 0;

        const value = Number.parseInt(raw, 10);
        return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
        return 0;
    }
}

export function saveBestScore(score: number): void {
    try {
        window.localStorage.setItem(BEST_SCORE_KEY, String(Math.max(0, Math.floor(score))));
    } catch {
        // Рекорд не сохранится, но игра должна продолжить работу.
    }
}
