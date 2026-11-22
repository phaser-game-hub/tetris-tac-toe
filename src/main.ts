import Phaser from 'phaser';
import MainScene from './scenes/MainScene';
import './style.css';

const config = {
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

new Phaser.Game(config);
