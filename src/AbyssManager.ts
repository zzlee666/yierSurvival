import Phaser from "phaser";

/**
 * 深渊季的腐化实体类型。
 *
 * - campfire：原本用于恢复理智的篝火，进入深渊后变成持续扣理智的心理污染源。
 * - chest：原本用于打开背包/容器的储物箱，进入深渊后变成记忆碎片触发器。
 * - custom：留给后续扩展，例如腐化工作台、腐化睡袋、腐化祭坛等。
 */
export type AbyssEntityKind = "campfire" | "chest" | "custom";

/**
 * 深渊交互回调统一签名。
 *
 * 这里不强制你的 Player 或实体继承某个基类，避免 AbyssManager 和玩法实体强耦合。
 * 主场景只要在自己的交互系统里调用当前实体的 callback 即可。
 */
export type AbyssInteractionCallback = (context: AbyssInteractionContext) => void;

export interface AbyssInteractionContext {
  scene: Phaser.Scene;
  manager: AbyssManager;
  entity: AbyssCorruptibleEntity;
  player?: AbyssPlayerLike;
}

/**
 * 玩家最低限度的形状。
 *
 * 如果你的 Player 已经有 loseSanity(delta) 或 stats.sanity，默认逻辑会自动识别。
 * 更复杂的属性系统可以通过 AbyssManagerConfig.applySanityDelta 注入。
 */
export interface AbyssPlayerLike {
  x: number;
  y: number;
  sanity?: number;
  stats?: {
    sanity?: number;
    maxSanity?: number;
  };
  data?: Phaser.Data.DataManager;
  loseSanity?: (amount: number) => void;
}

/**
 * 可腐化实体适配接口。
 *
 * 重点是 sprite、腐化贴图 key、交互回调重写函数。你现有的 Campfire / Chest
 * 不需要继承这个接口，只要在注册时包装成这个形状即可。
 */
export interface AbyssCorruptibleEntity {
  id: string;
  kind: AbyssEntityKind;
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite;
  corruptedTextureKey: string;
  drainRadius?: number;
  setInteractionCallback?: (callback: AbyssInteractionCallback) => void;
  onCorrupted?: (entity: AbyssCorruptibleEntity, manager: AbyssManager) => void;
}

export interface MemoryFragment {
  id: string;
  text: string;
  seen: boolean;
}

export interface AbyssVector2Like {
  x: number;
  y: number;
}

export interface AbyssManagerConfig {
  /**
   * 正常生存阶段正在播放的 BGM。
   * 可以是 scene.sound.add(...) 返回的实例，也可以留空。
   */
  normalBgm?: Phaser.Sound.BaseSound;

  /**
   * 深渊心跳音轨的 key，需要在 preload 中提前 load.audio("bgm_heartbeat", ...)。
   */
  heartbeatBgmKey?: string;

  /**
   * 可选的后处理 Pipeline key。
   * 示例：在 GameConfig 中注册 "AbyssDistortionPipeline"，这里传入同名 key。
   */
  postPipelineKey?: string;

  /**
   * 主镜头。默认使用 scene.cameras.main。
   */
  camera?: Phaser.Cameras.Scene2D.Camera;

  /**
   * 理智变更注入点。amount 为负数代表扣除理智。
   */
  applySanityDelta?: (player: AbyssPlayerLike, amount: number) => void;

  /**
   * 黑猫的可坐下点。通常放在玩家视野边缘或关键叙事坐标附近。
   */
  blackCatSitPoints?: AbyssVector2Like[];

  /**
   * 深渊 UI 和黑猫的贴图 key。默认假设已经 preload 了 black_cat。
   */
  blackCatTextureKey?: string;
}

const DEFAULT_HEARTBEAT_KEY = "bgm_heartbeat";
const DEFAULT_BLACK_CAT_KEY = "black_cat";
const ABYSS_TINT_COLOR = 0x330000;
const ABYSS_OVERLAY_DEPTH = 1_000_000;
const MEMORY_OVERLAY_DEPTH = 1_000_010;
const BLACK_CAT_DEPTH = 1_000_020;

/**
 * 后处理 Pipeline 占位类。
 *
 * 说明：
 * 1. Phaser 的 Pipeline 注册通常发生在 GameConfig 或启动场景中。
 * 2. 这个类只提供一个轻量的噪点/波纹 fragment shader，方便你后续替换成更复杂的心理恐怖滤镜。
 * 3. AbyssManager 不主动依赖它，manager 只接收 postPipelineKey，保持低耦合。
 */
export class AbyssDistortionPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: "AbyssDistortionPipeline",
      fragShader: `
        precision mediump float;

        uniform sampler2D uMainSampler;
        varying vec2 outTexCoord;
        uniform float time;

        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main(void) {
          vec2 uv = outTexCoord;
          float wave = sin((uv.y + time * 0.0015) * 80.0) * 0.0035;
          float grain = noise(uv * 900.0 + time * 0.02) * 0.055;
          vec4 color = texture2D(uMainSampler, vec2(uv.x + wave, uv.y));
          color.rgb += vec3(grain, 0.0, 0.0);
          color.r *= 1.16;
          color.g *= 0.76;
          color.b *= 0.68;
          gl_FragColor = color;
        }
      `,
    });
  }

  onPreRender(): void {
    this.set1f("time", this.game.loop.time);
  }
}

/**
 * 游离实体：黑猫。
 *
 * 它不是敌人，也不负责伤害玩家；它的作用是停留在玩家视野边缘制造“被观察”的感觉。
 * AbyssManager 会把它挂到独立 Camera 上，从而避免主镜头的深渊滤镜影响它的纯黑外观。
 */
export class BlackCat extends Phaser.GameObjects.Sprite {
  private catState: "wander" | "sit" = "wander";
  private target = new Phaser.Math.Vector2();
  private sitUntil = 0;
  private nextDecisionAt = 0;
  private readonly sitPoints: Phaser.Math.Vector2[];
  private readonly speedPixelsPerSecond = 42;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    textureKey = DEFAULT_BLACK_CAT_KEY,
    sitPoints: AbyssVector2Like[] = [],
  ) {
    super(scene, x, y, textureKey);

    this.sitPoints = sitPoints.map((point) => new Phaser.Math.Vector2(point.x, point.y));

    scene.add.existing(this);
    this.setDepth(BLACK_CAT_DEPTH);
    this.setOrigin(0.5, 0.9);
    this.setScale(0.78);
    this.setTint(0x000000);
    this.setBlendMode(Phaser.BlendModes.NORMAL);
    this.pickNewWanderTarget(scene.cameras.main);
  }

  /**
   * 每帧更新黑猫行为。
   *
   * @param time Phaser 的当前游戏时间，单位毫秒。
   * @param delta 距离上一帧的时间，单位毫秒。
   * @param camera 用于计算玩家视野边缘。通常传主镜头。
   */
  updateBlackCat(time: number, delta: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    if (!this.active) {
      return;
    }

    if (this.catState === "sit") {
      this.setVelocityLike(0, 0);

      if (time >= this.sitUntil) {
        this.catState = "wander";
        this.pickNewWanderTarget(camera);
      }

      return;
    }

    if (time >= this.nextDecisionAt || Phaser.Math.Distance.BetweenPoints(this, this.target) < 8) {
      if (this.sitPoints.length > 0 && Phaser.Math.Between(0, 100) < 28) {
        this.sitAtRandomPoint(time);
      } else {
        this.pickNewWanderTarget(camera);
      }
    }

    const deltaSeconds = delta / 1000;
    const direction = this.target.clone().subtract(new Phaser.Math.Vector2(this.x, this.y));

    if (direction.lengthSq() > 0.001) {
      direction.normalize();
      this.x += direction.x * this.speedPixelsPerSecond * deltaSeconds;
      this.y += direction.y * this.speedPixelsPerSecond * deltaSeconds;
      this.setFlipX(direction.x < 0);
    }
  }

  /**
   * 坐到明确的叙事点位，例如废弃帐篷、井边、玩家出生点残影旁。
   */
  sitAt(x: number, y: number, durationMs = 3600): void {
    this.catState = "sit";
    this.setPosition(x, y);
    this.sitUntil = this.scene.time.now + durationMs;
  }

  private sitAtRandomPoint(time: number): void {
    const point = Phaser.Utils.Array.GetRandom(this.sitPoints);
    this.catState = "sit";
    this.setPosition(point.x, point.y);
    this.sitUntil = time + Phaser.Math.Between(2600, 6200);
  }

  /**
   * 在镜头 worldView 的四条边附近选择一个目标点。
   * 这样玩家通常只会在视野边缘看到它，而不是被它正面追逐。
   */
  private pickNewWanderTarget(camera: Phaser.Cameras.Scene2D.Camera): void {
    const view = camera.worldView;
    const margin = 42 / Math.max(camera.zoom, 0.001);
    const side = Phaser.Math.Between(0, 3);
    const minX = view.left + margin;
    const maxX = view.right - margin;
    const minY = view.top + margin;
    const maxY = view.bottom - margin;

    if (side === 0) {
      this.target.set(minX, Phaser.Math.FloatBetween(minY, maxY));
    } else if (side === 1) {
      this.target.set(maxX, Phaser.Math.FloatBetween(minY, maxY));
    } else if (side === 2) {
      this.target.set(Phaser.Math.FloatBetween(minX, maxX), minY);
    } else {
      this.target.set(Phaser.Math.FloatBetween(minX, maxX), maxY);
    }

    this.nextDecisionAt = this.scene.time.now + Phaser.Math.Between(1800, 4200);
  }

  /**
   * Sprite 本身没有物理速度接口；这里保留一个空实现作为语义标记。
   * 如果你把黑猫改成 Arcade.Sprite，可以在这里转接 body.setVelocity。
   */
  private setVelocityLike(_x: number, _y: number): void {
    return;
  }
}

/**
 * 第 60 天“深渊异变”管理器。
 *
 * 使用方式：
 * 1. 在 MainScene.create 中 new AbyssManager(this, config)。
 * 2. 调用 registerEntity(...) 注册篝火、箱子等关键生存实体。
 * 3. 在游戏天数达到 60 时调用 triggerAbyssMode(player)。
 * 4. 在 MainScene.update 中调用 abyssManager.update(player, delta)。
 */
export class AbyssManager {
  private readonly scene: Phaser.Scene;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly config: AbyssManagerConfig;
  private readonly corruptibleEntities = new Map<string, AbyssCorruptibleEntity>();
  private readonly corruptedEntityIds = new Set<string>();
  private readonly memoryFragments: MemoryFragment[];
  private abyssActive = false;
  private heartbeatBgm?: Phaser.Sound.BaseSound;
  private tintOverlay?: Phaser.GameObjects.Rectangle;
  private memoryContainer?: Phaser.GameObjects.Container;
  private memoryBackdrop?: Phaser.GameObjects.Rectangle;
  private memoryText?: Phaser.GameObjects.Text;
  private typewriterEvent?: Phaser.Time.TimerEvent;
  private blackCat?: BlackCat;
  private blackCatCamera?: Phaser.Cameras.Scene2D.Camera;
  private campfireDrainBucketSeconds = 0;

  constructor(scene: Phaser.Scene, config: AbyssManagerConfig = {}) {
    this.scene = scene;
    this.camera = config.camera ?? scene.cameras.main;
    this.config = config;
    this.memoryFragments = this.createDefaultMemoryFragments();

    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layoutFixedOverlays, this);
  }

  /**
   * 注册一个可腐化实体。
   *
   * 这个函数可以在 create 阶段调用，也可以在实体运行时生成后调用。
   */
  registerEntity(entity: AbyssCorruptibleEntity): void {
    this.corruptibleEntities.set(entity.id, entity);

    // 如果实体是在深渊模式启动后才生成的，立刻补腐化，避免出现正常贴图漏网。
    if (this.abyssActive) {
      this.corruptEntity(entity);
    }
  }

  unregisterEntity(entityId: string): void {
    this.corruptibleEntities.delete(entityId);
    this.corruptedEntityIds.delete(entityId);
  }

  /**
   * 第 60 天维度切换入口。
   *
   * 你可以在 MainScene 的日历系统中检测：
   * if (day >= 60 && !abyssManager.isActive()) abyssManager.triggerAbyssMode(player)
   */
  triggerAbyssMode(player?: AbyssPlayerLike): void {
    if (this.abyssActive) {
      return;
    }

    this.abyssActive = true;

    this.playDimensionShiftCameraFx();
    this.applyAbyssPostFx();
    this.crossfadeToHeartbeat();
    this.corruptAllEntities();
    this.spawnBlackCat(player);
    this.showMemoryFragment("forced");
  }

  isActive(): boolean {
    return this.abyssActive;
  }

  /**
   * 每帧由场景调用。
   *
   * 这里处理：
   * - 腐化篝火的每秒理智扣除；
   * - 黑猫游荡；
   * - 黑猫专用 Camera 与主 Camera 的同步。
   */
  update(player: AbyssPlayerLike | undefined, deltaMs: number): void {
    if (!this.abyssActive) {
      return;
    }

    this.updateCampfireSanityDrain(player, deltaMs);
    this.blackCat?.updateBlackCat(this.scene.time.now, deltaMs, this.camera);
    this.syncBlackCatCamera();
  }

  /**
   * 外部系统可以直接触发记忆文本，例如剧情脚本或特殊道具。
   */
  showMemoryFragment(mode: "random" | "next" | "forced" = "next"): void {
    const fragment = this.pickMemoryFragment(mode);

    if (!fragment) {
      return;
    }

    fragment.seen = true;
    this.createSilencePocket();
    this.showTypewriterOverlay(fragment.text);
  }

  /**
   * 手动扣理智。腐化交互 callback 和篝火污染光环都会走这里。
   */
  applySanityDelta(player: AbyssPlayerLike | undefined, amount: number): void {
    if (!player) {
      return;
    }

    if (this.config.applySanityDelta) {
      this.config.applySanityDelta(player, amount);
      return;
    }

    if (typeof player.loseSanity === "function" && amount < 0) {
      player.loseSanity(Math.abs(amount));
      return;
    }

    if (typeof player.stats?.sanity === "number") {
      const maxSanity = player.stats.maxSanity ?? 100;
      player.stats.sanity = Phaser.Math.Clamp(player.stats.sanity + amount, 0, maxSanity);
      return;
    }

    if (typeof player.sanity === "number") {
      player.sanity = Phaser.Math.Clamp(player.sanity + amount, 0, 100);
      return;
    }

    if (player.data?.has("sanity")) {
      const current = Number(player.data.get("sanity"));
      player.data.set("sanity", Phaser.Math.Clamp(current + amount, 0, 100));
    }
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layoutFixedOverlays, this);
    this.typewriterEvent?.remove(false);
    this.tintOverlay?.destroy();
    this.memoryContainer?.destroy();
    this.blackCat?.destroy();
    this.blackCatCamera?.destroy();
    this.heartbeatBgm?.stop();
  }

  private playDimensionShiftCameraFx(): void {
    // 强烈震屏：第 60 天的“现实断裂”反馈。
    this.camera.shake(1250, 0.035, true);

    // 短暂闪红，让玩家先感到冲击，再进入持续暗红覆盖。
    this.camera.flash(420, 120, 0, 0, false);
  }

  private applyAbyssPostFx(): void {
    this.tintOverlay = this.scene.add
      .rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, ABYSS_TINT_COLOR, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(ABYSS_OVERLAY_DEPTH);

    this.scene.tweens.add({
      targets: this.tintOverlay,
      alpha: 0.48,
      duration: 1600,
      ease: "Sine.easeInOut",
    });

    // 可选：如果项目注册了自定义 PostFX Pipeline，这里把它挂到主 Camera。
    if (this.config.postPipelineKey) {
      this.camera.setPostPipeline(this.config.postPipelineKey);
    }
  }

  private crossfadeToHeartbeat(): void {
    const heartbeatKey = this.config.heartbeatBgmKey ?? DEFAULT_HEARTBEAT_KEY;

    if (this.config.normalBgm) {
      this.scene.tweens.add({
        targets: this.config.normalBgm,
        volume: 0,
        duration: 1800,
        ease: "Sine.easeOut",
        onComplete: () => this.config.normalBgm?.stop(),
      });
    }

    if (!this.scene.cache.audio.exists(heartbeatKey)) {
      return;
    }

    this.heartbeatBgm = this.scene.sound.add(heartbeatKey, {
      loop: true,
      volume: 0,
    });
    this.heartbeatBgm.play();

    this.scene.tweens.add({
      targets: this.heartbeatBgm,
      volume: 0.72,
      duration: 2600,
      ease: "Sine.easeIn",
    });
  }

  private corruptAllEntities(): void {
    for (const entity of this.corruptibleEntities.values()) {
      this.corruptEntity(entity);
    }
  }

  private corruptEntity(entity: AbyssCorruptibleEntity): void {
    if (this.corruptedEntityIds.has(entity.id)) {
      return;
    }

    this.corruptedEntityIds.add(entity.id);

    // 贴图替换保留原 sprite 实例，因此物理 body、depth、scale、引用关系都不会断。
    entity.sprite.setTexture(entity.corruptedTextureKey);
    entity.sprite.setTint(0xffb0b0);

    // 重写交互回调：旧逻辑被深渊逻辑替代。
    if (entity.kind === "campfire") {
      entity.setInteractionCallback?.((context) => {
        context.manager.applySanityDelta(context.player, -4);
        context.manager.showMemoryFragment("random");
      });
    } else if (entity.kind === "chest") {
      entity.setInteractionCallback?.((context) => {
        context.manager.showMemoryFragment("next");
      });
    }

    entity.onCorrupted?.(entity, this);
  }

  private updateCampfireSanityDrain(player: AbyssPlayerLike | undefined, deltaMs: number): void {
    if (!player) {
      return;
    }

    let insideCorruptedCampfire = false;

    for (const entity of this.corruptibleEntities.values()) {
      if (entity.kind !== "campfire" || !this.corruptedEntityIds.has(entity.id)) {
        continue;
      }

      const radius = entity.drainRadius ?? 128;
      const distance = Phaser.Math.Distance.Between(
        player.x,
        player.y,
        entity.sprite.x,
        entity.sprite.y,
      );

      if (distance <= radius) {
        insideCorruptedCampfire = true;
        break;
      }
    }

    if (!insideCorruptedCampfire) {
      this.campfireDrainBucketSeconds = 0;
      return;
    }

    this.campfireDrainBucketSeconds += deltaMs / 1000;

    while (this.campfireDrainBucketSeconds >= 1) {
      this.campfireDrainBucketSeconds -= 1;
      this.applySanityDelta(player, -2);
    }
  }

  private spawnBlackCat(player?: AbyssPlayerLike): void {
    const startX = player ? player.x + 220 : this.camera.worldView.right - 64;
    const startY = player ? player.y - 120 : this.camera.worldView.bottom - 96;

    this.blackCat = new BlackCat(
      this.scene,
      startX,
      startY,
      this.config.blackCatTextureKey ?? DEFAULT_BLACK_CAT_KEY,
      this.config.blackCatSitPoints ?? [],
    );

    // 主 Camera 忽略黑猫，避免主镜头深渊 PostFX 扭曲它。
    this.camera.ignore(this.blackCat);

    // 单独给黑猫一个无滤镜 Camera，并保持与主 Camera 同步。
    this.blackCatCamera = this.scene.cameras.add(
      this.camera.x,
      this.camera.y,
      this.camera.width,
      this.camera.height,
    );
    this.blackCatCamera.setName("black-cat-immune-camera");
    this.blackCatCamera.setScroll(this.camera.scrollX, this.camera.scrollY);
    this.blackCatCamera.setZoom(this.camera.zoom);
    this.syncBlackCatCamera();
  }

  private syncBlackCatCamera(): void {
    if (!this.blackCat || !this.blackCatCamera) {
      return;
    }

    this.blackCatCamera.setScroll(this.camera.scrollX, this.camera.scrollY);
    this.blackCatCamera.setZoom(this.camera.zoom);

    // 让黑猫专用 Camera 只渲染黑猫，其他所有对象都由主 Camera 负责。
    const ignored = this.scene.children.list.filter((child) => child !== this.blackCat);
    this.blackCatCamera.ignore(ignored);
  }

  private pickMemoryFragment(mode: "random" | "next" | "forced"): MemoryFragment | undefined {
    const unseen = this.memoryFragments.filter((fragment) => !fragment.seen);

    if (mode === "random") {
      return Phaser.Utils.Array.GetRandom(unseen.length > 0 ? unseen : this.memoryFragments);
    }

    if (mode === "forced") {
      return this.memoryFragments[0];
    }

    return unseen[0] ?? Phaser.Utils.Array.GetRandom(this.memoryFragments);
  }

  private showTypewriterOverlay(text: string): void {
    this.typewriterEvent?.remove(false);
    this.ensureMemoryOverlay();

    if (!this.memoryContainer || !this.memoryBackdrop || !this.memoryText) {
      return;
    }

    this.memoryText.setText("");
    this.memoryContainer.setAlpha(0);
    this.memoryContainer.setVisible(true);

    this.scene.tweens.add({
      targets: this.memoryContainer,
      alpha: 1,
      duration: 220,
      ease: "Sine.easeOut",
    });

    let cursor = 0;
    const chars = Array.from(text);

    this.typewriterEvent = this.scene.time.addEvent({
      delay: 56,
      repeat: chars.length - 1,
      callback: () => {
        cursor += 1;
        this.memoryText?.setText(chars.slice(0, cursor).join(""));
      },
    });

    this.scene.time.delayedCall(chars.length * 56 + 2600, () => {
      if (!this.memoryContainer) {
        return;
      }

      this.scene.tweens.add({
        targets: this.memoryContainer,
        alpha: 0,
        duration: 620,
        ease: "Sine.easeIn",
        onComplete: () => this.memoryContainer?.setVisible(false),
      });
    });
  }

  private ensureMemoryOverlay(): void {
    if (this.memoryContainer && this.memoryBackdrop && this.memoryText) {
      this.layoutFixedOverlays();
      return;
    }

    this.memoryBackdrop = this.scene.add
      .rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, 0x000000, 0.62)
      .setOrigin(0)
      .setScrollFactor(0);

    this.memoryText = this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height / 2, "", {
        fontFamily: "serif",
        fontSize: "28px",
        color: "#ff2a2a",
        align: "center",
        lineSpacing: 12,
        wordWrap: {
          width: Math.min(760, this.scene.scale.width - 64),
          useAdvancedWrap: true,
        },
        shadow: {
          offsetX: 0,
          offsetY: 0,
          color: "#330000",
          blur: 16,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.memoryContainer = this.scene.add
      .container(0, 0, [this.memoryBackdrop, this.memoryText])
      .setDepth(MEMORY_OVERLAY_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    this.layoutFixedOverlays();
  }

  private layoutFixedOverlays(): void {
    this.tintOverlay?.setSize(this.scene.scale.width, this.scene.scale.height);
    this.memoryBackdrop?.setSize(this.scene.scale.width, this.scene.scale.height);
    this.memoryText?.setPosition(this.scene.scale.width / 2, this.scene.scale.height / 2);
    this.memoryText?.setWordWrapWidth(Math.min(760, this.scene.scale.width - 64), true);

    if (this.blackCatCamera) {
      this.blackCatCamera.setViewport(
        this.camera.x,
        this.camera.y,
        this.camera.width,
        this.camera.height,
      );
    }
  }

  private createSilencePocket(durationMs = 980): void {
    const soundManager = this.scene.sound;
    const previousVolume = soundManager.volume;

    this.scene.tweens.add({
      targets: soundManager,
      volume: 0.08,
      duration: 120,
      ease: "Sine.easeOut",
      yoyo: true,
      hold: durationMs,
      onComplete: () => {
        soundManager.volume = previousVolume;
      },
    });
  }

  private createDefaultMemoryFragments(): MemoryFragment[] {
    return [
      {
        id: "m01",
        seen: false,
        text: "火没有熄灭。它只是学会了用你的名字取暖。",
      },
      {
        id: "m02",
        seen: false,
        text: "箱子里没有物资。只有一双从里面向外看的眼睛。",
      },
      {
        id: "m03",
        seen: false,
        text: "第六十个清晨没有太阳，只有营地把影子还给了你。",
      },
      {
        id: "m04",
        seen: false,
        text: "你们曾经数过脚印。后来发现多出来的那一串，总是从家门口开始。",
      },
      {
        id: "m05",
        seen: false,
        text: "白色的雪记得一切，棕色的土替它沉默。",
      },
      {
        id: "m06",
        seen: false,
        text: "不要回头。回头时，另一个你会以为自己终于被承认。",
      },
      {
        id: "m07",
        seen: false,
        text: "海在很远的地方，却每晚从篝火下面涨潮。",
      },
      {
        id: "m08",
        seen: false,
        text: "黑猫没有影子。它把影子留给了需要活下去的人。",
      },
    ];
  }
}
