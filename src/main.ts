import Phaser from 'phaser';
import MainScene from './scenes/MainScene';
import './style.css';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,

    width: 720,
    height: 1280,

    backgroundColor: '#232568',

    parent: 'game-container',

    scene: [MainScene],

    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

const startGame = (): void => {
    new Phaser.Game(config);
};

const font = new FontFace(
    'Baloo',
    `url(${import.meta.env.BASE_URL}font/baloo-cyrillic.ttf)`,
);

font
    .load()
    .then((loaded) => {
        (document.fonts as FontFaceSet & { add(face: FontFace): void }).add(loaded);
    })
    .catch((error) => {
        console.warn('Не удалось загрузить шрифт, используется запасной:', error);
    })
    .finally(startGame);
