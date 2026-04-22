import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";

/**
 * Phaser 3 游戏入口。
 *
 * 现在项目会真正启动 MainScene，而不是之前的原生 WebGL demo。
 * 深渊滤镜 Pipeline 会在 MainScene.create() 中注册为 PostFX Pipeline。
 */
const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-root",
  width: 1280,
  height: 720,
  backgroundColor: "#141711",
  pixelArt: false,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
      gravity: {
        x: 0,
        y: 0,
      },
    },
  },
  dom: {
    createContainer: true,
  },
  scene: [MainScene],
};

new Phaser.Game(gameConfig);
