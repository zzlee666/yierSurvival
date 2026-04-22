import Phaser from "phaser";

export type MapSeason = "Spring" | "Summer" | "Autumn" | "Winter";
export type MapZoneId = "hub" | "forest" | "mountains" | "coast" | "sea" | "island";
export type MapBearId = "yier" | "bubu";

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapBearAdapter {
  id: MapBearId;
  sprite: Phaser.Physics.Arcade.Sprite;
}

export interface ZoneDefinition {
  id: MapZoneId;
  displayName: string;
  description: string;
  tileTexture: string;
  center: MapPoint;
  radius: number;
  resources: string[];
  appleSpawnPoints: MapPoint[];
  enemySpawnPoints: MapPoint[];
}

export interface SeasonalAccessLock {
  id: string;
  season: MapSeason;
  label: string;
  kind: "river" | "bramble" | "snowdrift";
  requiredBear: MapBearId;
  bounds: Phaser.Geom.Rectangle;
  message: string;
  resolved: boolean;
  body?: Phaser.Physics.Arcade.Image;
}

export interface MapCreationResult {
  walls: Phaser.Physics.Arcade.StaticGroup;
  appleSpawnPoints: MapPoint[];
  enemySpawnPoints: MapPoint[];
  zones: ZoneDefinition[];
}

export type MapInteractionResult =
  | {
      type: "supply-cache";
      apples: number;
      wood: number;
      message: string;
    }
  | {
      type: "access-unlocked";
      message: string;
    }
  | {
      type: "access-blocked";
      message: string;
    }
  | {
      type: "black-cat-footprint";
      message: string;
    };

export interface MapRuntimeEvent {
  type: "flashback";
  obeliskId: string;
  message: string;
}

interface SupplyCache {
  id: string;
  zone: MapZoneId;
  sprite: Phaser.Physics.Arcade.Image;
  apples: number;
  wood: number;
  opened: boolean;
}

interface FootprintTrail {
  id: string;
  zone: MapZoneId;
  footprints: Phaser.Physics.Arcade.Image[];
  rewardPoint: MapPoint;
  foundCount: number;
  completed: boolean;
}

interface MemoryObelisk {
  id: string;
  sprite: Phaser.Physics.Arcade.Image;
  triggered: boolean;
}

const BASE_WORLD_WIDTH = 1280;
const BASE_WORLD_HEIGHT = 720;
const MAP_SCALE = 4;
const LEGACY_MAP_SCALE = 2;
const LEGACY_COORD_SCALE = MAP_SCALE / LEGACY_MAP_SCALE;
const ANCIENT_TREE_VISUAL_SCALE = 1.72;
const TREE_CLUSTER_VISUAL_SCALE = 1.58;

/**
 * GameMapManager 管理固定的“环形放射状”世界结构。
 *
 * 设计目标：
 * 1. MainScene 不需要知道每个区域怎么画、资源刷在哪里、季节锁如何呈现。
 * 2. 地图对象不直接修改角色属性，只返回交互结果，由 MainScene 决定如何给背包/状态加值。
 * 3. 黑猫足迹与方尖碑是叙事线索，统一由地图层维护，避免散落在角色或 UI 逻辑里。
 */
export class GameMapManager {
  readonly worldWidth = BASE_WORLD_WIDTH * MAP_SCALE;
  readonly worldHeight = BASE_WORLD_HEIGHT * MAP_SCALE;

  private readonly scene: Phaser.Scene;
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;
  private currentSeason: MapSeason = "Spring";
  private hasScaledMapData = false;
  private activeZones: ZoneDefinition[] = [];
  private readonly mapObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly supplyCaches: SupplyCache[] = [];
  private readonly footprintTrails: FootprintTrail[] = [];
  private readonly obelisks: MemoryObelisk[] = [];
  private readonly seasonalLocks: SeasonalAccessLock[] = [];
  private readonly zones: ZoneDefinition[] = [
    {
      id: "hub",
      displayName: "核心营地",
      description: "地图中心，最安全。包含初始帐篷和永久篝火点。",
      tileTexture: "zone_hub_floor",
      center: { x: 640, y: 360 },
      radius: 125,
      resources: ["tent", "permanent_campfire"],
      appleSpawnPoints: [
        { x: 560, y: 318 },
        { x: 724, y: 338 },
        { x: 612, y: 430 },
        { x: 704, y: 420 },
      ],
      enemySpawnPoints: [],
    },
    {
      id: "forest",
      displayName: "常青森林",
      description: "包围营地，产出大量木材和浆果。夏季易发生林火，适合布布处理。",
      tileTexture: "zone_forest_floor",
      center: { x: 640, y: 360 },
      radius: 295,
      resources: ["wood", "berries", "forest_fire"],
      appleSpawnPoints: [
        { x: 470, y: 150 },
        { x: 690, y: 250 },
        { x: 310, y: 470 },
        { x: 760, y: 585 },
        { x: 940, y: 130 },
        { x: 430, y: 650 },
        { x: 210, y: 310 },
        { x: 600, y: 120 },
        { x: 870, y: 600 },
        { x: 1040, y: 420 },
        { x: 1090, y: 250 },
        { x: 260, y: 610 },
      ],
      enemySpawnPoints: [
        { x: 220, y: 140 },
        { x: 1040, y: 160 },
        { x: 360, y: 600 },
        { x: 1120, y: 430 },
      ],
    },
    {
      id: "mountains",
      displayName: "极寒矿山",
      description: "北部高海拔区域，低温。产出冰矿和铁矿，冬季只有一二能看到隐藏路径。",
      tileTexture: "zone_mountain_floor",
      center: { x: 640, y: 92 },
      radius: 230,
      resources: ["ice_ore", "iron_ore", "hidden_snow_path"],
      appleSpawnPoints: [
        { x: 1020, y: 230 },
        { x: 170, y: 160 },
        { x: 500, y: 125 },
        { x: 780, y: 150 },
        { x: 1120, y: 260 },
      ],
      enemySpawnPoints: [
        { x: 90, y: 90 },
        { x: 1190, y: 92 },
        { x: 500, y: 80 },
        { x: 790, y: 80 },
      ],
    },
    {
      id: "coast",
      displayName: "荒芜海岸",
      description: "南部与外围湿冷区域，产出沉船残骸和鱼群。",
      tileTexture: "zone_coast_floor",
      center: { x: 640, y: 660 },
      radius: 260,
      resources: ["shipwreck_debris", "fish"],
      appleSpawnPoints: [
        { x: 1130, y: 620 },
        { x: 170, y: 560 },
        { x: 1220, y: 360 },
        { x: 420, y: 610 },
        { x: 640, y: 665 },
        { x: 870, y: 640 },
        { x: 1080, y: 520 },
      ],
      enemySpawnPoints: [
        { x: 100, y: 632 },
        { x: 1180, y: 620 },
        { x: 600, y: 650 },
        { x: 960, y: 675 },
      ],
    },
  ];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * 创建完整地图。
   *
   * 返回值提供给 MainScene：
   * - walls：所有不可穿越碰撞体，包括地图边界、石柱、木桩和当前季节锁。
   * - appleSpawnPoints / enemySpawnPoints：让现有拾荒和夜晚敌人逻辑继续复用。
   */
  createWorld(initialSeason: MapSeason = "Spring"): MapCreationResult {
    this.clearWorld();
    this.currentSeason = initialSeason;
    this.scaleMapDataOnce();
    this.activeZones = this.zones;
    this.ensureTextures();
    this.scene.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.scene.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.collisionGroup = this.scene.physics.add.staticGroup();

    this.drawRadialZones();
    this.createStaticBoundaries();
    this.createHubLandmarks();
    this.createSeaDockEntrance();
    this.createSeasonalLocks();
    this.createSupplyCaches();
    this.createFootprintTrails();
    this.createMemoryObelisks();
    this.setSeason(initialSeason);

    return {
      walls: this.collisionGroup,
      appleSpawnPoints: this.getAppleSpawnPoints(),
      enemySpawnPoints: this.getEnemySpawnPoints(),
      zones: [...this.activeZones],
    };
  }

  createSeaWorld(): MapCreationResult {
    this.clearWorld();
    this.ensureTextures();
    this.scene.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.scene.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.collisionGroup = this.scene.physics.add.staticGroup();

    this.activeZones = [
      {
        id: "sea",
        displayName: "无边海面",
        description: "第 41 天后漂流的海上阶段，资源来自漂木、礁石和补给残骸。",
        tileTexture: "zone_sea_floor",
        center: { x: this.worldWidth / 2, y: this.worldHeight / 2 },
        radius: this.scaleLegacyLength(980),
        resources: ["driftwood", "reef_stone", "sea_grass"],
        appleSpawnPoints: [
          { x: 720, y: 520 },
          { x: 1040, y: 440 },
          { x: 1460, y: 560 },
          { x: 1740, y: 790 },
          { x: 1320, y: 980 },
          { x: 880, y: 900 },
        ].map((point) => this.scaleLegacyPoint(point)),
        enemySpawnPoints: [
          { x: 230, y: 190 },
          { x: 2260, y: 220 },
          { x: 240, y: 1180 },
          { x: 2300, y: 1200 },
        ].map((point) => this.scaleLegacyPoint(point)),
      },
    ];

    this.drawSeaWorld();
    this.createSeaBoundaries();
    this.createSupplyCachesFrom([
      { id: "sea-cache-west", zone: "sea", x: this.scaleLegacyLength(820), y: this.scaleLegacyLength(580), apples: 2, wood: 3 },
      { id: "sea-cache-east", zone: "sea", x: this.scaleLegacyLength(1640), y: this.scaleLegacyLength(880), apples: 1, wood: 4 },
    ]);

    return {
      walls: this.collisionGroup,
      appleSpawnPoints: this.getAppleSpawnPoints(),
      enemySpawnPoints: this.getEnemySpawnPoints(),
      zones: [...this.activeZones],
    };
  }

  createIslandWorld(): MapCreationResult {
    this.clearWorld();
    this.ensureTextures();
    this.scene.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.scene.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.collisionGroup = this.scene.physics.add.staticGroup();

    this.activeZones = [
      {
        id: "island",
        displayName: "返航小岛",
        description: "第 45 天登陆的孤岛，藏着返航线索和现实闪回。",
        tileTexture: "zone_island_floor",
        center: { x: this.worldWidth / 2, y: this.worldHeight / 2 },
        radius: this.scaleLegacyLength(760),
        resources: ["coconut_wood", "shore_stone", "dry_grass", "memory"],
        appleSpawnPoints: [
          { x: 840, y: 520 },
          { x: 1160, y: 410 },
          { x: 1460, y: 520 },
          { x: 1660, y: 820 },
          { x: 1280, y: 1030 },
          { x: 930, y: 900 },
        ].map((point) => this.scaleLegacyPoint(point)),
        enemySpawnPoints: [
          { x: 380, y: 240 },
          { x: 2180, y: 280 },
          { x: 460, y: 1160 },
          { x: 2100, y: 1110 },
        ].map((point) => this.scaleLegacyPoint(point)),
      },
    ];

    this.drawIslandWorld();
    this.createIslandBoundaries();
    this.createSupplyCachesFrom([
      { id: "island-cache-north", zone: "island", x: this.scaleLegacyLength(1060), y: this.scaleLegacyLength(540), apples: 2, wood: 2 },
      { id: "island-cache-south", zone: "island", x: this.scaleLegacyLength(1480), y: this.scaleLegacyLength(930), apples: 1, wood: 3 },
    ]);
    this.createMemoryObelisksAt([
      this.scaleLegacyPoint({ x: 890, y: 640 }),
      this.scaleLegacyPoint({ x: 1660, y: 720 }),
    ]);

    return {
      walls: this.collisionGroup,
      appleSpawnPoints: this.getAppleSpawnPoints(),
      enemySpawnPoints: this.getEnemySpawnPoints(),
      zones: [...this.activeZones],
    };
  }

  setSeason(season: MapSeason): void {
    this.currentSeason = season;

    for (const lock of this.seasonalLocks) {
      const shouldBlock = lock.season === season && !lock.resolved;

      if (lock.body) {
        lock.body.setVisible(shouldBlock);

        if (shouldBlock) {
          lock.body.enableBody(false, lock.body.x, lock.body.y, true, true);
          lock.body.setAlpha(0.92);
        } else {
          lock.body.disableBody(true, true);
        }
      }
    }
  }

  getSeason(): MapSeason {
    return this.currentSeason;
  }

  getZones(): ZoneDefinition[] {
    return [...this.activeZones];
  }

  getHubTentPoint(): MapPoint {
    return this.scalePoint({ x: 590, y: 354 });
  }

  getSeaDockPoint(): MapPoint {
    return this.scalePoint({ x: 640, y: 648 });
  }

  getAppleSpawnPoints(): MapPoint[] {
    return this.activeZones.flatMap((zone) => zone.appleSpawnPoints);
  }

  getEnemySpawnPoints(): MapPoint[] {
    return this.activeZones.flatMap((zone) => zone.enemySpawnPoints);
  }

  getInteractionHint(bearId: MapBearId, position: MapPoint, radius = 72): string | null {
    const lock = this.seasonalLocks.find((candidate) => {
      if (candidate.season !== this.currentSeason || candidate.resolved) {
        return false;
      }

      return this.distanceToRectangle(position, candidate.bounds) <= radius;
    });

    if (lock) {
      const requiredName = lock.requiredBear === "bubu" ? "布布" : "一二";
      return lock.requiredBear === bearId ? `E 处理${lock.label}` : `需要${requiredName}处理${lock.label}`;
    }

    const cache = this.supplyCaches.find((candidate) => {
      return !candidate.opened && candidate.sprite.active && Phaser.Math.Distance.Between(position.x, position.y, candidate.sprite.x, candidate.sprite.y) <= radius;
    });

    if (cache) {
      return "E 打开伪装补给箱";
    }

    const footprint = this.footprintTrails.some((trail) => {
      return !trail.completed && trail.footprints.some((candidate) => {
        return candidate.active && Phaser.Math.Distance.Between(position.x, position.y, candidate.x, candidate.y) <= radius;
      });
    });

    return footprint ? "E 调查黑猫足迹" : null;
  }

  /**
   * 处理地图交互。
   *
   * MainScene 可以在按 E 时先调用这里。如果返回 null，说明附近没有地图级交互物，
   * 再继续处理苹果拾取等普通玩法。
   */
  tryInteract(bearId: MapBearId, position: MapPoint, radius = 72): MapInteractionResult | null {
    const lockResult = this.tryInteractSeasonalLock(bearId, position, radius);

    if (lockResult) {
      return lockResult;
    }

    const cacheResult = this.tryOpenSupplyCache(position, radius);

    if (cacheResult) {
      return cacheResult;
    }

    return this.tryFollowBlackCatFootprint(position, radius);
  }

  /**
   * 每帧检查需要“双熊同时到达”的地图条件。
   *
   * 目前用于记忆方尖碑。以后可扩展成双人机关、压力板、合体门等。
   */
  updateDualBearState(bears: Record<MapBearId, MapBearAdapter>): MapRuntimeEvent[] {
    const events: MapRuntimeEvent[] = [];

    for (const obelisk of this.obelisks) {
      if (obelisk.triggered) {
        continue;
      }

      const yierDistance = Phaser.Math.Distance.Between(
        bears.yier.sprite.x,
        bears.yier.sprite.y,
        obelisk.sprite.x,
        obelisk.sprite.y,
      );
      const bubuDistance = Phaser.Math.Distance.Between(
        bears.bubu.sprite.x,
        bears.bubu.sprite.y,
        obelisk.sprite.x,
        obelisk.sprite.y,
      );

      if (yierDistance <= 70 && bubuDistance <= 70) {
        obelisk.triggered = true;
        obelisk.sprite.setTint(0xf7d58a);
        this.scene.tweens.add({
          targets: obelisk.sprite,
          scale: 1.2,
          yoyo: true,
          duration: 260,
          ease: "Sine.easeInOut",
        });
        events.push({
          type: "flashback",
          obeliskId: obelisk.id,
          message: "两只熊同时触碰记忆方尖碑，现实闪回了一瞬。",
        });
      }
    }

    return events;
  }

  /**
   * 外部可用这个函数判断当前位置属于哪个区域，用于温度、音效、刷怪权重等系统。
   */
  getZoneAt(position: MapPoint): ZoneDefinition {
    const directZone = this.activeZones
      .filter((zone) => zone.id !== "forest")
      .find((zone) => Phaser.Math.Distance.Between(position.x, position.y, zone.center.x, zone.center.y) <= zone.radius);

    return directZone ?? this.activeZones.find((zone) => zone.id === "forest") ?? this.activeZones[0];
  }

  destroyWorld(): void {
    this.clearWorld();
  }

  private scaleMapDataOnce(): void {
    if (this.hasScaledMapData) {
      return;
    }

    for (const zone of this.zones) {
      zone.center = this.scalePoint(zone.center);
      zone.radius = this.scaleLength(zone.radius);
      zone.appleSpawnPoints = zone.appleSpawnPoints.map((point) => this.scalePoint(point));
      zone.enemySpawnPoints = zone.enemySpawnPoints.map((point) => this.scalePoint(point));
    }

    this.hasScaledMapData = true;
  }

  private clearWorld(): void {
    for (const object of this.mapObjects.splice(0)) {
      if (object.active || object.scene) {
        object.destroy();
      }
    }

    if (this.collisionGroup) {
      this.collisionGroup.destroy(true);
    }

    this.supplyCaches.length = 0;
    this.footprintTrails.length = 0;
    this.obelisks.length = 0;
    this.seasonalLocks.length = 0;
    this.activeZones = [];
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.mapObjects.push(object);
    return object;
  }

  private scaleLength(value: number): number {
    return value * MAP_SCALE;
  }

  private scaleLegacyLength(value: number): number {
    return Math.round(value * LEGACY_COORD_SCALE);
  }

  private scalePoint(point: MapPoint): MapPoint {
    return {
      x: this.scaleLength(point.x),
      y: this.scaleLength(point.y),
    };
  }

  private scaleLegacyPoint(point: MapPoint): MapPoint {
    return {
      x: this.scaleLegacyLength(point.x),
      y: this.scaleLegacyLength(point.y),
    };
  }

  private scaleRectangle(x: number, y: number, width: number, height: number): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.scaleLength(x),
      this.scaleLength(y),
      this.scaleLength(width),
      this.scaleLength(height),
    );
  }

  private drawRadialZones(): void {
    this.track(this.scene.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x121c15).setDepth(-50));
    this.track(this.scene.add.tileSprite(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, "zone_forest_floor").setDepth(-49));
    this.track(
      this.scene.add
        .ellipse(this.scaleLength(640), this.scaleLength(92), this.scaleLength(880), this.scaleLength(290), 0x344154, 0.72)
        .setDepth(-48),
    );
    this.track(
      this.scene.add
        .ellipse(this.scaleLength(640), this.scaleLength(664), this.scaleLength(1120), this.scaleLength(250), 0x284858, 0.78)
        .setDepth(-48),
    );
    this.track(this.scene.add.circle(this.scaleLength(640), this.scaleLength(360), this.scaleLength(140), 0x46321f, 0.9).setDepth(-47));
    this.track(this.scene.add.circle(this.scaleLength(640), this.scaleLength(360), this.scaleLength(118), 0x5a4328, 0.9).setDepth(-46));

    this.createSoftZoneTransitions();

    for (const tree of [
      { x: 90, y: 120, s: 1.2 },
      { x: 214, y: 612, s: 1.05 },
      { x: 356, y: 88, s: 0.94 },
      { x: 492, y: 260, s: 0.92 },
      { x: 506, y: 672, s: 0.82 },
      { x: 560, y: 480, s: 0.88 },
      { x: 710, y: 92, s: 1.1 },
      { x: 790, y: 260, s: 0.96 },
      { x: 845, y: 468, s: 0.9 },
      { x: 930, y: 650, s: 1.18 },
      { x: 1100, y: 120, s: 1.02 },
      { x: 1220, y: 558, s: 1.14 },
    ]) {
      this.track(
        this.scene.add
          .image(this.scaleLength(tree.x), this.scaleLength(tree.y), "ancient_tree")
          .setScale(tree.s * ANCIENT_TREE_VISUAL_SCALE)
          .setDepth(-34),
      );
    }

    for (const patch of [
      { x: 270, y: 340 },
      { x: 420, y: 590 },
      { x: 650, y: 180 },
      { x: 604, y: 426 },
      { x: 860, y: 510 },
      { x: 930, y: 318 },
      { x: 1080, y: 270 },
      { x: 1160, y: 650 },
    ]) {
      this.track(this.scene.add.image(this.scaleLength(patch.x), this.scaleLength(patch.y), "fern_patch").setDepth(-32));
    }

    this.createEcologyDetails();
    this.track(this.scene.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x07120c, 0.16).setDepth(-31));
  }

  private createEcologyDetails(): void {
    for (const tree of [
      { x: 150, y: 330, s: 0.72 },
      { x: 236, y: 474, s: 0.66 },
      { x: 372, y: 370, s: 0.58 },
      { x: 804, y: 385, s: 0.62 },
      { x: 980, y: 306, s: 0.68 },
      { x: 1118, y: 508, s: 0.7 },
      { x: 1038, y: 174, s: 0.58 },
      { x: 292, y: 180, s: 0.64 },
      { x: 118, y: 254, s: 0.56 },
      { x: 246, y: 270, s: 0.7 },
      { x: 428, y: 222, s: 0.62 },
      { x: 836, y: 220, s: 0.64 },
      { x: 1010, y: 372, s: 0.76 },
      { x: 1160, y: 425, s: 0.6 },
      { x: 258, y: 560, s: 0.78 },
      { x: 1010, y: 558, s: 0.74 },
    ]) {
      this.track(
        this.scene.add
          .image(this.scaleLength(tree.x), this.scaleLength(tree.y), "small_tree_cluster")
          .setScale(tree.s * TREE_CLUSTER_VISUAL_SCALE)
          .setDepth(-33),
      );
    }

    for (const patch of [
      { x: 180, y: 518, key: "flower_patch" },
      { x: 330, y: 270, key: "shrub_patch" },
      { x: 460, y: 520, key: "flower_patch" },
      { x: 760, y: 510, key: "shrub_patch" },
      { x: 940, y: 470, key: "flower_patch" },
      { x: 1120, y: 346, key: "shrub_patch" },
      { x: 560, y: 610, key: "dry_grass_patch" },
      { x: 720, y: 636, key: "dry_grass_patch" },
      { x: 1030, y: 620, key: "dry_grass_patch" },
      { x: 598, y: 286, key: "flower_patch" },
      { x: 702, y: 292, key: "flower_patch" },
      { x: 548, y: 438, key: "shrub_patch" },
      { x: 744, y: 446, key: "shrub_patch" },
      { x: 300, y: 430, key: "forest_leaf_scatter" },
      { x: 486, y: 318, key: "forest_leaf_scatter" },
      { x: 832, y: 346, key: "forest_leaf_scatter" },
      { x: 1048, y: 438, key: "forest_leaf_scatter" },
    ]) {
      this.track(this.scene.add.image(this.scaleLength(patch.x), this.scaleLength(patch.y), patch.key).setDepth(-32));
    }

    for (const stones of [
      { x: 214, y: 104, s: 0.86 },
      { x: 420, y: 92, s: 0.72 },
      { x: 824, y: 110, s: 0.8 },
      { x: 1028, y: 205, s: 0.78 },
      { x: 1130, y: 116, s: 0.66 },
      { x: 146, y: 206, s: 0.62 },
      { x: 568, y: 94, s: 0.74 },
      { x: 694, y: 154, s: 0.58 },
      { x: 914, y: 78, s: 0.7 },
    ]) {
      this.track(this.scene.add.image(this.scaleLength(stones.x), this.scaleLength(stones.y), "stone_cluster").setScale(stones.s).setDepth(-32));
    }

    for (const fog of [
      { x: 274, y: 92, s: 0.8 },
      { x: 506, y: 150, s: 0.72 },
      { x: 752, y: 88, s: 0.86 },
      { x: 1014, y: 170, s: 0.78 },
    ]) {
      this.track(this.scene.add.image(this.scaleLength(fog.x), this.scaleLength(fog.y), "mountain_fog_patch").setScale(fog.s).setDepth(-31));
    }

    for (const reed of [
      { x: 122, y: 612, s: 0.74 },
      { x: 328, y: 656, s: 0.66 },
      { x: 612, y: 676, s: 0.78 },
      { x: 858, y: 662, s: 0.7 },
      { x: 1098, y: 618, s: 0.76 },
      { x: 1190, y: 680, s: 0.62 },
    ]) {
      this.track(this.scene.add.image(this.scaleLength(reed.x), this.scaleLength(reed.y), "coast_reed_patch").setScale(reed.s).setDepth(-31));
    }

    for (const animal of [
      { x: 442, y: 250, s: 0.72, flip: false },
      { x: 924, y: 390, s: 0.64, flip: true },
      { x: 1090, y: 574, s: 0.58, flip: false },
      { x: 260, y: 618, s: 0.56, flip: true },
    ]) {
      this.track(
        this.scene.add
          .image(this.scaleLength(animal.x), this.scaleLength(animal.y), "distant_bird")
          .setScale(animal.s)
          .setFlipX(animal.flip)
          .setAlpha(0.78)
          .setDepth(-30),
      );
    }
  }

  private createSoftZoneTransitions(): void {
    for (const ring of [
      { x: 640, y: 360, w: 430, h: 290, color: 0x39572c, alpha: 0.18, depth: -45 },
      { x: 640, y: 360, w: 690, h: 470, color: 0x234022, alpha: 0.2, depth: -46 },
      { x: 640, y: 128, w: 1020, h: 250, color: 0xb8d7e7, alpha: 0.08, depth: -44 },
      { x: 640, y: 640, w: 1180, h: 210, color: 0x9fbf8c, alpha: 0.09, depth: -44 },
    ]) {
      this.track(
        this.scene.add
          .ellipse(this.scaleLength(ring.x), this.scaleLength(ring.y), this.scaleLength(ring.w), this.scaleLength(ring.h), ring.color, ring.alpha)
          .setDepth(ring.depth),
      );
    }

    for (const scatter of [
      { x: 396, y: 226, key: "forest_leaf_scatter", s: 0.86 },
      { x: 526, y: 544, key: "forest_leaf_scatter", s: 0.72 },
      { x: 760, y: 236, key: "forest_leaf_scatter", s: 0.76 },
      { x: 970, y: 522, key: "forest_leaf_scatter", s: 0.82 },
      { x: 446, y: 150, key: "mountain_fog_patch", s: 0.66 },
      { x: 804, y: 158, key: "mountain_fog_patch", s: 0.72 },
      { x: 454, y: 640, key: "coast_reed_patch", s: 0.62 },
      { x: 930, y: 630, key: "coast_reed_patch", s: 0.68 },
    ]) {
      this.track(
        this.scene.add
          .image(this.scaleLength(scatter.x), this.scaleLength(scatter.y), scatter.key)
          .setScale(scatter.s)
          .setAlpha(0.62)
          .setDepth(-35),
      );
    }
  }

  private createStaticBoundaries(): void {
    this.addCollisionWall(this.worldWidth / 2, this.scaleLength(18), this.worldWidth, this.scaleLength(36), "moss_log_wall");
    this.addCollisionWall(this.worldWidth / 2, this.worldHeight - this.scaleLength(18), this.worldWidth, this.scaleLength(36), "moss_log_wall");
    this.addCollisionWall(this.scaleLength(18), this.worldHeight / 2, this.scaleLength(36), this.worldHeight, "stone_pillar_wall");
    this.addCollisionWall(this.worldWidth - this.scaleLength(18), this.worldHeight / 2, this.scaleLength(36), this.worldHeight, "stone_pillar_wall");

  }

  private addCollisionWall(x: number, y: number, width: number, height: number, texture: string): Phaser.Physics.Arcade.Image {
    const wall = this.collisionGroup.create(x, y, texture) as Phaser.Physics.Arcade.Image;
    wall.setDisplaySize(width, height);
    wall.refreshBody();
    return wall;
  }

  private createHubLandmarks(): void {
    this.track(
      this.scene.add
        .image(this.scaleLength(590), this.scaleLength(354), "map_tent")
        .setDisplaySize(this.scaleLength(104), this.scaleLength(76))
        .setDepth(2),
    );
    this.track(this.scene.add.image(this.scaleLength(682), this.scaleLength(374), "map_campfire").setDepth(-4));
  }

  private createSeaDockEntrance(): void {
    const dock = this.getSeaDockPoint();
    this.track(
      this.scene.add
        .image(dock.x, dock.y, "sea_dock_entrance")
        .setDisplaySize(this.scaleLength(150), this.scaleLength(92))
        .setDepth(2),
    );
    this.track(
      this.scene.add
        .ellipse(dock.x, dock.y + this.scaleLength(24), this.scaleLength(168), this.scaleLength(42), 0x132b31, 0.38)
        .setDepth(-2),
    );
  }

  private drawSeaWorld(): void {
    this.track(this.scene.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x0b2637).setDepth(-50));
    this.track(this.scene.add.tileSprite(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, "zone_sea_floor").setDepth(-49));

    for (let index = 0; index < 7; index += 1) {
      const y = this.scaleLegacyLength(300 + index * 130);
      this.track(
        this.scene.add
          .rectangle(this.worldWidth / 2, y, this.worldWidth, this.scaleLegacyLength(8), index % 2 === 0 ? 0x184862 : 0x11394f, 0.28)
          .setDepth(-42),
      );
    }

    this.track(
      this.scene.add
        .rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.scaleLegacyLength(360), 0x0f3148, 0.24)
        .setDepth(-41),
    );

    for (const point of [
      { x: 660, y: 370 },
      { x: 1860, y: 430 },
      { x: 490, y: 1030 },
      { x: 2030, y: 1050 },
      { x: 1270, y: 1120 },
    ]) {
      const scaledPoint = this.scaleLegacyPoint(point);
      this.track(this.scene.add.image(scaledPoint.x, scaledPoint.y, "floating_debris").setDepth(-28));
    }
  }

  private createSeaBoundaries(): void {
    this.addCollisionWall(this.worldWidth / 2, this.scaleLength(18), this.worldWidth, this.scaleLength(36), "moss_log_wall");
    this.addCollisionWall(this.worldWidth / 2, this.worldHeight - this.scaleLength(18), this.worldWidth, this.scaleLength(36), "moss_log_wall");
    this.addCollisionWall(this.scaleLength(18), this.worldHeight / 2, this.scaleLength(36), this.worldHeight, "stone_pillar_wall");
    this.addCollisionWall(this.worldWidth - this.scaleLength(18), this.worldHeight / 2, this.scaleLength(36), this.worldHeight, "stone_pillar_wall");
  }

  private drawIslandWorld(): void {
    this.track(this.scene.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x12344a).setDepth(-50));
    this.track(this.scene.add.tileSprite(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, "zone_sea_floor").setDepth(-49));
    this.track(
      this.scene.add
        .ellipse(this.worldWidth / 2, this.worldHeight / 2, this.scaleLegacyLength(1550), this.scaleLegacyLength(980), 0x756745, 0.96)
        .setDepth(-42),
    );
    this.track(
      this.scene.add
        .ellipse(this.worldWidth / 2, this.worldHeight / 2, this.scaleLegacyLength(1260), this.scaleLegacyLength(760), 0x2f6e43, 0.9)
        .setDepth(-41),
    );
    this.track(
      this.scene.add
        .tileSprite(this.worldWidth / 2, this.worldHeight / 2, this.scaleLegacyLength(1120), this.scaleLegacyLength(680), "zone_island_floor")
        .setDepth(-40),
    );

    for (const tree of [
      { x: 750, y: 520, s: 0.88 },
      { x: 980, y: 920, s: 0.95 },
      { x: 1500, y: 470, s: 0.9 },
      { x: 1740, y: 900, s: 0.84 },
    ]) {
      const scaledPoint = this.scaleLegacyPoint(tree);
      this.track(
        this.scene.add
          .image(scaledPoint.x, scaledPoint.y, "ancient_tree")
          .setScale(tree.s * ANCIENT_TREE_VISUAL_SCALE)
          .setDepth(-30),
      );
    }
  }

  private createIslandBoundaries(): void {
    this.addCollisionWall(this.worldWidth / 2, this.scaleLength(18), this.worldWidth, this.scaleLength(36), "moss_log_wall");
    this.addCollisionWall(this.worldWidth / 2, this.worldHeight - this.scaleLength(18), this.worldWidth, this.scaleLength(36), "moss_log_wall");
    this.addCollisionWall(this.scaleLength(18), this.worldHeight / 2, this.scaleLength(36), this.worldHeight, "stone_pillar_wall");
    this.addCollisionWall(this.worldWidth - this.scaleLength(18), this.worldHeight / 2, this.scaleLength(36), this.worldHeight, "stone_pillar_wall");
  }

  private createSeasonalLocks(): void {
    this.seasonalLocks.push(
      {
        id: "spring-river-coast",
        season: "Spring",
        label: "湍急的河流",
        kind: "river",
        requiredBear: "bubu",
        bounds: this.scaleRectangle(412, 494, 455, 34),
        message: "春季河水太急，需要布布造桥才能去海岸。",
        resolved: false,
      },
      {
        id: "summer-bramble-east",
        season: "Summer",
        label: "灼热荆棘区",
        kind: "bramble",
        requiredBear: "bubu",
        bounds: this.scaleRectangle(950, 246, 44, 245),
        message: "夏季荆棘滚烫，一二会受伤，需要布布厚皮踩开。",
        resolved: false,
      },
      {
        id: "winter-snow-mountain",
        season: "Winter",
        label: "雪封山径",
        kind: "snowdrift",
        requiredBear: "yier",
        bounds: this.scaleRectangle(520, 128, 260, 36),
        message: "冬季雪封山，只有一二能看见隐藏路径。",
        resolved: false,
      },
    );

    for (const lock of this.seasonalLocks) {
      const texture = lock.kind === "river" ? "season_river_lock" : lock.kind === "bramble" ? "season_bramble_lock" : "season_snow_lock";
      const body = this.track(this.scene.physics.add.staticImage(lock.bounds.centerX, lock.bounds.centerY, texture));
      body.setDisplaySize(lock.bounds.width, lock.bounds.height);
      body.refreshBody();
      body.setData("seasonLockId", lock.id);
      body.setDepth(3);
      lock.body = body;
    }
  }

  private createSupplyCaches(): void {
    this.createSupplyCachesFrom(
      [
        { id: "forest-cache", zone: "forest" as const, x: this.scaleLength(292), y: this.scaleLength(334), apples: 2, wood: 4 },
        { id: "coast-cache", zone: "coast" as const, x: this.scaleLength(1034), y: this.scaleLength(612), apples: 1, wood: 2 },
        { id: "mountain-cache", zone: "mountains" as const, x: this.scaleLength(932), y: this.scaleLength(116), apples: 1, wood: 1 },
      ],
    );
  }

  private createSupplyCachesFrom(caches: Array<{ id: string; zone: MapZoneId; x: number; y: number; apples: number; wood: number }>): void {
    for (const cache of caches) {
      const sprite = this.track(this.scene.physics.add.staticImage(cache.x, cache.y, "supply_cache"));
      sprite.setDepth(4);
      this.supplyCaches.push({
        id: cache.id,
        zone: cache.zone,
        sprite,
        apples: cache.apples,
        wood: cache.wood,
        opened: false,
      });
    }
  }

  private createFootprintTrails(): void {
    const trailDefinitions = [
      {
        id: "snow-cat-trail",
        zone: "mountains" as const,
        variants: [
          {
            points: [
              { x: 865, y: 160 },
              { x: 910, y: 142 },
              { x: 954, y: 122 },
            ],
            rewardPoint: { x: 995, y: 112 },
          },
          {
            points: [
              { x: 270, y: 152 },
              { x: 226, y: 132 },
              { x: 184, y: 112 },
            ],
            rewardPoint: { x: 150, y: 98 },
          },
        ],
      },
      {
        id: "sand-cat-trail",
        zone: "coast" as const,
        variants: [
          {
            points: [
              { x: 188, y: 582 },
              { x: 224, y: 604 },
              { x: 262, y: 626 },
            ],
            rewardPoint: { x: 306, y: 648 },
          },
          {
            points: [
              { x: 1086, y: 582 },
              { x: 1126, y: 604 },
              { x: 1166, y: 626 },
            ],
            rewardPoint: { x: 1204, y: 646 },
          },
        ],
      },
    ];

    for (const definition of trailDefinitions) {
      // 每次创建地图时从候选路线里抽一条，让黑猫足迹像是“刚刚经过”而不是固定装饰。
      const selectedVariant = Phaser.Utils.Array.GetRandom(definition.variants);
      const footprints = selectedVariant.points.map((point, index) => {
        const scaledPoint = this.scalePoint(point);
        const footprint = this.track(this.scene.physics.add.staticImage(scaledPoint.x, scaledPoint.y, "black_cat_footprint"));
        footprint.setDepth(5);
        footprint.setAlpha(0.72);
        footprint.setAngle(index % 2 === 0 ? -16 : 12);
        return footprint;
      });

      this.footprintTrails.push({
        id: definition.id,
        zone: definition.zone,
        footprints,
        rewardPoint: this.scalePoint(selectedVariant.rewardPoint),
        foundCount: 0,
        completed: false,
      });
    }
  }

  private createMemoryObelisks(): void {
    this.createMemoryObelisksAt([
      this.scalePoint({ x: 86, y: 82 }),
      this.scalePoint({ x: 1196, y: 84 }),
      this.scalePoint({ x: 90, y: 636 }),
      this.scalePoint({ x: 1192, y: 636 }),
    ]);
  }

  private createMemoryObelisksAt(points: MapPoint[]): void {
    for (const [index, point] of points.entries()) {
      const sprite = this.track(this.scene.physics.add.staticImage(point.x, point.y, "memory_obelisk"));
      sprite.setDepth(4);
      this.obelisks.push({
        id: `memory-obelisk-${index + 1}`,
        sprite,
        triggered: false,
      });
    }
  }

  private tryInteractSeasonalLock(bearId: MapBearId, position: MapPoint, radius: number): MapInteractionResult | null {
    const lock = this.seasonalLocks.find((candidate) => {
      if (candidate.season !== this.currentSeason || candidate.resolved) {
        return false;
      }

      return this.distanceToRectangle(position, candidate.bounds) <= radius;
    });

    if (!lock) {
      return null;
    }

    if (lock.requiredBear !== bearId) {
      return {
        type: "access-blocked",
        message: lock.message,
      };
    }

    lock.resolved = true;
    lock.body?.disableBody(true, true);

    return {
      type: "access-unlocked",
      message: `${lock.label}被${bearId === "bubu" ? "布布" : "一二"}处理掉了。`,
    };
  }

  private tryOpenSupplyCache(position: MapPoint, radius: number): MapInteractionResult | null {
    const cache = this.supplyCaches.find((candidate) => {
      if (candidate.opened || !candidate.sprite.active) {
        return false;
      }

      return Phaser.Math.Distance.Between(position.x, position.y, candidate.sprite.x, candidate.sprite.y) <= radius;
    });

    if (!cache) {
      return null;
    }

    cache.opened = true;
    cache.sprite.disableBody(true, true);

    return {
      type: "supply-cache",
      apples: cache.apples,
      wood: cache.wood,
      message: `打开伪装补给箱：苹果 +${cache.apples}，木材 +${cache.wood}。`,
    };
  }

  private tryFollowBlackCatFootprint(position: MapPoint, radius: number): MapInteractionResult | null {
    for (const trail of this.footprintTrails) {
      if (trail.completed) {
        continue;
      }

      const footprint = trail.footprints.find((candidate) => {
        return candidate.active && Phaser.Math.Distance.Between(position.x, position.y, candidate.x, candidate.y) <= radius;
      });

      if (!footprint) {
        continue;
      }

      footprint.disableBody(true, true);
      trail.foundCount += 1;

      if (trail.foundCount >= trail.footprints.length) {
        trail.completed = true;
        const treasure = this.track(this.scene.physics.add.staticImage(trail.rewardPoint.x, trail.rewardPoint.y, "supply_cache"));
        treasure.setDepth(4);
        this.supplyCaches.push({
          id: `${trail.id}-reward`,
          zone: trail.zone,
          sprite: treasure,
          apples: 2,
          wood: 1,
          opened: false,
        });

        return {
          type: "black-cat-footprint",
          message: "黑猫足迹消失了，附近出现了一个隐藏补给箱。",
        };
      }

      return {
        type: "black-cat-footprint",
        message: "黑猫足迹仍然很新，继续沿着纯黑的痕迹寻找。",
      };
    }

    return null;
  }

  private distanceToRectangle(point: MapPoint, rectangle: Phaser.Geom.Rectangle): number {
    const clampedX = Phaser.Math.Clamp(point.x, rectangle.left, rectangle.right);
    const clampedY = Phaser.Math.Clamp(point.y, rectangle.top, rectangle.bottom);
    return Phaser.Math.Distance.Between(point.x, point.y, clampedX, clampedY);
  }

  private ensureTextures(): void {
    const graphics = this.scene.add.graphics().setVisible(false);

    this.generateTextureIfMissing(graphics, "zone_forest_floor", 128, 128, (g) => {
      g.fillStyle(0x1a2b1a, 1);
      g.fillRect(0, 0, 128, 128);
      g.fillStyle(0x213820, 1);
      g.fillRect(0, 0, 128, 18);
      g.fillRect(0, 72, 128, 14);
      g.fillStyle(0x426c36, 0.75);
      g.fillRect(18, 56, 8, 4);
      g.fillRect(70, 18, 10, 5);
      g.fillRect(92, 96, 12, 5);
    });

    this.generateTextureIfMissing(graphics, "zone_hub_floor", 64, 64, (g) => {
      g.fillStyle(0x5a4328, 1);
      g.fillRect(0, 0, 64, 64);
      g.fillStyle(0x6d5435, 1);
      g.fillRect(0, 8, 64, 5);
      g.fillRect(0, 40, 64, 4);
    });

    this.generateTextureIfMissing(graphics, "zone_mountain_floor", 96, 96, (g) => {
      g.fillStyle(0x344154, 1);
      g.fillRect(0, 0, 96, 96);
      g.fillStyle(0x607088, 1);
      g.fillTriangle(12, 76, 34, 20, 58, 76);
      g.fillTriangle(42, 82, 70, 10, 92, 82);
      g.fillStyle(0xd9f1ff, 0.75);
      g.fillRect(29, 30, 10, 6);
      g.fillRect(66, 20, 10, 6);
    });

    this.generateTextureIfMissing(graphics, "zone_coast_floor", 96, 96, (g) => {
      g.fillStyle(0x284858, 1);
      g.fillRect(0, 0, 96, 96);
      g.fillStyle(0x6f6450, 1);
      g.fillRect(0, 60, 96, 36);
      g.fillStyle(0xd4c48e, 0.72);
      g.fillRect(12, 70, 28, 3);
      g.fillRect(52, 82, 32, 3);
    });

    this.generateTextureIfMissing(graphics, "zone_sea_floor", 128, 128, (g) => {
      g.fillStyle(0x0b2637, 1);
      g.fillRect(0, 0, 128, 128);
      g.lineStyle(2, 0x245a78, 0.55);
      g.lineBetween(0, 28, 128, 18);
      g.lineBetween(0, 72, 128, 86);
      g.lineBetween(0, 112, 128, 100);
      g.fillStyle(0x5ca0b8, 0.16);
      g.fillRect(14, 42, 46, 4);
      g.fillRect(72, 18, 34, 4);
      g.fillRect(82, 98, 32, 4);
    });

    this.generateTextureIfMissing(graphics, "zone_island_floor", 128, 128, (g) => {
      g.fillStyle(0x2f6e43, 1);
      g.fillRect(0, 0, 128, 128);
      g.fillStyle(0x3f8250, 1);
      g.fillRect(0, 18, 128, 8);
      g.fillRect(0, 82, 128, 6);
      g.fillStyle(0x8f7b4a, 0.72);
      g.fillRect(20, 48, 42, 5);
      g.fillRect(72, 108, 38, 5);
      g.fillStyle(0xd6c483, 0.5);
      g.fillRect(0, 0, 128, 8);
      g.fillRect(0, 120, 128, 8);
    });

    this.generateTextureIfMissing(graphics, "floating_debris", 64, 32, (g) => {
      g.fillStyle(0x061018, 0.4);
      g.fillEllipse(32, 25, 52, 7);
      g.fillStyle(0x7b552e, 1);
      g.fillRoundedRect(8, 12, 44, 9, 5);
      g.fillStyle(0xb17436, 1);
      g.fillRoundedRect(17, 7, 34, 8, 5);
      g.fillStyle(0x244620, 1);
      g.fillRect(9, 6, 15, 4);
    });

    this.generateTextureIfMissing(graphics, "shipwreck_marker", 78, 44, (g) => {
      g.fillStyle(0x061018, 0.45);
      g.fillEllipse(39, 37, 62, 9);
      g.fillStyle(0x6e4625, 1);
      g.fillTriangle(8, 34, 66, 12, 54, 36);
      g.fillStyle(0xa16d39, 1);
      g.fillTriangle(18, 29, 58, 15, 49, 31);
      g.lineStyle(4, 0x3a2414, 1);
      g.lineBetween(46, 12, 68, 4);
    });

    this.generateTextureIfMissing(graphics, "sea_dock_entrance", 128, 82, (g) => {
      g.fillStyle(0x061018, 0.44);
      g.fillEllipse(64, 72, 104, 14);
      g.fillStyle(0x5b3920, 1);
      g.fillRoundedRect(36, 30, 54, 18, 5);
      g.fillStyle(0x8c6134, 1);
      g.fillRoundedRect(40, 26, 48, 14, 4);
      g.lineStyle(5, 0x3b2415, 1);
      g.lineBetween(22, 58, 106, 58);
      g.lineBetween(30, 66, 96, 66);
      g.lineStyle(4, 0x6c4324, 1);
      g.lineBetween(32, 46, 32, 76);
      g.lineBetween(64, 42, 64, 78);
      g.lineBetween(96, 46, 96, 76);
      g.fillStyle(0x2d2018, 1);
      g.fillTriangle(38, 44, 64, 12, 90, 44);
      g.fillStyle(0xb88950, 1);
      g.fillTriangle(47, 41, 64, 21, 80, 41);
      g.lineStyle(3, 0x22150d, 1);
      g.lineBetween(92, 16, 112, 6);
      g.lineBetween(92, 16, 104, 31);
      g.fillStyle(0xb26d3c, 1);
      g.fillTriangle(100, 8, 116, 6, 106, 19);
    });

    this.generateTextureIfMissing(graphics, "sea_reef_wall", 80, 28, (g) => {
      g.fillStyle(0x061018, 0.45);
      g.fillEllipse(40, 24, 66, 7);
      g.fillStyle(0x53666e, 1);
      g.fillRoundedRect(7, 8, 66, 15, 8);
      g.fillStyle(0x82939a, 1);
      g.fillRect(22, 7, 18, 4);
      g.fillStyle(0x315f69, 1);
      g.fillRect(50, 16, 15, 4);
    });

    this.generateTextureIfMissing(graphics, "ancient_tree", 92, 128, (g) => {
      g.fillStyle(0x080f0a, 0.55);
      g.fillEllipse(46, 118, 70, 14);
      g.fillStyle(0x213318, 1);
      g.fillCircle(46, 38, 38);
      g.fillStyle(0x162714, 1);
      g.fillCircle(20, 55, 28);
      g.fillCircle(70, 58, 30);
      g.fillStyle(0x4a301d, 1);
      g.fillRect(36, 54, 22, 62);
      g.fillStyle(0x2d1c12, 1);
      g.fillRect(42, 58, 4, 54);
      g.fillRect(52, 64, 3, 42);
      g.fillStyle(0x4f7a3a, 1);
      g.fillRect(32, 72, 11, 5);
      g.fillRect(53, 88, 10, 5);
      g.fillRect(38, 101, 14, 5);
    });

    this.generateTextureIfMissing(graphics, "fern_patch", 72, 46, (g) => {
      g.fillStyle(0x0b140d, 0.45);
      g.fillEllipse(36, 38, 58, 10);
      g.fillStyle(0x31582b, 1);
      for (let index = 0; index < 5; index += 1) {
        const x = 16 + index * 10;
        g.fillTriangle(x, 36, x + 7, 6 + index * 3, x + 15, 36);
      }
      g.fillStyle(0x5f8d43, 1);
      g.fillRect(22, 22, 7, 4);
      g.fillRect(40, 18, 8, 4);
      g.fillRect(52, 25, 7, 4);
    });

    this.generateTextureIfMissing(graphics, "small_tree_cluster", 74, 76, (g) => {
      g.fillStyle(0x061009, 0.38);
      g.fillEllipse(37, 68, 58, 9);
      g.fillStyle(0x243a1b, 1);
      g.fillCircle(26, 28, 19);
      g.fillCircle(44, 23, 23);
      g.fillCircle(52, 40, 18);
      g.fillStyle(0x61401f, 1);
      g.fillRect(32, 38, 10, 27);
      g.fillStyle(0x7ea34f, 1);
      g.fillRect(20, 45, 8, 4);
      g.fillRect(44, 49, 10, 4);
    });

    this.generateTextureIfMissing(graphics, "shrub_patch", 64, 38, (g) => {
      g.fillStyle(0x061009, 0.36);
      g.fillEllipse(32, 32, 52, 8);
      g.fillStyle(0x28481f, 1);
      g.fillCircle(18, 22, 13);
      g.fillCircle(32, 17, 16);
      g.fillCircle(46, 23, 12);
      g.fillStyle(0x679044, 1);
      g.fillRect(20, 14, 6, 3);
      g.fillRect(39, 19, 7, 3);
    });

    this.generateTextureIfMissing(graphics, "flower_patch", 58, 34, (g) => {
      g.fillStyle(0x061009, 0.3);
      g.fillEllipse(29, 29, 46, 7);
      g.fillStyle(0x3f742f, 1);
      g.fillTriangle(8, 29, 14, 8, 18, 29);
      g.fillTriangle(22, 29, 28, 6, 33, 29);
      g.fillTriangle(38, 29, 45, 10, 50, 29);
      g.fillStyle(0xf0c15c, 1);
      g.fillCircle(15, 12, 3);
      g.fillStyle(0xe18aa8, 1);
      g.fillCircle(29, 10, 3);
      g.fillStyle(0x9dc9ff, 1);
      g.fillCircle(45, 14, 3);
    });

    this.generateTextureIfMissing(graphics, "dry_grass_patch", 70, 36, (g) => {
      g.fillStyle(0x061009, 0.26);
      g.fillEllipse(35, 31, 56, 7);
      g.fillStyle(0x8a7740, 1);
      for (let index = 0; index < 7; index += 1) {
        const x = 10 + index * 8;
        g.fillTriangle(x, 30, x + 5, 8 + (index % 2) * 5, x + 10, 30);
      }
      g.fillStyle(0xb69a52, 1);
      g.fillRect(24, 18, 5, 9);
      g.fillRect(48, 16, 5, 10);
    });

    this.generateTextureIfMissing(graphics, "stone_cluster", 70, 48, (g) => {
      g.fillStyle(0x061009, 0.34);
      g.fillEllipse(35, 42, 56, 8);
      g.fillStyle(0x586068, 1);
      g.fillCircle(24, 30, 15);
      g.fillStyle(0x737c82, 1);
      g.fillCircle(39, 23, 18);
      g.fillStyle(0x485056, 1);
      g.fillCircle(51, 32, 11);
      g.fillStyle(0xb7c3c5, 1);
      g.fillRect(38, 13, 10, 4);
      g.fillRect(20, 24, 9, 3);
    });

    this.generateTextureIfMissing(graphics, "forest_leaf_scatter", 84, 44, (g) => {
      g.fillStyle(0x061009, 0.2);
      g.fillEllipse(42, 36, 68, 8);
      for (const leaf of [
        { x: 12, y: 24, c: 0x315b2b },
        { x: 24, y: 18, c: 0x4f7d33 },
        { x: 38, y: 28, c: 0x6a8537 },
        { x: 55, y: 20, c: 0x2d4a25 },
        { x: 70, y: 30, c: 0x5f7331 },
      ]) {
        g.fillStyle(leaf.c, 0.9);
        g.fillEllipse(leaf.x, leaf.y, 14, 6);
      }
    });

    this.generateTextureIfMissing(graphics, "mountain_fog_patch", 120, 44, (g) => {
      g.fillStyle(0x9db5c8, 0.2);
      g.fillEllipse(36, 22, 60, 18);
      g.fillStyle(0xd9f1ff, 0.18);
      g.fillEllipse(72, 18, 74, 16);
      g.fillStyle(0xf4ffff, 0.12);
      g.fillEllipse(58, 30, 96, 12);
    });

    this.generateTextureIfMissing(graphics, "coast_reed_patch", 74, 54, (g) => {
      g.fillStyle(0x061009, 0.22);
      g.fillEllipse(37, 47, 58, 8);
      for (let index = 0; index < 7; index += 1) {
        const x = 10 + index * 9;
        const height = 24 + (index % 3) * 7;
        g.lineStyle(3, index % 2 === 0 ? 0x748848 : 0x9a8848, 1);
        g.lineBetween(x, 46, x + 5, 46 - height);
        g.fillStyle(0x665a34, 1);
        g.fillEllipse(x + 6, 44 - height, 6, 14);
      }
    });

    this.generateTextureIfMissing(graphics, "distant_bird", 36, 24, (g) => {
      g.fillStyle(0x10100c, 0.78);
      g.fillTriangle(18, 12, 4, 6, 13, 15);
      g.fillTriangle(18, 12, 32, 6, 23, 15);
      g.fillStyle(0x1f1a12, 0.9);
      g.fillCircle(18, 13, 3);
    });

    this.generateTextureIfMissing(graphics, "moss_log_wall", 96, 34, (g) => {
      g.fillStyle(0x26180d, 1);
      g.fillRoundedRect(2, 5, 92, 24, 10);
      g.fillStyle(0x6a3f1f, 1);
      g.fillRoundedRect(4, 7, 88, 20, 9);
      g.fillStyle(0x8f5b2c, 1);
      g.fillRect(12, 11, 58, 3);
      g.fillRect(18, 21, 66, 3);
      g.fillStyle(0x27451e, 1);
      g.fillRect(6, 4, 34, 5);
      g.fillRect(52, 2, 25, 5);
      g.fillRect(70, 25, 20, 5);
    });

    this.generateTextureIfMissing(graphics, "stone_pillar_wall", 48, 86, (g) => {
      g.fillStyle(0x151817, 0.5);
      g.fillEllipse(24, 78, 42, 10);
      g.fillStyle(0x4a5048, 1);
      g.fillRoundedRect(7, 4, 34, 76, 8);
      g.fillStyle(0x737b70, 1);
      g.fillRect(13, 10, 17, 6);
      g.fillRect(17, 31, 18, 5);
      g.fillRect(11, 56, 22, 5);
      g.fillStyle(0x273e24, 1);
      g.fillRect(8, 20, 8, 6);
      g.fillRect(29, 44, 9, 6);
      g.fillRect(17, 68, 14, 5);
    });

    this.generateTextureIfMissing(graphics, "map_tent", 70, 52, (g) => {
      g.fillStyle(0x2a1d13, 0.45);
      g.fillEllipse(35, 46, 60, 9);
      g.fillStyle(0xb9874a, 1);
      g.fillTriangle(6, 44, 35, 6, 64, 44);
      g.fillStyle(0x604124, 1);
      g.fillTriangle(28, 44, 35, 18, 43, 44);
    });

    this.generateTextureIfMissing(graphics, "map_campfire", 48, 48, (g) => {
      g.lineStyle(5, 0x5b341c, 1);
      g.lineBetween(10, 35, 38, 25);
      g.lineBetween(10, 25, 38, 35);
      g.fillStyle(0xffcf61, 1);
      g.fillTriangle(24, 8, 15, 34, 34, 34);
      g.fillStyle(0xe55b2a, 1);
      g.fillTriangle(26, 17, 21, 34, 37, 35);
    });

    this.generateTextureIfMissing(graphics, "season_river_lock", 96, 32, (g) => {
      g.fillStyle(0x1f6a88, 1);
      g.fillRect(0, 0, 96, 32);
      g.lineStyle(3, 0x9bd9e4, 0.9);
      g.lineBetween(2, 8, 94, 2);
      g.lineBetween(0, 22, 96, 14);
    });

    this.generateTextureIfMissing(graphics, "season_bramble_lock", 48, 96, (g) => {
      g.fillStyle(0x2a341a, 1);
      g.fillRect(0, 0, 48, 96);
      g.lineStyle(4, 0x5d331f, 1);
      g.lineBetween(6, 90, 42, 6);
      g.lineBetween(40, 92, 8, 12);
      g.fillStyle(0xaa3b25, 1);
      g.fillTriangle(16, 30, 24, 18, 30, 32);
      g.fillTriangle(26, 70, 34, 58, 40, 72);
    });

    this.generateTextureIfMissing(graphics, "season_snow_lock", 96, 32, (g) => {
      g.fillStyle(0xcde4ec, 1);
      g.fillRoundedRect(0, 0, 96, 32, 12);
      g.fillStyle(0xf7ffff, 0.82);
      g.fillRoundedRect(12, 4, 62, 10, 6);
      g.fillStyle(0x9db9c2, 1);
      g.fillRect(22, 22, 48, 4);
    });

    this.generateTextureIfMissing(graphics, "supply_cache", 42, 34, (g) => {
      g.fillStyle(0x4b2d16, 1);
      g.fillRoundedRect(4, 8, 34, 22, 4);
      g.fillStyle(0x7a4c25, 1);
      g.fillRoundedRect(6, 6, 30, 18, 4);
      g.fillStyle(0x305226, 1);
      g.fillRect(4, 4, 18, 5);
      g.fillStyle(0xd1a84f, 1);
      g.fillRect(18, 15, 6, 8);
    });

    this.generateTextureIfMissing(graphics, "black_cat_footprint", 20, 18, (g) => {
      g.fillStyle(0x000000, 1);
      g.fillEllipse(10, 11, 9, 7);
      g.fillCircle(5, 5, 2);
      g.fillCircle(9, 3, 2);
      g.fillCircle(13, 3, 2);
      g.fillCircle(16, 5, 2);
    });

    this.generateTextureIfMissing(graphics, "memory_obelisk", 42, 78, (g) => {
      g.fillStyle(0x1a171d, 1);
      g.fillTriangle(21, 0, 39, 74, 3, 74);
      g.fillStyle(0x403a48, 1);
      g.fillTriangle(21, 8, 33, 68, 9, 68);
      g.fillStyle(0x83d1c0, 0.8);
      g.fillRect(18, 24, 6, 24);
    });

    graphics.destroy();
  }

  private generateTextureIfMissing(
    graphics: Phaser.GameObjects.Graphics,
    key: string,
    width: number,
    height: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void,
  ): void {
    if (this.scene.textures.exists(key)) {
      return;
    }

    graphics.clear();
    draw(graphics);
    graphics.generateTexture(key, width, height);
  }
}
