/**
 * Настройки звука.
 *
 * Каждый эффект — отдельная запись:
 * - file   — путь к WAV-файлу относительно папки `public`;
 * - volume — громкость от 0 до 1 (0 полностью отключает звук);
 * - rate   — скорость воспроизведения (необязательно, 1 — как в файле).
 *
 * Чтобы заменить звук, положите новый файл в `public/audio` и укажите
 * его путь здесь. Файлы из `storage_assets` в игру не попадают напрямую:
 * для сборки используются только файлы из `public`.
 *
 * Текущие звуки:
 * - cellDestroy  — уничтожение клеток при очистке линии;
 * - levelUp      — уведомление о повышении уровня;
 * - taskComplete — выполнение задания;
 * - pieceFall    — приземление и фиксация фигуры на поле;
 * - victory      — победа (игра окончена с новым рекордом);
 * - defeat       — поражение (игра окончена без нового рекорда).
 */
export type SoundKey =
    | 'cellDestroy'
    | 'levelUp'
    | 'taskComplete'
    | 'pieceFall'
    | 'victory'
    | 'defeat';

export interface SoundDefinition {
    file: string;
    volume: number;
    rate?: number;
}

export interface MusicDefinition {
    file: string;
    volume: number;
    loop: boolean;
}

export const SOUND_CONFIG: Record<SoundKey, SoundDefinition> = {
    cellDestroy: { file: 'audio/sfx/cell-destroy.wav', volume: 0.5 },
    levelUp: { file: 'audio/sfx/level-up.wav', volume: 0.7 },
    taskComplete: { file: 'audio/sfx/task-complete.wav', volume: 0.7 },
    pieceFall: { file: 'audio/sfx/piece-fall.wav', volume: 0.35 },
    victory: { file: 'audio/sfx/victory.wav', volume: 0.8 },
    defeat: { file: 'audio/sfx/defeat.wav', volume: 0.8 },
};

/** Фоновая музыка. Поставьте `volume: 0`, чтобы её отключить. */
export const MUSIC_CONFIG: MusicDefinition = {
    file: 'audio/music/background.wav',
    volume: 0.18,
    loop: true,
};

/**
 * Полный URL файла из `public` с учётом `base` из vite.config.ts.
 * Благодаря этому звуки работают и при сборке в подпапку.
 */
export function audioUrl(file: string): string {
    return `${import.meta.env.BASE_URL}${file}`;
}
