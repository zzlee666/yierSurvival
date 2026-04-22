import Phaser from "phaser";
import {
  GameMapManager,
  type MapInteractionResult,
  type MapCreationResult,
  type MapSeason,
  type MapZoneId,
  type ZoneDefinition,
} from "../GameMapManager";
import {
  ONLINE_DEFAULT_WS_URL,
  ONLINE_PROTOCOL_VERSION,
  type BearId,
  type OnlineBearSnapshot,
  type OnlineServerMessage,
} from "../shared/online";

type TimePhase = "Day" | "Night";
type GameStage = "Spring" | "Summer" | "Autumn" | "Winter" | "Sea" | "Island" | "Return" | "Abyss";
type WorldMapKind = "main" | "sea" | "island";
type WeaponId = "claws" | "wooden_spear" | "stone_club";
type ResourceId = "wood" | "stone" | "grass";
type InventoryItemId = "apples" | "food" | "seeds" | "water" | "fishMeat" | ResourceId;
type CraftRecipeId = "campfire" | "wooden_spear" | "stone_club" | "bandage" | "cooked_apple";
type BearCondition = "健康" | "缺水" | "饿了" | "寒冷" | "好热";
type WeatherKind = "clear" | "rain" | "sun" | "snow";
type CropState = "empty" | "planted" | "mature";
type FishTypeId = "silver_fish" | "red_snapper" | "moon_eel" | "abyss_carp";
type FishingPhase = "idle" | "waiting" | "bite";
type BigFishState = "idle" | "appearing" | "pulling" | "caught";

type MovementKeys = {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
};

interface BearStats {
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
}

interface BearInventory {
  apples: number;
  maxApples: number;
  food: number;
  seeds: number;
  water: number;
  fishMeat: number;
  wood: number;
  stone: number;
  grass: number;
}

interface CampStorage {
  apples: number;
  food: number;
  seeds: number;
  water: number;
  fishMeat: number;
  wood: number;
  stone: number;
  grass: number;
}

interface WeaponDefinition {
  id: WeaponId;
  name: string;
  texture: string;
  damage: number;
  range: number;
  cooldownMs: number;
  knockback: number;
  coneDot: number;
}

interface BearActor {
  id: BearId;
  name: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  visual: Phaser.GameObjects.DOMElement;
  stats: BearStats;
  inventory: BearInventory;
  temperature: number;
  hydration: number;
  condition: BearCondition;
  speed: number;
  facing: -1 | 1;
  weaponId: WeaponId;
  nextAttackAllowedAt: number;
  aimDirection: Phaser.Math.Vector2;
}

interface SpawnPoint {
  x: number;
  y: number;
}

interface WeaponSpawnPoint extends SpawnPoint {
  weaponId: Exclude<WeaponId, "claws">;
}

interface ResourceSpawnPoint extends SpawnPoint {
  resourceId: ResourceId;
  amount: number;
}

interface ResourceDefinition {
  id: ResourceId;
  name: string;
  texture: string;
}

interface CraftingRecipe {
  id: CraftRecipeId;
  name: string;
  costs: Partial<Record<InventoryItemId, number>>;
  requiresBurningFire?: boolean;
}

interface CraftingButton {
  recipeId: CraftRecipeId;
  panel: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image;
}

interface StorageButton {
  itemId: InventoryItemId;
  label: Phaser.GameObjects.Text;
  depositButton: Phaser.GameObjects.Rectangle;
  depositText: Phaser.GameObjects.Text;
  withdrawButton: Phaser.GameObjects.Rectangle;
  withdrawText: Phaser.GameObjects.Text;
}

interface CampfireGlow {
  campfire: Phaser.Physics.Arcade.Image;
  glow: Phaser.GameObjects.Ellipse;
}

interface StageModifiers {
  hungerMultiplier: number;
  speedMultiplier: number;
}

interface DailyObjective {
  day: number;
  stage: GameStage;
  text: string;
}

interface CropPlotState {
  id: string;
  x: number;
  y: number;
  state: CropState;
  sprite?: Phaser.Physics.Arcade.Image;
}

interface FishDefinition {
  id: FishTypeId;
  name: string;
  texture: string;
  meatReward: number;
  minBiteSeconds: number;
  maxBiteSeconds: number;
  size: number;
  speed: number;
}

interface FishShadowActor {
  id: number;
  definition: FishDefinition;
  sprite: Phaser.GameObjects.Image;
}

interface CircularMeter {
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  valueText: Phaser.GameObjects.Text;
  x: number;
  y: number;
  radius: number;
  color: number;
  trackColor: number;
  icon: "heart" | "food" | "time";
}

const LEGACY_WORLD_WIDTH = 2560;
const LEGACY_WORLD_HEIGHT = 1440;
const WORLD_WIDTH = 5120;
const WORLD_HEIGHT = 2880;
const WORLD_COORD_SCALE = Math.min(WORLD_WIDTH / LEGACY_WORLD_WIDTH, WORLD_HEIGHT / LEGACY_WORLD_HEIGHT);
const scaleWorldCoord = (value: number): number => Math.round(value * WORLD_COORD_SCALE);
const TOTAL_STORY_DAYS = 60;
const SEASON_LENGTH_DAYS = 10;
const SEA_DEPARTURE_UNLOCK_DAY = 40;
const SEA_START_DAY = 41;
const ISLAND_START_DAY = 45;
const RETURN_DAY = 50;
const ABYSS_START_DAY = 51;
const REQUIRED_FLASHBACKS_TO_WIN = 4;
const HUNGER_DRAIN_PER_SECOND = 0.42;
const NIGHT_HUNGER_MULTIPLIER = 1.18;
const STARVING_HP_DRAIN_PER_SECOND = 1.25;
const APPLE_HUNGER_RESTORE = 30;
const FOOD_HUNGER_RESTORE = 35;
const FISH_MEAT_HUNGER_RESTORE = 40;
const BANDAGE_HEAL_AMOUNT = 28;
const PICKUP_RADIUS = 54;
const DAY_LENGTH_SECONDS = 42;
const DAY_PHASE_RATIO = 0.58;
const NIGHT_FADE_PROGRESS = 0.08;
const NIGHT_MAX_DARKNESS = 0.82;
const NIGHT_DOM_BRIGHTNESS = 0.34;
const APPLE_RESPAWN_SECONDS = 3.5;
const MAX_APPLES_ON_GROUND = 16;
const COOKED_APPLE_HUNGER_RESTORE = 45;
const MAX_ENEMIES_AT_NIGHT = 3;
const ABYSS_MAX_ENEMIES_AT_NIGHT = 5;
const ENEMY_SPEED = 82;
const ABYSS_ENEMY_SPEED = 108;
const ENEMY_MAX_HP = 55;
const ENEMY_TOUCH_DAMAGE_PER_SECOND = 3.2;
const CAMPFIRE_SAFE_RADIUS = 190;
const CAMPFIRE_SLOW_RADIUS = 310;
const CAMPFIRE_REPEL_SPEED = 132;
const CAMPFIRE_SLOWED_ENEMY_SPEED = 34;
const CAMPFIRE_HUB_X = 1364;
const CAMPFIRE_HUB_Y = 748;
const CAMP_STORAGE_X = 1266;
const CAMP_STORAGE_Y = 810;
const SEA_CAMPFIRE_X = 1280;
const SEA_CAMPFIRE_Y = 720;
const ISLAND_CAMPFIRE_X = 1280;
const ISLAND_CAMPFIRE_Y = 760;
const CAMPFIRE_INTERACT_RADIUS = 84;
const STORAGE_INTERACT_RADIUS = 88;
const TENT_INTERACT_RADIUS = 104;
const SEA_DOCK_INTERACT_RADIUS = 132;
const PERMANENT_CAMPFIRE_MAX_FUEL_SECONDS = 220;
const PERMANENT_CAMPFIRE_START_FUEL_SECONDS = 180;
const CRAFTED_CAMPFIRE_MAX_FUEL_SECONDS = 120;
const CRAFTED_CAMPFIRE_START_FUEL_SECONDS = 70;
const WOOD_FUEL_SECONDS = 45;
const BLACK_CAT_HEAL_AMOUNT = 24;
const BLACK_CAT_MIN_SPAWN_SECONDS = 8;
const BLACK_CAT_MAX_SPAWN_SECONDS = 18;
const BLACK_CAT_LIFETIME_SECONDS = 10;
const BIRD_MIN_SPAWN_SECONDS = 6;
const BIRD_MAX_SPAWN_SECONDS = 12;
const MAX_BIRDS_ON_GROUND = 4;
const RAIN_WATER_PER_SECOND = 0.45;
const HYDRATION_DRAIN_PER_SECOND = 0.028;
const CROP_INTERACT_RADIUS = 62;
const BEAR_TOUCH_DISTANCE = 56;
const FUSION_MOVE_SPEED = 178;
const FUSION_DURATION_MS = 2300;
const FUSION_COOLDOWN_MS = 900;
const FUSION_RELEASE_OFFSET = 42;
const MINIMAP_WIDTH = 214;
const MINIMAP_HEIGHT = 154;
const MINIMAP_PADDING = 16;
const QUEST_PANEL_WIDTH = 360;
const QUEST_PANEL_HEIGHT = 148;
const QUEST_PANEL_PADDING = 16;
const SEA_VOYAGE_DURATION_SECONDS = DAY_LENGTH_SECONDS * 3.25;
const SEA_BIG_FISH_TRIGGER_PROGRESS = 0.85;
const SEA_BOAT_START_X = 520;
const SEA_BOAT_END_X = 2040;
const SEA_BOAT_Y = 720;
const SEA_YIER_SEAT_OFFSET_X = -46;
const SEA_YIER_SEAT_OFFSET_Y = -18;
const SEA_BUBU_SEAT_OFFSET_X = 48;
const SEA_BUBU_SEAT_OFFSET_Y = -10;
const SEA_FISH_CAST_RADIUS = 210;
const SEA_FISH_BITE_WINDOW_SECONDS = 1.85;
const SEA_FISH_MIN_SPAWN_SECONDS = 1.8;
const SEA_FISH_MAX_SPAWN_SECONDS = 3.8;
const SEA_MAX_FISH_SHADOWS = 5;
const BIG_FISH_PULL_TARGET = 100;
const BIG_FISH_PULL_GAIN = 18;
const BIG_FISH_REPEAT_PULL_GAIN = 3;
const BIG_FISH_PULL_DECAY_PER_SECOND = 7;
const MINIMAP_ZONE_COLORS: Record<MapZoneId, number> = {
  hub: 0xc58a42,
  forest: 0x2f7a45,
  mountains: 0x7292b5,
  coast: 0x3d9caa,
  sea: 0x2c83a3,
  island: 0x70a84a,
};
const RESOURCE_RESPAWN_DAYS: Record<ResourceId, number> = {
  grass: 1,
  wood: 3,
  stone: 5,
};
const INVENTORY_ITEM_NAMES: Record<InventoryItemId, string> = {
  apples: "Apple",
  food: "Food",
  seeds: "Seeds",
  water: "Water",
  fishMeat: "Fish",
  wood: "Wood",
  stone: "Stone",
  grass: "Grass",
};
const STORAGE_ITEMS: InventoryItemId[] = ["apples", "food", "fishMeat", "seeds", "water", "wood", "stone", "grass"];
const FISH_DEFINITIONS: Record<FishTypeId, FishDefinition> = {
  silver_fish: {
    id: "silver_fish",
    name: "银鳞鱼",
    texture: "fish_shadow_silver",
    meatReward: 1,
    minBiteSeconds: 1.1,
    maxBiteSeconds: 2.4,
    size: 30,
    speed: 54,
  },
  red_snapper: {
    id: "red_snapper",
    name: "红脊鱼",
    texture: "fish_shadow_red",
    meatReward: 2,
    minBiteSeconds: 1.5,
    maxBiteSeconds: 3.0,
    size: 36,
    speed: 62,
  },
  moon_eel: {
    id: "moon_eel",
    name: "月影鳗",
    texture: "fish_shadow_moon",
    meatReward: 2,
    minBiteSeconds: 1.8,
    maxBiteSeconds: 3.5,
    size: 44,
    speed: 70,
  },
  abyss_carp: {
    id: "abyss_carp",
    name: "深渊鲤",
    texture: "fish_shadow_abyss",
    meatReward: 3,
    minBiteSeconds: 2.1,
    maxBiteSeconds: 4.0,
    size: 48,
    speed: 48,
  },
};
const RESOURCE_DEFINITIONS: Record<ResourceId, ResourceDefinition> = {
  wood: {
    id: "wood",
    name: "木材",
    texture: "resource_wood",
  },
  stone: {
    id: "stone",
    name: "石头",
    texture: "resource_stone",
  },
  grass: {
    id: "grass",
    name: "草",
    texture: "resource_grass",
  },
};
const CRAFTING_RECIPES: Record<CraftRecipeId, CraftingRecipe> = {
  campfire: {
    id: "campfire",
    name: "篝火",
    costs: {
      wood: 2,
      grass: 1,
    },
  },
  wooden_spear: {
    id: "wooden_spear",
    name: "木矛",
    costs: {
      wood: 2,
      grass: 1,
    },
  },
  stone_club: {
    id: "stone_club",
    name: "石锤",
    costs: {
      wood: 1,
      stone: 2,
    },
  },
  bandage: {
    id: "bandage",
    name: "绷带",
    costs: {
      grass: 2,
    },
  },
  cooked_apple: {
    id: "cooked_apple",
    name: "Roast Apple",
    costs: {
      apples: 1,
    },
    requiresBurningFire: true,
  },
};
const WEAPON_DEFINITIONS: Record<WeaponId, WeaponDefinition> = {
  claws: {
    id: "claws",
    name: "爪击",
    texture: "weapon_claws",
    damage: 10,
    range: 54,
    cooldownMs: 360,
    knockback: 115,
    coneDot: 0.1,
  },
  wooden_spear: {
    id: "wooden_spear",
    name: "木矛",
    texture: "weapon_wooden_spear",
    damage: 24,
    range: 104,
    cooldownMs: 520,
    knockback: 170,
    coneDot: 0.25,
  },
  stone_club: {
    id: "stone_club",
    name: "石锤",
    texture: "weapon_stone_club",
    damage: 36,
    range: 74,
    cooldownMs: 690,
    knockback: 245,
    coneDot: -0.05,
  },
};

export class MainScene extends Phaser.Scene {
  private activeBearId: BearId = "yier";
  private bears!: Record<BearId, BearActor>;
  private mapManager!: GameMapManager;
  private gameStage: GameStage = "Spring";
  private currentMapKind: WorldMapKind = "main";
  private mapSeason: MapSeason = "Spring";
  private mapFlashbacksFound = 0;
  private mapZones: ZoneDefinition[] = [];
  private discoveredZoneIds = new Set<MapZoneId>();
  private currentZoneId?: MapZoneId;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private apples!: Phaser.Physics.Arcade.StaticGroup;
  private resources!: Phaser.Physics.Arcade.StaticGroup;
  private weapons!: Phaser.Physics.Arcade.StaticGroup;
  private campfires!: Phaser.Physics.Arcade.StaticGroup;
  private storageChests!: Phaser.Physics.Arcade.StaticGroup;
  private birds!: Phaser.Physics.Arcade.StaticGroup;
  private cropPlots!: Phaser.Physics.Arcade.StaticGroup;
  private campfireGlows: CampfireGlow[] = [];
  private enemies!: Phaser.Physics.Arcade.Group;
  private blackCats!: Phaser.Physics.Arcade.StaticGroup;
  private campStorage: CampStorage = {
    apples: 0,
    food: 0,
    seeds: 0,
    water: 0,
    fishMeat: 0,
    wood: 0,
    stone: 0,
    grass: 0,
  };
  private readonly cropPlotStates: CropPlotState[] = [
    { id: "camp-plot-1", x: 1128, y: 824, state: "empty" },
    { id: "camp-plot-2", x: 1188, y: 870, state: "empty" },
    { id: "camp-plot-3", x: 1436, y: 838, state: "empty" },
    { id: "camp-plot-4", x: 1496, y: 884, state: "empty" },
  ];
  private readonly birdSpawnPoints: SpawnPoint[] = [
    { x: 860, y: 500 },
    { x: 980, y: 640 },
    { x: 1070, y: 520 },
    { x: 1530, y: 575 },
    { x: 1630, y: 690 },
    { x: 1010, y: 890 },
    { x: 1570, y: 940 },
    { x: 1980, y: 820 },
    { x: 560, y: 930 },
  ];
  private appleSpawnPoints: SpawnPoint[] = [];
  private enemySpawnPoints: SpawnPoint[] = [];
  private activeResourceSpawnPoints: ResourceSpawnPoint[] = [];
  private activeWeaponSpawnPoints: WeaponSpawnPoint[] = [];
  private readonly weaponSpawnPoints: WeaponSpawnPoint[] = [
    { x: 1164, y: 710, weaponId: "wooden_spear" },
    { x: 1396, y: 740, weaponId: "stone_club" },
    { x: 780, y: 520, weaponId: "wooden_spear" },
    { x: 1760, y: 560, weaponId: "stone_club" },
    { x: 430, y: 1210, weaponId: "wooden_spear" },
    { x: 2100, y: 1220, weaponId: "stone_club" },
  ];
  private readonly resourceSpawnPoints: ResourceSpawnPoint[] = [
    { x: 660, y: 430, resourceId: "wood", amount: 2 },
    { x: 920, y: 320, resourceId: "wood", amount: 2 },
    { x: 560, y: 620, resourceId: "wood", amount: 2 },
    { x: 1760, y: 430, resourceId: "wood", amount: 2 },
    { x: 2160, y: 850, resourceId: "wood", amount: 2 },
    { x: 1040, y: 900, resourceId: "grass", amount: 3 },
    { x: 1450, y: 880, resourceId: "grass", amount: 3 },
    { x: 700, y: 1090, resourceId: "grass", amount: 3 },
    { x: 1980, y: 1110, resourceId: "grass", amount: 3 },
    { x: 2280, y: 1160, resourceId: "grass", amount: 3 },
    { x: 340, y: 300, resourceId: "stone", amount: 2 },
    { x: 960, y: 230, resourceId: "stone", amount: 2 },
    { x: 1580, y: 245, resourceId: "stone", amount: 2 },
    { x: 2250, y: 330, resourceId: "stone", amount: 2 },
    { x: 620, y: 190, resourceId: "stone", amount: 2 },
  ];
  private readonly seaResourceSpawnPoints: ResourceSpawnPoint[] = [
    { x: 760, y: 560, resourceId: "wood", amount: 2 },
    { x: 1040, y: 480, resourceId: "wood", amount: 2 },
    { x: 1570, y: 910, resourceId: "wood", amount: 2 },
    { x: 1880, y: 520, resourceId: "stone", amount: 2 },
    { x: 510, y: 1010, resourceId: "stone", amount: 2 },
    { x: 1380, y: 1060, resourceId: "grass", amount: 3 },
    { x: 930, y: 940, resourceId: "grass", amount: 3 },
  ];
  private readonly islandResourceSpawnPoints: ResourceSpawnPoint[] = [
    { x: 790, y: 530, resourceId: "wood", amount: 2 },
    { x: 1000, y: 930, resourceId: "wood", amount: 2 },
    { x: 1660, y: 560, resourceId: "wood", amount: 2 },
    { x: 720, y: 820, resourceId: "stone", amount: 2 },
    { x: 1840, y: 940, resourceId: "stone", amount: 2 },
    { x: 1180, y: 420, resourceId: "grass", amount: 3 },
    { x: 1490, y: 980, resourceId: "grass", amount: 3 },
  ];
  private readonly seaWeaponSpawnPoints: WeaponSpawnPoint[] = [
    { x: 1100, y: 700, weaponId: "wooden_spear" },
    { x: 1510, y: 760, weaponId: "stone_club" },
  ];
  private readonly islandWeaponSpawnPoints: WeaponSpawnPoint[] = [
    { x: 930, y: 650, weaponId: "wooden_spear" },
    { x: 1640, y: 820, weaponId: "stone_club" },
  ];

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: MovementKeys;
  private switchKey?: Phaser.Input.Keyboard.Key;
  private pickupKey?: Phaser.Input.Keyboard.Key;
  private eatKey?: Phaser.Input.Keyboard.Key;
  private attackKey?: Phaser.Input.Keyboard.Key;
  private craftMenuKey?: Phaser.Input.Keyboard.Key;
  private minimapToggleKey?: Phaser.Input.Keyboard.Key;
  private debugPreviousDayKey?: Phaser.Input.Keyboard.Key;
  private debugNextDayKey?: Phaser.Input.Keyboard.Key;
  private seasonKeys?: Record<MapSeason, Phaser.Input.Keyboard.Key>;
  private messageText?: Phaser.GameObjects.Text;
  private interactionHintText?: Phaser.GameObjects.Text;
  private craftingPanel?: Phaser.GameObjects.Container;
  private craftingButtons: CraftingButton[] = [];
  private isCraftingPanelOpen = false;
  private storagePanel?: Phaser.GameObjects.Container;
  private storageButtons: StorageButton[] = [];
  private isStoragePanelOpen = false;
  private minimapGraphics?: Phaser.GameObjects.Graphics;
  private minimapTitleText?: Phaser.GameObjects.Text;
  private minimapZoneText?: Phaser.GameObjects.Text;
  private isMinimapVisible = true;
  private questPanelGraphics?: Phaser.GameObjects.Graphics;
  private questTitleText?: Phaser.GameObjects.Text;
  private questStageText?: Phaser.GameObjects.Text;
  private questObjectiveText?: Phaser.GameObjects.Text;
  private questMetaText?: Phaser.GameObjects.Text;
  private zoneDiscoveryText?: Phaser.GameObjects.Text;
  private nightOverlay?: Phaser.GameObjects.Rectangle;
  private sunOverlay?: Phaser.GameObjects.Rectangle;
  private weatherGraphics?: Phaser.GameObjects.Graphics;
  private abyssOverlay?: Phaser.GameObjects.Rectangle;
  private finaleText?: Phaser.GameObjects.Text;
  private worldColliders: Phaser.Physics.Arcade.Collider[] = [];
  private seaBoatAnchor?: Phaser.Physics.Arcade.Sprite;
  private seaBoatImage?: Phaser.GameObjects.Image;
  private seaWakeGraphics?: Phaser.GameObjects.Graphics;
  private fishingBobber?: Phaser.GameObjects.Image;
  private bigFishSprite?: Phaser.GameObjects.Image;
  private bigFishBackSprite?: Phaser.GameObjects.Image;
  private seaFishShadows: FishShadowActor[] = [];
  private seaFishIdSeed = 0;
  private seaVoyageElapsedSeconds = 0;
  private seaVoyageProgress = 0;
  private seaFishSpawnTimer = 0;
  private seaNextFishSpawnSeconds = 0;
  private fishingPhase: FishingPhase = "idle";
  private fishingFish?: FishShadowActor;
  private fishingBiteReadyAt = 0;
  private fishingBiteExpiresAt = 0;
  private bigFishState: BigFishState = "idle";
  private bigFishPull = 0;
  private bigFishLastPullBearId?: BearId;
  private isSeaFinaleActive = false;
  private hasCompletedSeaFinale = false;
  private hudMeters!: {
    hp: CircularMeter;
    hunger: CircularMeter;
    time: CircularMeter;
  };
  private hudInfoText?: Phaser.GameObjects.Text;
  private fusionVisual?: Phaser.GameObjects.DOMElement;
  private isFusing = false;
  private fusionEndsAt = 0;
  private nextFusionAllowedAt = 0;

  private phase: TimePhase = "Day";
  private clockSeconds = 0;
  private dayIndex = 1;
  private isAbyssMode = false;
  private gameEnded = false;
  private hasShownAllBearsDown = false;
  private isShelteredInTent = false;
  private weatherKind: WeatherKind = "clear";
  private springRainActive = false;
  private weatherEventTimer = 0;
  private rainWaterProgress = 0;
  private birdSpawnTimer = 0;
  private nextBirdSpawnSeconds = 0;
  private onlineMode = false;
  private onlineSocket?: WebSocket;
  private onlineControlledBearId?: BearId;
  private onlineBearTargets: Partial<Record<BearId, OnlineBearSnapshot>> = {};
  private onlineInputSeq = 0;
  private onlineInputSendTimer = 0;
  private onlineLastMoveX = 0;
  private onlineLastMoveY = 0;
  private onlineConnectedCount = 0;
  private onlineStatus = "Local";
  private appleRespawnTimer = 0;
  private enemySpawnTimer = 0;
  private blackCatSpawnTimer = 0;
  private nextBlackCatSpawnSeconds = 0;
  private hasScaledWorldData = false;

  constructor() {
    super("MainScene");
  }

  preload(): void {
    // Runtime placeholder textures are generated in create().
  }

  create(): void {
    this.gameStage = this.getStageForDay(this.dayIndex);
    this.scaleWorldDataOnce();
    this.createRuntimeTextures();
    this.createWorld();
    this.createBears();
    this.createItemsAndEnemies();
    this.createInput();
    this.createHud();
    this.createCraftingPanel();
    this.createStoragePanel();
    this.createMinimap();
    this.createCollisions();
    this.spawnPermanentCampfire();
    this.spawnCampStorageChest();
    this.spawnInitialApples();
    this.spawnInitialResources();
    this.spawnInitialWeapons();
    this.createCampCropPlots();
    this.spawnSeasonalBirds(true);
    this.cameras.main.startFollow(this.activeBear.sprite, true, 0.08, 0.08);
    this.onlineMode = this.isOnlineModeEnabled();
    this.connectOnlineIfEnabled();
  }

  update(_time: number, delta: number): void {
    const deltaSeconds = delta / 1000;

    this.updateClock(deltaSeconds);

    if (this.gameEnded) {
      this.syncAnimatedVisuals();
      this.refreshHud();
      return;
    }

    if (!this.onlineMode) {
      this.ensureActiveBearCanMove();
    }

    this.updateSeaVoyage(deltaSeconds);
    this.updateCampfireFuel(deltaSeconds);
    this.updateFusionState();

    if (!this.isFusing) {
      if (this.onlineMode) {
        this.updateOnlineMovement(deltaSeconds);
        this.applyOnlineBearTargets(deltaSeconds);
      } else {
        this.updateSwitching();
        this.updateMovement();
        this.tryStartFusion();
      }
      this.updateSeasonHotkeys();
      this.updateDebugDayHotkeys();
      this.updateManualActions();
    } else {
      this.updateFusionMovement();
      this.updateManualActions();
    }

    this.updateHunger(deltaSeconds);
    this.updateBearComfort(deltaSeconds);
    this.updateWeather(deltaSeconds);
    this.updateInteractionHint();
    this.updateMapEvents();
    this.updateZoneDiscovery();
    this.renderMinimap();
    this.updateAppleRespawn(deltaSeconds);
    this.updateResourceRespawns();
    this.updateBirdSpawn(deltaSeconds);
    this.updateBlackCatSpawn(deltaSeconds);
    this.updateNightEnemies(deltaSeconds);
    if (!this.onlineMode) {
      this.ensureActiveBearCanMove();
    }
    this.syncAnimatedVisuals();
    this.refreshHud();
  }

  private createWorld(): void {
    this.mapManager = new GameMapManager(this);
    this.mapSeason = "Spring";
    this.applyMapLayout(this.mapManager.createWorld(this.mapSeason), "main");
  }

  private scaleWorldDataOnce(): void {
    if (this.hasScaledWorldData) {
      return;
    }

    const scalePoint = (point: SpawnPoint): void => {
      point.x = scaleWorldCoord(point.x);
      point.y = scaleWorldCoord(point.y);
    };

    this.cropPlotStates.forEach(scalePoint);
    this.birdSpawnPoints.forEach(scalePoint);
    this.weaponSpawnPoints.forEach(scalePoint);
    this.resourceSpawnPoints.forEach(scalePoint);
    this.seaResourceSpawnPoints.forEach(scalePoint);
    this.islandResourceSpawnPoints.forEach(scalePoint);
    this.seaWeaponSpawnPoints.forEach(scalePoint);
    this.islandWeaponSpawnPoints.forEach(scalePoint);
    this.hasScaledWorldData = true;
  }

  private applyMapLayout(layout: MapCreationResult, mapKind: WorldMapKind): void {
    this.currentMapKind = mapKind;
    this.walls = layout.walls;
    this.appleSpawnPoints = layout.appleSpawnPoints;
    this.enemySpawnPoints = layout.enemySpawnPoints;
    this.mapZones = layout.zones;
    this.activeResourceSpawnPoints = this.getResourceSpawnPointsForMap(mapKind);
    this.activeWeaponSpawnPoints = this.getWeaponSpawnPointsForMap(mapKind);

    for (const zone of this.mapZones) {
      if (zone.id === "hub" || mapKind !== "main") {
        this.discoveredZoneIds.add(zone.id);
      }
    }

    this.currentZoneId = this.mapZones[0]?.id;
  }

  private createBears(): void {
    this.bears = {
      yier: this.createBear("yier", "一二", "bear_yier", "/characters/yier.gif", scaleWorldCoord(1210), scaleWorldCoord(700), {
        hp: 100,
        maxHp: 100,
        hunger: 86,
        maxHunger: 100,
      }),
      bubu: this.createBear("bubu", "布布", "bear_bubu", "/characters/bubu.webp", scaleWorldCoord(1320), scaleWorldCoord(700), {
        hp: 140,
        maxHp: 140,
        hunger: 120,
        maxHunger: 140,
      }),
    };
  }

  private createBear(
    id: BearId,
    name: string,
    texture: string,
    imageUrl: string,
    x: number,
    y: number,
    stats: BearStats,
  ): BearActor {
    const sprite = this.physics.add.sprite(x, y, texture);
    sprite.setCollideWorldBounds(true);
    sprite.setDepth(5);
    sprite.setVisible(false);
    sprite.body?.setSize(28, 28);
    const visual = this.createAnimatedVisual(imageUrl, x, y, id === "yier" ? 86 : 92, 86);

    return {
      id,
      name,
      sprite,
      visual,
      stats,
      inventory: {
        apples: 0,
        maxApples: id === "bubu" ? 8 : 5,
        food: 0,
        seeds: 0,
        water: 0,
        fishMeat: 0,
        wood: 0,
        stone: 0,
        grass: 0,
      },
      temperature: 37,
      hydration: 88,
      condition: "健康",
      speed: id === "yier" ? 190 : 170,
      facing: 1,
      weaponId: "claws",
      nextAttackAllowedAt: 0,
      aimDirection: new Phaser.Math.Vector2(1, 0),
    };
  }

  private createItemsAndEnemies(): void {
    this.apples = this.physics.add.staticGroup();
    this.resources = this.physics.add.staticGroup();
    this.weapons = this.physics.add.staticGroup();
    this.campfires = this.physics.add.staticGroup();
    this.storageChests = this.physics.add.staticGroup();
    this.birds = this.physics.add.staticGroup();
    this.cropPlots = this.physics.add.staticGroup();
    this.blackCats = this.physics.add.staticGroup();
    this.nextBirdSpawnSeconds = Phaser.Math.FloatBetween(BIRD_MIN_SPAWN_SECONDS, BIRD_MAX_SPAWN_SECONDS);
    this.nextBlackCatSpawnSeconds = Phaser.Math.FloatBetween(
      BLACK_CAT_MIN_SPAWN_SECONDS,
      BLACK_CAT_MAX_SPAWN_SECONDS,
    );
    this.enemies = this.physics.add.group({
      allowGravity: false,
      immovable: false,
    });
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    this.cursors = keyboard.createCursorKeys();
    this.movementKeys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as MovementKeys;
    this.switchKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.pickupKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.eatKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.attackKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.craftMenuKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.minimapToggleKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.debugPreviousDayKey = keyboard.addKey(219);
    this.debugNextDayKey = keyboard.addKey(221);
    this.seasonKeys = {
      Spring: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      Summer: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      Autumn: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      Winter: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    };
  }

  private createHud(): void {
    this.nightOverlay = this.add
      .rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x050714, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(900);

    this.sunOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffb052, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(899);

    this.abyssOverlay = this.add
      .rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x330000, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(902);

    this.weatherGraphics = this.add.graphics().setScrollFactor(0).setDepth(904);

    this.add
      .image(12, 10, "wood_sign_panel")
      .setOrigin(0)
      .setDisplaySize(760, 178)
      .setScrollFactor(0)
      .setDepth(998);

    this.hudMeters = {
      hp: this.createCircularMeter(78, 82, 42, "HP", 0xe4524b, "heart"),
      hunger: this.createCircularMeter(180, 82, 42, "HUNGER", 0xe3b85a, "food"),
      time: this.createCircularMeter(282, 82, 42, "TIME", 0x79c7ff, "time"),
    };

    this.hudInfoText = this.add
      .text(350, 34, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#fff2cb",
        lineSpacing: 8,
        shadow: {
          offsetX: 1,
          offsetY: 1,
          color: "#24140a",
          blur: 0,
          fill: true,
        },
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.createQuestTracker();

    this.add
      .image(14, 624, "stone_tablet_panel")
      .setOrigin(0)
      .setDisplaySize(690, 72)
      .setScrollFactor(0)
      .setDepth(998);

    this.messageText = this.add
      .text(34, 647, this.getDefaultPromptText(), {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#e8e0ca",
        shadow: {
          offsetX: 1,
          offsetY: 1,
          color: "#1a1712",
          blur: 0,
          fill: true,
        },
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.interactionHintText = this.add
      .text(34, 674, "", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#f4d28d",
        shadow: {
          offsetX: 1,
          offsetY: 1,
          color: "#1a1712",
          blur: 0,
          fill: true,
        },
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  private createQuestTracker(): void {
    const bounds = this.getQuestPanelBounds();

    this.questPanelGraphics = this.add.graphics().setScrollFactor(0).setDepth(1001);
    this.questTitleText = this.add
      .text(bounds.x + 18, bounds.y + 14, "任务追踪", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#ffe7ae",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(1002);
    this.questStageText = this.add
      .text(bounds.x + 18, bounds.y + 43, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#d7c296",
      })
      .setScrollFactor(0)
      .setDepth(1002);
    this.questObjectiveText = this.add
      .text(bounds.x + 18, bounds.y + 70, "", {
        fontFamily: "sans-serif",
        fontSize: "15px",
        color: "#fff2cb",
        lineSpacing: 4,
        wordWrap: {
          width: QUEST_PANEL_WIDTH - 36,
        },
      })
      .setScrollFactor(0)
      .setDepth(1002);
    this.questMetaText = this.add
      .text(bounds.x + 18, bounds.y + QUEST_PANEL_HEIGHT - 26, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#bda174",
      })
      .setScrollFactor(0)
      .setDepth(1002);

    this.renderQuestTracker();
  }

  private createCraftingPanel(): void {
    const panel = this.add
      .container(this.scale.width - 450, MINIMAP_PADDING + MINIMAP_HEIGHT + 16)
      .setScrollFactor(0)
      .setDepth(1003)
      .setVisible(false);
    const background = this.add.rectangle(0, 0, 430, 306, 0x27180d, 0.92).setOrigin(0);
    const title = this.add
      .text(18, 14, "Crafting", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#ffe7ae",
      })
      .setOrigin(0);

    background.setStrokeStyle(2, 0xa76a34, 0.9);
    panel.add([background, title]);

    const recipes: CraftRecipeId[] = ["campfire", "wooden_spear", "stone_club", "bandage", "cooked_apple"];

    recipes.forEach((recipeId, index) => {
      const y = 52 + index * 48;
      const recipe = CRAFTING_RECIPES[recipeId];
      const row = this.add.rectangle(16, y, 398, 38, 0x3b2615, 0.92).setOrigin(0).setInteractive({ useHandCursor: true });
      const icon = this.add.image(38, y + 19, this.getRecipeIconTexture(recipeId)).setDisplaySize(30, 24);
      const label = this.add
        .text(66, y + 7, `${recipe.name}  ${this.formatRecipeCosts(recipe)}`, {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#f8ddb0",
        })
        .setOrigin(0);

      row.on("pointerdown", () => this.tryCraft(recipeId, this.activeBear));
      row.on("pointerover", () => row.setFillStyle(0x57351b, 0.95));
      row.on("pointerout", () => this.updateCraftingPanelState());
      panel.add([row, icon, label]);
      this.craftingButtons.push({
        recipeId,
        panel: row,
        label,
        icon,
      });
    });

    const hint = this.add
      .text(18, 280, "Q close | Click recipe to craft", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#cfae78",
      })
      .setOrigin(0);

    panel.add(hint);
    this.craftingPanel = panel;
    this.updateCraftingPanelState();
  }

  private toggleCraftingPanel(): void {
    this.setCraftingPanelVisible(!this.isCraftingPanelOpen);
  }

  private setCraftingPanelVisible(isVisible: boolean): void {
    this.isCraftingPanelOpen = isVisible;
    this.craftingPanel?.setVisible(isVisible);

    if (isVisible) {
      this.setStoragePanelVisible(false);
      this.updateCraftingPanelState();
    }
  }

  private createStoragePanel(): void {
    const panel = this.add
      .container(this.scale.width - 450, MINIMAP_PADDING + MINIMAP_HEIGHT + 16)
      .setScrollFactor(0)
      .setDepth(1003)
      .setVisible(false);
    const background = this.add.rectangle(0, 0, 430, 322, 0x1f1711, 0.94).setOrigin(0);
    const title = this.add
      .text(18, 14, "Camp Storage", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#ffe7ae",
      })
      .setOrigin(0);

    background.setStrokeStyle(2, 0x80623d, 0.9);
    panel.add([background, title]);

    STORAGE_ITEMS.forEach((itemId, index) => {
      const y = 46 + index * 32;
      const label = this.add
        .text(18, y + 4, "", {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#f4ddae",
        })
        .setOrigin(0);
      const depositButton = this.add.rectangle(284, y, 58, 24, 0x3b2615, 0.95).setOrigin(0).setInteractive({
        useHandCursor: true,
      });
      const depositText = this.add
        .text(313, y + 12, "Store", {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#ffe1a8",
        })
        .setOrigin(0.5);
      const withdrawButton = this.add.rectangle(350, y, 58, 24, 0x3b2615, 0.95).setOrigin(0).setInteractive({
        useHandCursor: true,
      });
      const withdrawText = this.add
        .text(379, y + 12, "Take", {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#ffe1a8",
        })
        .setOrigin(0.5);

      depositButton.on("pointerdown", () => this.depositOneToStorage(itemId));
      withdrawButton.on("pointerdown", () => this.withdrawOneFromStorage(itemId));
      panel.add([label, depositButton, depositText, withdrawButton, withdrawText]);
      this.storageButtons.push({
        itemId,
        label,
        depositButton,
        depositText,
        withdrawButton,
        withdrawText,
      });
    });

    const hint = this.add
      .text(18, 298, "E chest close | Store / Take 1", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#cfae78",
      })
      .setOrigin(0);

    panel.add(hint);
    this.storagePanel = panel;
    this.updateStoragePanelState();
  }

  private setStoragePanelVisible(isVisible: boolean): void {
    this.isStoragePanelOpen = isVisible;
    this.storagePanel?.setVisible(isVisible);

    if (isVisible) {
      this.setCraftingPanelVisible(false);
      this.updateStoragePanelState();
    }
  }

  private updateCraftingPanelState(): void {
    const bear = this.activeBear;

    for (const button of this.craftingButtons) {
      const recipe = CRAFTING_RECIPES[button.recipeId];
      const canCraft = this.canCraftRecipe(bear, recipe);

      button.panel.setFillStyle(canCraft ? 0x3f2d19 : 0x251812, canCraft ? 0.96 : 0.78);
      button.panel.setStrokeStyle(1, canCraft ? 0xd4a052 : 0x67452b, canCraft ? 0.9 : 0.55);
      button.label.setColor(canCraft ? "#ffe2aa" : "#8f7a62");
      button.icon.setAlpha(canCraft ? 1 : 0.45);
    }
  }

  private updateStoragePanelState(): void {
    const bear = this.activeBear;

    for (const button of this.storageButtons) {
      const packAmount = this.getInventoryAmount(bear, button.itemId);
      const storedAmount = this.campStorage[button.itemId];
      const canDeposit = packAmount > 0;
      const canWithdraw = storedAmount > 0 && (button.itemId !== "apples" || bear.inventory.apples < bear.inventory.maxApples);

      button.label.setText(`${INVENTORY_ITEM_NAMES[button.itemId]}  Bag ${packAmount} | Box ${storedAmount}`);
      button.depositButton.setFillStyle(canDeposit ? 0x3f2d19 : 0x241914, canDeposit ? 0.96 : 0.72);
      button.depositButton.setStrokeStyle(1, canDeposit ? 0xd4a052 : 0x604532, canDeposit ? 0.86 : 0.48);
      button.depositText.setColor(canDeposit ? "#ffe1a8" : "#8f7a62");
      button.withdrawButton.setFillStyle(canWithdraw ? 0x3f2d19 : 0x241914, canWithdraw ? 0.96 : 0.72);
      button.withdrawButton.setStrokeStyle(1, canWithdraw ? 0xd4a052 : 0x604532, canWithdraw ? 0.86 : 0.48);
      button.withdrawText.setColor(canWithdraw ? "#ffe1a8" : "#8f7a62");
    }
  }

  private getRecipeIconTexture(recipeId: CraftRecipeId): string {
    if (recipeId === "campfire") {
      return "crafted_campfire";
    }

    if (recipeId === "wooden_spear") {
      return "weapon_wooden_spear";
    }

    if (recipeId === "stone_club") {
      return "weapon_stone_club";
    }

    if (recipeId === "cooked_apple") {
      return "cooked_apple";
    }

    return "crafted_bandage";
  }

  private createMinimap(): void {
    const bounds = this.getMinimapBounds();

    this.minimapGraphics = this.add.graphics().setScrollFactor(0).setDepth(1004);
    this.minimapTitleText = this.add
      .text(bounds.x + 12, bounds.y + 9, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#f8e4b4",
      })
      .setScrollFactor(0)
      .setDepth(1005);
    this.minimapZoneText = this.add
      .text(bounds.x + 12, bounds.y + bounds.height - 24, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9c394",
      })
      .setScrollFactor(0)
      .setDepth(1005);
    this.zoneDiscoveryText = this.add
      .text(this.scale.width / 2, 104, "", {
        fontFamily: "sans-serif",
        fontSize: "24px",
        color: "#ffe0a3",
        shadow: {
          offsetX: 2,
          offsetY: 2,
          color: "#1a0f08",
          blur: 0,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1006)
      .setAlpha(0);

    this.renderMinimap();
  }

  private renderQuestTracker(): void {
    if (!this.questPanelGraphics || !this.questTitleText || !this.questStageText || !this.questObjectiveText || !this.questMetaText) {
      return;
    }

    const bounds = this.getQuestPanelBounds();
    const currentZone = this.getCurrentZone();
    const objective = this.getDailyObjective();

    this.questPanelGraphics.clear();
    this.questPanelGraphics.fillStyle(0x18110b, 0.9);
    this.questPanelGraphics.fillRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 8);
    this.questPanelGraphics.lineStyle(2, 0xb47a38, 0.94);
    this.questPanelGraphics.strokeRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 8);
    this.questPanelGraphics.fillStyle(0x3f2a14, 0.88);
    this.questPanelGraphics.fillRoundedRect(bounds.x + 10, bounds.y + 10, bounds.width - 20, 36, 6);
    this.questPanelGraphics.fillStyle(0xe0a04f, 0.96);
    this.questPanelGraphics.fillCircle(bounds.x + 28, bounds.y + 28, 5);

    this.questTitleText.setPosition(bounds.x + 42, bounds.y + 15);
    this.questStageText.setPosition(bounds.x + 18, bounds.y + 52);
    this.questObjectiveText.setPosition(bounds.x + 18, bounds.y + 76);
    this.questMetaText.setPosition(bounds.x + 18, bounds.y + QUEST_PANEL_HEIGHT - 26);

    this.questStageText.setText(`Day ${objective.day} · ${objective.stage} · ${currentZone?.displayName ?? "未知区域"}`);
    this.questObjectiveText.setText(`◆ ${objective.text}`);
    this.questMetaText.setText(`${this.formatStageCountdown()}  |  M ${this.isMinimapVisible ? "隐藏地图" : "显示地图"}`);
  }

  private toggleMinimapVisibility(): void {
    this.setMinimapVisible(!this.isMinimapVisible);
  }

  private setMinimapVisible(isVisible: boolean): void {
    this.isMinimapVisible = isVisible;
    this.minimapGraphics?.setVisible(isVisible);
    this.minimapTitleText?.setVisible(isVisible);
    this.minimapZoneText?.setVisible(isVisible);

    if (isVisible) {
      this.renderMinimap();
    }

    this.renderQuestTracker();
  }

  private updateZoneDiscovery(): void {
    const activeZone = this.mapManager.getZoneAt({
      x: this.activeBear.sprite.x,
      y: this.activeBear.sprite.y,
    });

    this.currentZoneId = activeZone.id;

    for (const bear of Object.values(this.bears)) {
      const zone = this.mapManager.getZoneAt({
        x: bear.sprite.x,
        y: bear.sprite.y,
      });

      if (this.discoveredZoneIds.has(zone.id)) {
        continue;
      }

      this.discoveredZoneIds.add(zone.id);
      this.showZoneDiscovery(zone);
    }
  }

  private showZoneDiscovery(zone: ZoneDefinition): void {
    if (!this.zoneDiscoveryText) {
      return;
    }

    this.tweens.killTweensOf(this.zoneDiscoveryText);
    this.zoneDiscoveryText.setText(`发现区域：${zone.displayName}`);
    this.zoneDiscoveryText.setAlpha(0);
    this.zoneDiscoveryText.setY(96);
    this.tweens.add({
      targets: this.zoneDiscoveryText,
      alpha: 1,
      y: 112,
      duration: 260,
      ease: "Sine.easeOut",
      yoyo: true,
      hold: 1250,
    });
  }

  private renderMinimap(): void {
    if (!this.minimapGraphics || !this.minimapTitleText || !this.minimapZoneText) {
      return;
    }

    if (!this.isMinimapVisible) {
      return;
    }

    const bounds = this.getMinimapBounds();
    const mapArea = this.getMinimapMapArea(bounds);
    const graphics = this.minimapGraphics;

    this.minimapTitleText.setPosition(bounds.x + 12, bounds.y + 9);
    this.minimapZoneText.setPosition(bounds.x + 12, bounds.y + bounds.height - 24);

    graphics.clear();
    graphics.fillStyle(0x10140f, 0.88);
    graphics.fillRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 8);
    graphics.lineStyle(2, 0x7f5a2e, 0.92);
    graphics.strokeRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 8);
    graphics.fillStyle(0x060906, 0.55);
    graphics.fillRoundedRect(mapArea.x, mapArea.y, mapArea.width, mapArea.height, 5);
    graphics.lineStyle(1, 0x2f3b2d, 0.9);
    graphics.strokeRoundedRect(mapArea.x, mapArea.y, mapArea.width, mapArea.height, 5);

    for (const zone of this.getMinimapDrawZones()) {
      this.drawMinimapZone(graphics, zone, mapArea);
    }

    this.drawMinimapCampfires(graphics, mapArea);
    this.drawMinimapBear(graphics, this.bears.yier, mapArea, 0xf7f2e8);
    this.drawMinimapBear(graphics, this.bears.bubu, mapArea, 0x9a6038);

    const currentZone = this.getCurrentZone();
    this.minimapTitleText.setText(`Map ${this.getCurrentMapDiscoveredCount()}/${this.mapZones.length}`);
    this.minimapZoneText.setText(`当前：${currentZone?.displayName ?? "未知区域"}`);
  }

  private drawMinimapZone(
    graphics: Phaser.GameObjects.Graphics,
    zone: ZoneDefinition,
    mapArea: Phaser.Geom.Rectangle,
  ): void {
    const point = this.worldToMinimap(zone.center.x, zone.center.y, mapArea);
    const radius = this.minimapRadius(zone.radius, mapArea);
    const isDiscovered = this.discoveredZoneIds.has(zone.id);
    const isCurrent = this.currentZoneId === zone.id;
    const color = isDiscovered ? MINIMAP_ZONE_COLORS[zone.id] : 0x3a3c39;
    const alpha = isDiscovered ? 0.78 : 0.36;

    graphics.fillStyle(color, alpha);
    graphics.fillCircle(point.x, point.y, radius);
    graphics.lineStyle(isCurrent ? 3 : 1, isCurrent ? 0xffe3a0 : 0x151915, isCurrent ? 0.95 : 0.55);
    graphics.strokeCircle(point.x, point.y, radius);
  }

  private drawMinimapBear(
    graphics: Phaser.GameObjects.Graphics,
    bear: BearActor,
    mapArea: Phaser.Geom.Rectangle,
    color: number,
  ): void {
    const point = this.worldToMinimap(bear.sprite.x, bear.sprite.y, mapArea);
    const radius = bear.id === this.activeBearId ? 4 : 3;

    graphics.lineStyle(1, bear.id === this.activeBearId ? 0xfff4be : 0x1d140d, 1);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(point.x, point.y, radius);
    graphics.strokeCircle(point.x, point.y, radius + 1);
  }

  private drawMinimapCampfires(
    graphics: Phaser.GameObjects.Graphics,
    mapArea: Phaser.Geom.Rectangle,
  ): void {
    for (const child of this.campfires.getChildren()) {
      const campfire = child as Phaser.Physics.Arcade.Image;

      if (!campfire.active) {
        continue;
      }

      const zone = this.mapManager.getZoneAt({
        x: campfire.x,
        y: campfire.y,
      });

      if (!this.discoveredZoneIds.has(zone.id)) {
        continue;
      }

      const point = this.worldToMinimap(campfire.x, campfire.y, mapArea);
      graphics.fillStyle(this.isCampfireBurning(campfire) ? 0xffbd63 : 0x6a4d37, this.isCampfireBurning(campfire) ? 0.95 : 0.72);
      graphics.fillCircle(point.x, point.y, 2.6);
    }
  }

  private getMinimapDrawZones(): ZoneDefinition[] {
    const drawOrder: MapZoneId[] = ["forest", "mountains", "coast", "hub", "sea", "island"];

    return drawOrder
      .map((zoneId) => this.mapZones.find((zone) => zone.id === zoneId))
      .filter((zone): zone is ZoneDefinition => Boolean(zone));
  }

  private getCurrentMapDiscoveredCount(): number {
    return this.mapZones.filter((zone) => this.discoveredZoneIds.has(zone.id)).length;
  }

  private getCurrentZone(): ZoneDefinition | undefined {
    return this.mapZones.find((zone) => zone.id === this.currentZoneId);
  }

  private getMinimapBounds(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.scale.width - MINIMAP_WIDTH - MINIMAP_PADDING,
      this.scale.height - MINIMAP_HEIGHT - MINIMAP_PADDING,
      MINIMAP_WIDTH,
      MINIMAP_HEIGHT,
    );
  }

  private getQuestPanelBounds(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.scale.width - QUEST_PANEL_WIDTH - QUEST_PANEL_PADDING,
      QUEST_PANEL_PADDING,
      QUEST_PANEL_WIDTH,
      QUEST_PANEL_HEIGHT,
    );
  }

  private getMinimapMapArea(bounds: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(bounds.x + 12, bounds.y + 32, bounds.width - 24, bounds.height - 62);
  }

  private worldToMinimap(x: number, y: number, mapArea: Phaser.Geom.Rectangle): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      mapArea.x + Phaser.Math.Clamp(x / WORLD_WIDTH, 0, 1) * mapArea.width,
      mapArea.y + Phaser.Math.Clamp(y / WORLD_HEIGHT, 0, 1) * mapArea.height,
    );
  }

  private minimapRadius(worldRadius: number, mapArea: Phaser.Geom.Rectangle): number {
    const scale = Math.min(mapArea.width / WORLD_WIDTH, mapArea.height / WORLD_HEIGHT);

    return Phaser.Math.Clamp(worldRadius * scale, 6, 46);
  }

  private createCircularMeter(
    x: number,
    y: number,
    radius: number,
    label: string,
    color: number,
    icon: "heart" | "food" | "time",
  ): CircularMeter {
    const graphics = this.add.graphics().setScrollFactor(0).setDepth(1001);
    const labelText = this.add
      .text(x, y + radius + 9, label, {
        fontFamily: "monospace",
        fontSize: radius > 32 ? "13px" : "10px",
        color: "#f7e7b9",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002);
    const valueText = this.add
      .text(x, y + 14, "", {
        fontFamily: "monospace",
        fontSize: radius > 32 ? "12px" : "11px",
        color: "#fff6d7",
        align: "center",
        shadow: {
          offsetX: 1,
          offsetY: 1,
          color: "#1f1208",
          blur: 0,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002);

    return {
      graphics,
      label: labelText,
      valueText,
      x,
      y,
      radius,
      color,
      trackColor: 0x2d2115,
      icon,
    };
  }

  private createCollisions(): void {
    this.clearWorldColliders();

    for (const bear of Object.values(this.bears)) {
      this.worldColliders.push(this.physics.add.collider(bear.sprite, this.walls));
      this.worldColliders.push(
        this.physics.add.overlap(bear.sprite, this.enemies, (_bearSprite, enemy) => {
          this.damageBearFromEnemy(bear, enemy as Phaser.Physics.Arcade.Sprite);
        }),
      );
      this.worldColliders.push(
        this.physics.add.overlap(bear.sprite, this.blackCats, (_bearSprite, blackCat) => {
          this.healBearFromBlackCat(bear, blackCat as Phaser.Physics.Arcade.Image);
        }),
      );
    }

    this.worldColliders.push(this.physics.add.collider(this.enemies, this.walls));
  }

  private clearWorldColliders(): void {
    for (const collider of this.worldColliders.splice(0)) {
      collider.destroy();
    }
  }

  private spawnInitialApples(): void {
    for (let index = 0; index < 8; index += 1) {
      this.trySpawnRandomApple();
    }
  }

  private spawnInitialResources(): void {
    for (const point of this.activeResourceSpawnPoints) {
      const resource = RESOURCE_DEFINITIONS[point.resourceId];
      const node = this.resources.create(point.x, point.y, resource.texture) as Phaser.Physics.Arcade.Image;

      node.setData("resourceId", resource.id);
      node.setData("amount", point.amount);
      node.setData("respawnDay", 0);
      node.setDepth(4);
      node.refreshBody();
    }
  }

  private createCampCropPlots(): void {
    if (this.currentMapKind !== "main") {
      return;
    }

    this.matureAutumnCrops();

    for (const plot of this.cropPlotStates) {
      const sprite = this.cropPlots.create(plot.x, plot.y, this.getCropPlotTexture(plot.state)) as Phaser.Physics.Arcade.Image;
      sprite.setDepth(3);
      sprite.setData("cropPlotId", plot.id);
      sprite.refreshBody();
      plot.sprite = sprite;
    }
  }

  private updateCropPlotSprite(plot: CropPlotState): void {
    plot.sprite?.setTexture(this.getCropPlotTexture(plot.state));
    plot.sprite?.refreshBody();
  }

  private getCropPlotTexture(state: CropState): string {
    if (state === "planted") {
      return "crop_plot_planted";
    }

    if (state === "mature") {
      return "crop_plot_mature";
    }

    return "crop_plot_empty";
  }

  private matureAutumnCrops(): void {
    if (this.gameStage !== "Autumn") {
      return;
    }

    for (const plot of this.cropPlotStates) {
      if (plot.state === "planted") {
        plot.state = "mature";
        this.updateCropPlotSprite(plot);
      }
    }
  }

  private spawnSeasonalBirds(force = false): void {
    if (this.currentMapKind !== "main" || this.gameStage !== "Spring") {
      return;
    }

    const targetCount = force ? 3 : 1;

    for (let index = 0; index < targetCount; index += 1) {
      if (this.birds.countActive(true) >= MAX_BIRDS_ON_GROUND) {
        return;
      }

      const point = Phaser.Utils.Array.GetRandom(this.birdSpawnPoints);
      const bird = this.birds.create(
        point.x + Phaser.Math.Between(-24, 24),
        point.y + Phaser.Math.Between(-18, 18),
        "spring_bird",
      ) as Phaser.Physics.Arcade.Image;
      bird.setDepth(5);
      bird.setAlpha(0);
      bird.refreshBody();
      this.tweens.add({
        targets: bird,
        alpha: 1,
        y: bird.y - 4,
        duration: 360,
        ease: "Sine.easeOut",
        yoyo: true,
      });
    }
  }

  private spawnPermanentCampfire(): void {
    const campfirePoint = this.getPermanentCampfirePoint();
    const campfire = this.campfires.create(campfirePoint.x, campfirePoint.y, "crafted_campfire") as Phaser.Physics.Arcade.Image;

    campfire.setDepth(4);
    campfire.setData("permanent", true);
    campfire.setData("fuelSeconds", PERMANENT_CAMPFIRE_START_FUEL_SECONDS);
    campfire.setData("maxFuelSeconds", PERMANENT_CAMPFIRE_MAX_FUEL_SECONDS);
    campfire.refreshBody();
    this.createCampfireGlow(campfire);
  }

  private spawnCampStorageChest(): void {
    const chest = this.storageChests.create(scaleWorldCoord(CAMP_STORAGE_X), scaleWorldCoord(CAMP_STORAGE_Y), "camp_storage_chest") as Phaser.Physics.Arcade.Image;

    chest.setDepth(4);
    chest.refreshBody();
  }

  private spawnInitialWeapons(): void {
    for (const point of this.activeWeaponSpawnPoints) {
      const weapon = WEAPON_DEFINITIONS[point.weaponId];
      const pickup = this.weapons.create(point.x, point.y, weapon.texture) as Phaser.Physics.Arcade.Image;

      pickup.setData("weaponId", weapon.id);
      pickup.setDepth(4);
      pickup.refreshBody();
    }
  }

  private getResourceSpawnPointsForMap(mapKind: WorldMapKind): ResourceSpawnPoint[] {
    if (mapKind === "sea") {
      return this.seaResourceSpawnPoints;
    }

    if (mapKind === "island") {
      return this.islandResourceSpawnPoints;
    }

    return this.resourceSpawnPoints;
  }

  private getWeaponSpawnPointsForMap(mapKind: WorldMapKind): WeaponSpawnPoint[] {
    if (mapKind === "sea") {
      return this.seaWeaponSpawnPoints;
    }

    if (mapKind === "island") {
      return this.islandWeaponSpawnPoints;
    }

    return this.weaponSpawnPoints;
  }

  private getPermanentCampfirePoint(): SpawnPoint {
    if (this.currentMapKind === "sea") {
      return { x: scaleWorldCoord(SEA_CAMPFIRE_X), y: scaleWorldCoord(SEA_CAMPFIRE_Y) };
    }

    if (this.currentMapKind === "island") {
      return { x: scaleWorldCoord(ISLAND_CAMPFIRE_X), y: scaleWorldCoord(ISLAND_CAMPFIRE_Y) };
    }

    return { x: scaleWorldCoord(CAMPFIRE_HUB_X), y: scaleWorldCoord(CAMPFIRE_HUB_Y) };
  }

  private getStageForDay(day: number): GameStage {
    if (day <= 10) {
      return "Spring";
    }

    if (day <= 20) {
      return "Summer";
    }

    if (day <= 30) {
      return "Autumn";
    }

    if (day <= 40) {
      return "Winter";
    }

    if (day < ISLAND_START_DAY) {
      return "Sea";
    }

    if (day < RETURN_DAY) {
      return "Island";
    }

    if (day === RETURN_DAY) {
      return "Return";
    }

    return "Abyss";
  }

  private getStageDayRange(stage: GameStage): { start: number; end: number } {
    if (stage === "Spring") {
      return { start: 1, end: SEASON_LENGTH_DAYS };
    }

    if (stage === "Summer") {
      return { start: SEASON_LENGTH_DAYS + 1, end: SEASON_LENGTH_DAYS * 2 };
    }

    if (stage === "Autumn") {
      return { start: SEASON_LENGTH_DAYS * 2 + 1, end: SEASON_LENGTH_DAYS * 3 };
    }

    if (stage === "Winter") {
      return { start: SEASON_LENGTH_DAYS * 3 + 1, end: SEASON_LENGTH_DAYS * 4 };
    }

    if (stage === "Sea") {
      return { start: SEA_START_DAY, end: ISLAND_START_DAY - 1 };
    }

    if (stage === "Island") {
      return { start: ISLAND_START_DAY, end: RETURN_DAY - 1 };
    }

    if (stage === "Return") {
      return { start: RETURN_DAY, end: RETURN_DAY };
    }

    return { start: ABYSS_START_DAY, end: TOTAL_STORY_DAYS };
  }

  private getStageDaysRemaining(stage = this.gameStage): number {
    return Math.max(0, this.getStageDayRange(stage).end - this.dayIndex + 1);
  }

  private isSeasonStage(stage: GameStage): stage is MapSeason {
    return stage === "Spring" || stage === "Summer" || stage === "Autumn" || stage === "Winter";
  }

  private updateClock(deltaSeconds: number): void {
    if (this.isSeaFinaleActive) {
      this.phase = "Day";
      this.nightOverlay?.setAlpha(0);
      this.updateCampfireGlows(0);
      this.updateDomNightBrightness(0);
      return;
    }

    const previousClockSeconds = this.clockSeconds;
    this.clockSeconds = (this.clockSeconds + deltaSeconds) % DAY_LENGTH_SECONDS;
    if (this.clockSeconds < previousClockSeconds) {
      if (this.dayIndex >= TOTAL_STORY_DAYS) {
        this.resolveFinale();
        return;
      }

      this.dayIndex += 1;
      this.handleNewDay();
    }

    const dayProgress = this.clockSeconds / DAY_LENGTH_SECONDS;
    const darknessProgress = Phaser.Math.Clamp((dayProgress - DAY_PHASE_RATIO) / NIGHT_FADE_PROGRESS, 0, 1);
    const maxDarkness = this.isAbyssMode ? NIGHT_MAX_DARKNESS + 0.16 : NIGHT_MAX_DARKNESS;

    this.phase = dayProgress < DAY_PHASE_RATIO ? "Day" : "Night";
    this.nightOverlay?.setAlpha(darknessProgress * maxDarkness);
    this.updateCampfireGlows(darknessProgress);
    this.updateDomNightBrightness(darknessProgress);
  }

  private handleNewDay(): void {
    const nextStage = this.getStageForDay(this.dayIndex);

    if (nextStage !== this.gameStage) {
      this.transitionToStage(nextStage);
      return;
    }

    this.matureAutumnCrops();
    this.showMessage(`Day ${this.dayIndex}: ${this.getDailyObjective().text}`);
  }

  private transitionToStage(stage: GameStage): void {
    const previousStage = this.gameStage;
    this.gameStage = stage;

    if (stage !== "Abyss") {
      this.isAbyssMode = false;
      this.abyssOverlay?.setAlpha(0);
    }

    if (this.isSeasonStage(stage)) {
      if (this.currentMapKind !== "main") {
        this.switchWorldMap("main");
      }

      this.mapSeason = stage;
      this.mapManager.setSeason(stage);
      this.matureAutumnCrops();
      this.showStageTransition(`Day ${this.dayIndex}: ${stage} begins.`);
      return;
    }

    if (stage === "Sea") {
      if (this.currentMapKind !== "main" && this.currentMapKind !== "sea") {
        this.switchWorldMap("main");
      }

      this.showStageTransition("Day 41: 海雾涨起来了。前往荒芜海岸南侧的破船，按 E 登船出海。");
      return;
    }

    if (stage === "Island") {
      if (this.currentMapKind === "sea" && !this.hasCompletedSeaFinale) {
        this.gameStage = "Sea";
        this.dayIndex = Math.min(this.dayIndex, ISLAND_START_DAY - 1);
        this.clockSeconds = DAY_LENGTH_SECONDS * DAY_PHASE_RATIO * 0.82;
        this.startBigFishFinale();
        this.showStageTransition("海面下有什么咬住了鱼钩。先把它拉上来，才能抵达小岛。");
        return;
      }

      this.switchWorldMap("island");
      this.showStageTransition("Day 45: 小岛出现在雾里，像一段被冲上岸的记忆。");
      return;
    }

    if (stage === "Return") {
      this.switchWorldMap("main");
      this.showStageTransition("Day 50: 两只熊返航回到营地，火堆旁的影子变得更长。");
      return;
    }

    if (previousStage !== "Return" && this.currentMapKind !== "main") {
      this.switchWorldMap("main");
    }

    this.enterAbyssStage();
  }

  private switchWorldMap(mapKind: WorldMapKind): void {
    this.clearWorldColliders();
    this.clearDynamicWorldObjects();
    this.setStoragePanelVisible(false);
    this.setCraftingPanelVisible(false);

    const layout =
      mapKind === "sea"
        ? this.mapManager.createSeaWorld()
        : mapKind === "island"
          ? this.mapManager.createIslandWorld()
          : this.mapManager.createWorld(this.mapSeason);

    this.applyMapLayout(layout, mapKind);
    this.createCollisions();
    this.placeBearsForMap(mapKind);

    if (mapKind !== "sea") {
      this.spawnPermanentCampfire();
    }

    if (mapKind === "main") {
      this.spawnCampStorageChest();
    }

    if (mapKind !== "sea") {
      this.spawnInitialApples();
      this.spawnInitialResources();
      this.spawnInitialWeapons();
    }

    this.createCampCropPlots();
    this.spawnSeasonalBirds(true);

    if (mapKind === "sea") {
      this.setupSeaVoyage();
    } else {
      this.cameras.main.startFollow(this.activeBear.sprite, true, 0.08, 0.08);
    }

    this.syncAnimatedVisuals();
  }

  private clearDynamicWorldObjects(): void {
    this.clearSeaVoyageObjects();

    for (const entry of this.campfireGlows.splice(0)) {
      entry.glow.destroy();
    }

    for (const group of [this.apples, this.resources, this.weapons, this.campfires, this.storageChests, this.birds, this.cropPlots, this.blackCats]) {
      for (const child of group.getChildren()) {
        child.destroy();
      }
      group.clear(false, false);
    }

    this.clearEnemies();
    this.appleRespawnTimer = 0;
    this.enemySpawnTimer = 0;
    this.blackCatSpawnTimer = 0;
    this.birdSpawnTimer = 0;
    this.isShelteredInTent = false;
  }

  private placeBearsForMap(mapKind: WorldMapKind): void {
    const yier = this.bears.yier;
    const bubu = this.bears.bubu;

    if (mapKind === "sea") {
      yier.sprite.setPosition(scaleWorldCoord(1180), scaleWorldCoord(700));
      bubu.sprite.setPosition(scaleWorldCoord(1380), scaleWorldCoord(740));
    } else if (mapKind === "island") {
      yier.sprite.setPosition(scaleWorldCoord(1180), scaleWorldCoord(760));
      bubu.sprite.setPosition(scaleWorldCoord(1380), scaleWorldCoord(780));
    } else {
      yier.sprite.setPosition(scaleWorldCoord(1210), scaleWorldCoord(700));
      bubu.sprite.setPosition(scaleWorldCoord(1320), scaleWorldCoord(700));
    }

    this.stopBears();
  }

  private setupSeaVoyage(): void {
    this.clearSeaVoyageObjects();

    if (this.dayIndex < ISLAND_START_DAY) {
      this.hasCompletedSeaFinale = false;
    }

    const elapsedFromStoryDay = Math.max(0, this.dayIndex - SEA_START_DAY) * DAY_LENGTH_SECONDS + this.clockSeconds;
    this.seaVoyageElapsedSeconds = Phaser.Math.Clamp(elapsedFromStoryDay, 0, SEA_VOYAGE_DURATION_SECONDS * 0.82);
    this.seaVoyageProgress = Phaser.Math.Clamp(this.seaVoyageElapsedSeconds / SEA_VOYAGE_DURATION_SECONDS, 0, 1);
    this.seaFishSpawnTimer = 0;
    this.seaNextFishSpawnSeconds = Phaser.Math.FloatBetween(SEA_FISH_MIN_SPAWN_SECONDS, SEA_FISH_MAX_SPAWN_SECONDS);
    this.fishingPhase = "idle";
    this.bigFishState = "idle";
    this.bigFishPull = 0;
    this.bigFishLastPullBearId = undefined;
    this.isSeaFinaleActive = false;

    const anchor = this.getSeaBoatAnchorPoint();
    this.seaBoatAnchor = this.physics.add.sprite(anchor.x, anchor.y, "sea_boat").setVisible(false);
    this.seaBoatAnchor.setCollideWorldBounds(true);
    this.seaBoatAnchor.body?.setSize(12, 12);

    this.seaBoatImage = this.add.image(anchor.x, anchor.y, "sea_boat").setDepth(6);
    this.seaBoatImage.setDisplaySize(260, 104);
    this.seaWakeGraphics = this.add.graphics().setDepth(2);

    this.setSeaBoatSeatPositions();
    this.cameras.main.startFollow(this.seaBoatAnchor, true, 0.08, 0.08);
    this.showMessage("海上航行开始：E 抛竿钓鱼，等咬钩后再按 E 收竿。");
  }

  private clearSeaVoyageObjects(): void {
    this.seaBoatAnchor?.destroy();
    this.seaBoatImage?.destroy();
    this.seaWakeGraphics?.destroy();
    this.fishingBobber?.destroy();
    this.bigFishSprite?.destroy();
    this.bigFishBackSprite?.destroy();

    for (const fish of this.seaFishShadows) {
      fish.sprite.destroy();
    }

    this.seaBoatAnchor = undefined;
    this.seaBoatImage = undefined;
    this.seaWakeGraphics = undefined;
    this.fishingBobber = undefined;
    this.bigFishSprite = undefined;
    this.bigFishBackSprite = undefined;
    this.seaFishShadows = [];
    this.fishingFish = undefined;
    this.fishingPhase = "idle";
    this.bigFishState = "idle";
    this.bigFishPull = 0;
    this.bigFishLastPullBearId = undefined;
    this.isSeaFinaleActive = false;
  }

  private updateSeaVoyage(deltaSeconds: number): void {
    if (this.currentMapKind !== "sea") {
      return;
    }

    if (!this.seaBoatAnchor || !this.seaBoatImage) {
      this.setupSeaVoyage();
    }

    if (!this.isSeaFinaleActive && !this.hasCompletedSeaFinale) {
      this.seaVoyageElapsedSeconds = Math.min(
        this.seaVoyageElapsedSeconds + deltaSeconds,
        SEA_VOYAGE_DURATION_SECONDS,
      );
      this.seaVoyageProgress = Phaser.Math.Clamp(this.seaVoyageElapsedSeconds / SEA_VOYAGE_DURATION_SECONDS, 0, 1);
    }

    this.setSeaBoatSeatPositions();
    this.renderSeaVoyageWake();
    this.updateSeaFishShadows(deltaSeconds);
    this.updateFishingState();
    this.updateBigFishFinale(deltaSeconds);

    if (
      !this.hasCompletedSeaFinale &&
      !this.isSeaFinaleActive &&
      this.seaVoyageProgress >= SEA_BIG_FISH_TRIGGER_PROGRESS
    ) {
      this.startBigFishFinale();
    }
  }

  private getSeaBoatAnchorPoint(): SpawnPoint {
    const startX = scaleWorldCoord(SEA_BOAT_START_X);
    const endX = scaleWorldCoord(SEA_BOAT_END_X);

    return {
      x: Phaser.Math.Linear(startX, endX, this.seaVoyageProgress),
      y: scaleWorldCoord(SEA_BOAT_Y),
    };
  }

  private setSeaBoatSeatPositions(): void {
    const anchor = this.getSeaBoatAnchorPoint();
    const bob = Math.sin(this.time.now * 0.004) * 5;

    this.seaBoatAnchor?.setPosition(anchor.x, anchor.y + bob);
    this.seaBoatAnchor?.setVelocity(0, 0);
    this.seaBoatImage?.setPosition(anchor.x, anchor.y + bob);
    this.seaBoatImage?.setRotation(Math.sin(this.time.now * 0.002) * 0.025);

    this.bears.yier.sprite.setPosition(anchor.x + SEA_YIER_SEAT_OFFSET_X, anchor.y + SEA_YIER_SEAT_OFFSET_Y + bob);
    this.bears.bubu.sprite.setPosition(anchor.x + SEA_BUBU_SEAT_OFFSET_X, anchor.y + SEA_BUBU_SEAT_OFFSET_Y + bob);
    this.bears.yier.sprite.setVelocity(0, 0);
    this.bears.bubu.sprite.setVelocity(0, 0);
    this.bears.yier.facing = 1;
    this.bears.bubu.facing = 1;
    this.bears.yier.aimDirection.set(1, 0);
    this.bears.bubu.aimDirection.set(1, 0);
  }

  private renderSeaVoyageWake(): void {
    if (!this.seaWakeGraphics || !this.seaBoatAnchor) {
      return;
    }

    const x = this.seaBoatAnchor.x;
    const y = this.seaBoatAnchor.y;

    this.seaWakeGraphics.clear();
    this.seaWakeGraphics.lineStyle(3, 0xb7e7ff, 0.38);

    for (let index = 0; index < 5; index += 1) {
      const offset = index * 34 + (this.time.now * 0.08) % 34;
      this.seaWakeGraphics.lineBetween(x - 140 - offset, y - 28, x - 210 - offset, y - 52);
      this.seaWakeGraphics.lineBetween(x - 140 - offset, y + 30, x - 214 - offset, y + 58);
    }
  }

  private updateSeaFishShadows(deltaSeconds: number): void {
    if (this.isSeaFinaleActive || this.hasCompletedSeaFinale) {
      return;
    }

    this.seaFishSpawnTimer += deltaSeconds;

    if (
      this.seaFishSpawnTimer >= this.seaNextFishSpawnSeconds &&
      this.seaFishShadows.length < SEA_MAX_FISH_SHADOWS
    ) {
      this.seaFishSpawnTimer = 0;
      this.seaNextFishSpawnSeconds = Phaser.Math.FloatBetween(SEA_FISH_MIN_SPAWN_SECONDS, SEA_FISH_MAX_SPAWN_SECONDS);
      this.spawnSeaFishShadow();
    }

    const anchor = this.getSeaBoatAnchorPoint();

    for (const fish of [...this.seaFishShadows]) {
      fish.sprite.x -= fish.definition.speed * deltaSeconds;
      fish.sprite.y += Math.sin(this.time.now * 0.003 + fish.id) * 0.18;
      fish.sprite.rotation = Math.sin(this.time.now * 0.002 + fish.id) * 0.08;

      if (fish.sprite.x < anchor.x - Math.max(560, this.scale.width * 0.62)) {
        this.removeSeaFishShadow(fish);
      }
    }
  }

  private spawnSeaFishShadow(): void {
    const anchor = this.getSeaBoatAnchorPoint();
    const definition = this.pickSeaFishDefinition();
    const x = anchor.x + Math.max(560, this.scale.width * 0.72);
    const y = anchor.y + Phaser.Math.Between(-220, 230);
    const sprite = this.add.image(x, y, definition.texture).setDepth(3).setAlpha(0.62);

    sprite.setDisplaySize(definition.size * 1.55, definition.size * 0.72);
    sprite.setFlipX(true);
    this.seaFishShadows.push({
      id: this.seaFishIdSeed,
      definition,
      sprite,
    });
    this.seaFishIdSeed += 1;
  }

  private pickSeaFishDefinition(): FishDefinition {
    const pool: FishDefinition[] =
      this.seaVoyageProgress > 0.62
        ? [
            FISH_DEFINITIONS.silver_fish,
            FISH_DEFINITIONS.red_snapper,
            FISH_DEFINITIONS.moon_eel,
            FISH_DEFINITIONS.abyss_carp,
          ]
        : [FISH_DEFINITIONS.silver_fish, FISH_DEFINITIONS.red_snapper, FISH_DEFINITIONS.moon_eel];

    return Phaser.Utils.Array.GetRandom(pool);
  }

  private updateFishingState(): void {
    if (this.fishingPhase === "idle" || !this.fishingFish) {
      return;
    }

    if (!this.fishingFish.sprite.active) {
      this.resetFishingState();
      return;
    }

    this.fishingBobber?.setPosition(
      this.fishingFish.sprite.x,
      this.fishingFish.sprite.y - 20 + Math.sin(this.time.now * 0.012) * 4,
    );

    if (this.fishingPhase === "waiting" && this.time.now >= this.fishingBiteReadyAt) {
      this.fishingPhase = "bite";
      this.fishingBobber?.setTint(0xff4b38);
      this.showMessage("咬钩了！按 E 收竿。");
      return;
    }

    if (this.fishingPhase === "bite" && this.time.now > this.fishingBiteExpiresAt) {
      this.showMessage("鱼跑掉了。");
      this.removeSeaFishShadow(this.fishingFish);
      this.resetFishingState();
    }
  }

  private tryHandleSeaFishingAction(): boolean {
    if (this.currentMapKind !== "sea") {
      return false;
    }

    if (this.bigFishState === "appearing" || this.bigFishState === "caught") {
      this.showMessage("先稳住船。");
      return true;
    }

    if (this.bigFishState === "pulling") {
      this.pullBigFishWithActiveBear();
      return true;
    }

    if (this.fishingPhase === "waiting") {
      this.showMessage("你收回了鱼竿。");
      this.resetFishingState();
      return true;
    }

    if (this.fishingPhase === "bite" && this.fishingFish) {
      this.finishFishingCatch(this.fishingFish);
      return true;
    }

    const fish = this.findNearestSeaFishShadow();

    if (!fish) {
      this.showMessage("水面太安静，等鱼影靠近船边再抛竿。");
      return true;
    }

    this.startFishingForFish(fish);
    return true;
  }

  private getSeaFishingHint(): string | null {
    if (this.currentMapKind !== "sea") {
      return null;
    }

    if (this.bigFishState === "pulling") {
      return `E 拉紧鱼线 ${Math.round(this.bigFishPull)}% | Tab 换另一只熊合力`;
    }

    if (this.bigFishState === "appearing" || this.bigFishState === "caught") {
      return "稳住船，别让线断掉";
    }

    if (this.fishingPhase === "bite") {
      return "E 收竿！";
    }

    if (this.fishingPhase === "waiting") {
      return "等待咬钩 | E 取消钓鱼";
    }

    const fish = this.findNearestSeaFishShadow();
    return fish ? `E 抛竿钓${fish.definition.name}` : "等待鱼影靠近";
  }

  private findNearestSeaFishShadow(): FishShadowActor | undefined {
    if (!this.seaBoatAnchor) {
      return undefined;
    }

    let nearest: FishShadowActor | undefined;
    let nearestDistance = SEA_FISH_CAST_RADIUS;

    for (const fish of this.seaFishShadows) {
      const distance = Phaser.Math.Distance.Between(this.seaBoatAnchor.x, this.seaBoatAnchor.y, fish.sprite.x, fish.sprite.y);

      if (distance <= nearestDistance && fish.sprite.x > this.seaBoatAnchor.x - 120) {
        nearest = fish;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private startFishingForFish(fish: FishShadowActor): void {
    this.fishingPhase = "waiting";
    this.fishingFish = fish;
    this.fishingBiteReadyAt = this.time.now + fish.definition.minBiteSeconds * 1000 + Phaser.Math.Between(0, Math.round((fish.definition.maxBiteSeconds - fish.definition.minBiteSeconds) * 1000));
    this.fishingBiteExpiresAt = this.fishingBiteReadyAt + SEA_FISH_BITE_WINDOW_SECONDS * 1000;
    this.fishingBobber?.destroy();
    this.fishingBobber = this.add.image(fish.sprite.x, fish.sprite.y - 20, "fishing_bobber").setDepth(7);
    this.fishingBobber.setDisplaySize(22, 30);
    fish.sprite.setAlpha(0.92);
    this.showMessage(`${this.activeBear.name}抛出鱼竿，目标是${fish.definition.name}。`);
  }

  private finishFishingCatch(fish: FishShadowActor): void {
    const reward = fish.definition.meatReward;

    this.addInventoryToBear(this.activeBear, "fishMeat", reward);
    this.showHealingBurst(fish.sprite.x, fish.sprite.y);
    this.showMessage(`${this.activeBear.name}钓到${fish.definition.name}，鱼肉 +${reward}。`);
    this.removeSeaFishShadow(fish);
    this.resetFishingState();
  }

  private resetFishingState(): void {
    if (this.fishingFish?.sprite.active) {
      this.fishingFish.sprite.setAlpha(0.62);
    }

    this.fishingPhase = "idle";
    this.fishingFish = undefined;
    this.fishingBiteReadyAt = 0;
    this.fishingBiteExpiresAt = 0;
    this.fishingBobber?.destroy();
    this.fishingBobber = undefined;
  }

  private removeSeaFishShadow(fish: FishShadowActor): void {
    fish.sprite.destroy();
    this.seaFishShadows = this.seaFishShadows.filter((candidate) => candidate !== fish);
  }

  private startBigFishFinale(): void {
    if (this.isSeaFinaleActive || this.hasCompletedSeaFinale || this.currentMapKind !== "sea") {
      return;
    }

    this.resetFishingState();

    for (const fish of [...this.seaFishShadows]) {
      this.removeSeaFishShadow(fish);
    }

    this.isSeaFinaleActive = true;
    this.bigFishState = "appearing";
    this.bigFishPull = 0;
    this.bigFishLastPullBearId = undefined;
    this.clearEnemies();

    const anchor = this.getSeaBoatAnchorPoint();
    this.bigFishSprite?.destroy();
    this.bigFishSprite = this.add.image(anchor.x + 720, anchor.y + 128, "big_fish").setDepth(4).setAlpha(0);
    this.bigFishSprite.setDisplaySize(360, 158);
    this.bigFishSprite.setFlipX(true);
    this.showMessage("海面忽然安静了。一只大鱼咬住了线。");
    this.cameras.main.shake(420, 0.008);

    this.tweens.add({
      targets: this.bigFishSprite,
      x: anchor.x + 260,
      y: anchor.y + 118,
      alpha: 0.9,
      duration: 1200,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.currentMapKind !== "sea" || this.hasCompletedSeaFinale) {
          return;
        }

        this.bigFishState = "pulling";
        this.showMessage("交替 Tab 切换一二和布布，再按 E 合作用力！");
      },
    });
  }

  private updateBigFishFinale(deltaSeconds: number): void {
    if (!this.isSeaFinaleActive || !this.bigFishSprite || !this.seaBoatAnchor) {
      return;
    }

    if (this.bigFishState === "pulling") {
      this.bigFishPull = Phaser.Math.Clamp(
        this.bigFishPull - BIG_FISH_PULL_DECAY_PER_SECOND * deltaSeconds,
        0,
        BIG_FISH_PULL_TARGET,
      );
      this.bigFishSprite.setPosition(
        this.seaBoatAnchor.x + 260 + Math.sin(this.time.now * 0.006) * 22,
        this.seaBoatAnchor.y + 118 + Math.cos(this.time.now * 0.004) * 12,
      );
      this.bigFishSprite.setAlpha(0.72 + this.bigFishPull / 360);
    }
  }

  private pullBigFishWithActiveBear(): void {
    const isAlternating = this.bigFishLastPullBearId !== this.activeBearId;
    const gain = isAlternating ? BIG_FISH_PULL_GAIN : BIG_FISH_REPEAT_PULL_GAIN;

    this.bigFishPull = Phaser.Math.Clamp(this.bigFishPull + gain, 0, BIG_FISH_PULL_TARGET);
    this.bigFishLastPullBearId = this.activeBearId;
    this.cameras.main.shake(90, isAlternating ? 0.004 : 0.0015);
    this.showMessage(
      isAlternating
        ? `${this.activeBear.name}接力拉线！${Math.round(this.bigFishPull)}%`
        : "需要换另一只熊接力，连续同一只熊使不上劲。",
    );

    if (this.bigFishPull >= BIG_FISH_PULL_TARGET) {
      this.completeBigFishFinale();
    }
  }

  private completeBigFishFinale(): void {
    if (this.bigFishState === "caught") {
      return;
    }

    this.bigFishState = "caught";
    this.bigFishPull = BIG_FISH_PULL_TARGET;
    const anchor = this.getSeaBoatAnchorPoint();
    this.bigFishBackSprite = this.add.image(anchor.x, anchor.y + 30, "big_fish_back").setDepth(5).setAlpha(0);
    this.bigFishBackSprite.setDisplaySize(380, 126);
    this.bigFishSprite?.setAlpha(0);
    this.seaBoatImage?.setAlpha(0.35);
    this.cameras.main.flash(520, 228, 242, 255, false);
    this.cameras.main.shake(520, 0.012);
    this.showMessage("大鱼浮出水面，带着一二和布布冲向小岛。");

    this.tweens.add({
      targets: this.bigFishBackSprite,
      alpha: 1,
      y: anchor.y + 4,
      duration: 520,
      ease: "Sine.easeOut",
    });
    this.time.delayedCall(980, () => {
      if (this.currentMapKind !== "sea") {
        return;
      }

      this.hasCompletedSeaFinale = true;
      this.dayIndex = ISLAND_START_DAY;
      this.clockSeconds = 0;
      this.phase = "Day";
      this.transitionToStage("Island");
    });
  }

  private showStageTransition(message: string): void {
    this.cameras.main.flash(360, 236, this.isAbyssMode ? 30 : 210, this.isAbyssMode ? 38 : 160, false);
    this.cameras.main.shake(this.gameStage === "Abyss" ? 420 : 180, this.gameStage === "Abyss" ? 0.012 : 0.004);
    this.showMessage(message);
  }

  private enterAbyssStage(): void {
    if (this.isAbyssMode) {
      return;
    }

    this.isAbyssMode = true;
    this.abyssOverlay?.setAlpha(0.18);
    this.showStageTransition("Day 51: 深渊黑暗模式开启。营地仍在，但它开始看着你。");
  }

  private resolveFinale(): void {
    if (this.gameEnded) {
      return;
    }

    this.gameEnded = true;
    this.stopBears();
    this.clearEnemies();
    this.setCraftingPanelVisible(false);
    this.setStoragePanelVisible(false);

    const bothAlive = this.bears.yier.stats.hp > 0 && this.bears.bubu.stats.hp > 0;
    const hasMemory = this.mapFlashbacksFound >= REQUIRED_FLASHBACKS_TO_WIN;
    const didWin = bothAlive && hasMemory;
    const text = didWin
      ? "第 60 天结束：一二和布布带着记忆撑过了深渊。通关。"
      : "第 60 天结束：深渊没有被理解。需要双熊存活并收集 4 段记忆。";

    this.finaleText?.destroy();
    this.finaleText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, text, {
        fontFamily: "sans-serif",
        fontSize: "28px",
        color: didWin ? "#ffe6a8" : "#ff9a9a",
        align: "center",
        wordWrap: {
          width: 760,
        },
        shadow: {
          offsetX: 2,
          offsetY: 2,
          color: "#120707",
          blur: 0,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1010);
    this.cameras.main.flash(600, didWin ? 240 : 90, didWin ? 210 : 20, didWin ? 150 : 30, false);
    this.showMessage(text);
  }

  private updateDomNightBrightness(darknessProgress: number): void {
    const brightness = Phaser.Math.Linear(1, NIGHT_DOM_BRIGHTNESS, darknessProgress);

    for (const bear of Object.values(this.bears)) {
      this.setVisualBrightness(bear.visual, brightness);
    }

    this.setVisualBrightness(this.fusionVisual, brightness);
  }

  private updateCampfireGlows(darknessProgress: number): void {
    for (const entry of this.campfireGlows) {
      const fuelRatio = this.getCampfireFuelRatio(entry.campfire);
      const isVisible = darknessProgress > 0.01 && this.isCampfireBurning(entry.campfire);

      entry.glow.setPosition(entry.campfire.x, entry.campfire.y);
      entry.glow.setVisible(isVisible);
      entry.glow.setAlpha((0.12 + darknessProgress * 0.36) * Phaser.Math.Clamp(fuelRatio, 0.2, 1));
    }
  }

  private updateCampfireFuel(deltaSeconds: number): void {
    if (this.phase !== "Night") {
      return;
    }

    for (const child of this.campfires.getChildren()) {
      const campfire = child as Phaser.Physics.Arcade.Image;

      if (!campfire.active) {
        continue;
      }

      const fuelSeconds = this.getCampfireFuelSeconds(campfire);
      campfire.setData("fuelSeconds", Phaser.Math.Clamp(fuelSeconds - deltaSeconds, 0, this.getCampfireMaxFuelSeconds(campfire)));
    }
  }

  private isOnlineModeEnabled(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const urlParams = new URLSearchParams(window.location.search);

    return urlParams.get("online") === "1" || env?.VITE_ONLINE === "1";
  }

  private getOnlineWsUrl(): string {
    const env = (import.meta as ImportMeta & { env?: Record<string, boolean | string | undefined> }).env;
    const configuredUrl = env?.VITE_WS_URL;

    if (typeof configuredUrl === "string" && configuredUrl.length > 0) {
      return configuredUrl;
    }

    if (typeof window !== "undefined" && env?.PROD === true) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

      return `${protocol}//${window.location.host}`;
    }

    return ONLINE_DEFAULT_WS_URL;
  }

  private connectOnlineIfEnabled(): void {
    if (!this.onlineMode) {
      return;
    }

    if (typeof WebSocket === "undefined") {
      this.onlineStatus = "Online unavailable";
      this.showMessage("当前浏览器不支持 WebSocket。");
      return;
    }

    const wsUrl = this.getOnlineWsUrl();
    this.onlineStatus = `Online connecting ${wsUrl}`;
    this.showMessage("联机模式：正在连接本地服务器。");

    this.onlineSocket = new WebSocket(wsUrl);
    this.onlineSocket.addEventListener("open", () => {
      this.onlineStatus = "Online connected";
      this.showMessage("联机模式：已连接，等待分配角色。");
    });
    this.onlineSocket.addEventListener("message", (event) => {
      this.handleOnlineMessage(event.data);
    });
    this.onlineSocket.addEventListener("close", () => {
      this.onlineStatus = "Online disconnected";
      this.onlineControlledBearId = undefined;
      this.showMessage("联机服务器已断开，单机调试仍可继续。");
    });
    this.onlineSocket.addEventListener("error", () => {
      this.onlineStatus = "Online error";
      this.showMessage("联机服务器连接失败，请先运行 npm run dev:server。");
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.onlineSocket?.close();
      this.onlineSocket = undefined;
    });
  }

  private handleOnlineMessage(rawData: unknown): void {
    if (typeof rawData !== "string") {
      return;
    }

    let message: OnlineServerMessage;

    try {
      message = JSON.parse(rawData) as OnlineServerMessage;
    } catch {
      return;
    }

    if (message.protocol !== ONLINE_PROTOCOL_VERSION) {
      return;
    }

    if (message.type === "welcome") {
      this.onlineControlledBearId = message.bearId;

      if (message.bearId) {
        this.activeBearId = message.bearId;
        this.cameras.main.startFollow(this.activeBear.sprite, true, 0.08, 0.08);
        this.showMessage(`联机模式：你控制${this.activeBear.name}。`);
      } else {
        this.showMessage("联机模式：房间已满，当前只旁观。");
      }

      return;
    }

    if (message.type === "state") {
      this.onlineConnectedCount = message.connectedCount;
      this.onlineBearTargets = message.bears;
      this.applyOnlineSnapshotToStats(message.bears.yier);
      this.applyOnlineSnapshotToStats(message.bears.bubu);
      return;
    }

    if (message.type === "error") {
      this.showMessage(message.message);
    }
  }

  private updateOnlineMovement(deltaSeconds: number): void {
    if (this.isShelteredInTent) {
      this.stopBears();
      return;
    }

    const input = this.getMovementInput();
    const canSend = this.onlineSocket?.readyState === WebSocket.OPEN && Boolean(this.onlineControlledBearId);
    const didInputChange = input.moveX !== this.onlineLastMoveX || input.moveY !== this.onlineLastMoveY;

    this.onlineInputSendTimer += deltaSeconds;

    if (!canSend || (!didInputChange && this.onlineInputSendTimer < 1 / 20)) {
      return;
    }

    this.onlineInputSendTimer = 0;
    this.onlineLastMoveX = input.moveX;
    this.onlineLastMoveY = input.moveY;
    this.onlineSocket?.send(
      JSON.stringify({
        type: "input",
        protocol: ONLINE_PROTOCOL_VERSION,
        seq: this.onlineInputSeq++,
        moveX: input.moveX,
        moveY: input.moveY,
      }),
    );
  }

  private applyOnlineBearTargets(deltaSeconds: number): void {
    const smoothing = Phaser.Math.Clamp(deltaSeconds * 14, 0, 1);

    for (const bearId of Object.keys(this.bears) as BearId[]) {
      const target = this.onlineBearTargets[bearId];
      const bear = this.bears[bearId];

      if (!target) {
        bear.sprite.setVelocity(0, 0);
        continue;
      }

      const distance = Phaser.Math.Distance.Between(bear.sprite.x, bear.sprite.y, target.x, target.y);

      if (distance > 180) {
        bear.sprite.setPosition(target.x, target.y);
      } else {
        bear.sprite.setPosition(
          Phaser.Math.Linear(bear.sprite.x, target.x, smoothing),
          Phaser.Math.Linear(bear.sprite.y, target.y, smoothing),
        );
      }

      bear.sprite.setVelocity(0, 0);
      bear.facing = target.facing;
    }
  }

  private applyOnlineSnapshotToStats(snapshot: OnlineBearSnapshot): void {
    const bear = this.bears[snapshot.id];
    bear.stats.hp = snapshot.hp;
    bear.stats.maxHp = snapshot.maxHp;
    bear.stats.hunger = snapshot.hunger;
    bear.stats.maxHunger = snapshot.maxHunger;
    bear.facing = snapshot.facing;
  }

  private getMovementInput(): { moveX: number; moveY: number } {
    const left = Boolean(this.movementKeys?.left.isDown || this.cursors?.left.isDown);
    const right = Boolean(this.movementKeys?.right.isDown || this.cursors?.right.isDown);
    const up = Boolean(this.movementKeys?.up.isDown || this.cursors?.up.isDown);
    const down = Boolean(this.movementKeys?.down.isDown || this.cursors?.down.isDown);

    return {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      moveY: (down ? 1 : 0) - (up ? 1 : 0),
    };
  }

  private updateSwitching(): void {
    if (!this.switchKey || !Phaser.Input.Keyboard.JustDown(this.switchKey)) {
      return;
    }

    this.activeBear.sprite.setVelocity(0, 0);
    this.activeBearId = this.activeBearId === "yier" ? "bubu" : "yier";
    this.cameras.main.startFollow(this.currentMapKind === "sea" && this.seaBoatAnchor ? this.seaBoatAnchor : this.activeBear.sprite, true, 0.08, 0.08);
    this.showMessage(`现在控制：${this.activeBear.name}`);
  }

  private updateSeasonHotkeys(): void {
    if (!this.seasonKeys) {
      return;
    }

    const seasons: MapSeason[] = ["Spring", "Summer", "Autumn", "Winter"];

    for (const season of seasons) {
      if (!Phaser.Input.Keyboard.JustDown(this.seasonKeys[season])) {
        continue;
      }

      if (this.currentMapKind !== "main") {
        this.switchWorldMap("main");
      }

      this.gameStage = season;
      this.mapSeason = season;
      this.mapManager.setSeason(season);
      this.matureAutumnCrops();
      this.spawnSeasonalBirds(true);
      this.weatherEventTimer = 0;
      this.showMessage(`Debug season: ${season} (day unchanged)`);
      return;
    }
  }

  private updateDebugDayHotkeys(): void {
    if (this.debugPreviousDayKey && Phaser.Input.Keyboard.JustDown(this.debugPreviousDayKey)) {
      this.debugJumpDay(-1);
    }

    if (this.debugNextDayKey && Phaser.Input.Keyboard.JustDown(this.debugNextDayKey)) {
      this.debugJumpDay(1);
    }
  }

  private debugJumpDay(deltaDays: number): void {
    const nextDay = Phaser.Math.Clamp(this.dayIndex + deltaDays, 1, TOTAL_STORY_DAYS);

    if (nextDay === this.dayIndex) {
      this.showMessage(`Debug Day ${this.dayIndex}: ${this.formatStageCountdown()}`);
      return;
    }

    this.dayIndex = nextDay;
    this.clockSeconds = 0;
    this.phase = "Day";
    this.enemySpawnTimer = 0;
    this.clearEnemies();

    const nextStage = this.getStageForDay(this.dayIndex);

    if (nextStage !== this.gameStage || !this.isMapKindCorrectForStage(nextStage)) {
      this.transitionToStage(nextStage);
    }

    this.showMessage(`Debug Day ${this.dayIndex}: ${this.formatStageCountdown()}`);
  }

  private isMapKindCorrectForStage(stage: GameStage): boolean {
    if (stage === "Sea") {
      return this.currentMapKind === "sea" || this.currentMapKind === "main";
    }

    if (stage === "Island") {
      return this.currentMapKind === "island";
    }

    return this.currentMapKind === "main";
  }

  private updateMovement(): void {
    if (this.currentMapKind === "sea") {
      this.stopBears();
      this.setSeaBoatSeatPositions();
      return;
    }

    this.ensureActiveBearCanMove();
    const bear = this.activeBear;
    const input = this.getMovementInput();
    const velocity = new Phaser.Math.Vector2(input.moveX, input.moveY);

    if (this.isShelteredInTent) {
      this.stopBears();
      return;
    }

    for (const actor of Object.values(this.bears)) {
      if (actor.id !== this.activeBearId) {
        actor.sprite.setVelocity(0, 0);
      }
    }

    if (bear.stats.hp <= 0) {
      bear.sprite.setVelocity(0, 0);
      return;
    }

    if (velocity.lengthSq() > 0) {
      velocity.normalize().scale(bear.speed * this.getActiveStageModifiers(bear).speedMultiplier);
      bear.aimDirection.copy(velocity).normalize();
    }

    if (velocity.x < -0.1) {
      bear.facing = -1;
    } else if (velocity.x > 0.1) {
      bear.facing = 1;
    }

    bear.sprite.setVelocity(velocity.x, velocity.y);
  }

  private ensureActiveBearCanMove(): void {
    const active = this.activeBear;

    if (active.stats.hp > 0) {
      this.hasShownAllBearsDown = false;
      return;
    }

    const fallbackId: BearId = active.id === "yier" ? "bubu" : "yier";
    const fallback = this.bears[fallbackId];

    if (fallback.stats.hp > 0) {
      active.sprite.setVelocity(0, 0);
      this.activeBearId = fallbackId;
      this.hasShownAllBearsDown = false;
      this.cameras.main.startFollow(
        this.currentMapKind === "sea" && this.seaBoatAnchor ? this.seaBoatAnchor : fallback.sprite,
        true,
        0.08,
        0.08,
      );
      this.showMessage(`${active.name}倒下了，已自动切换到${fallback.name}。`);
      return;
    }

    this.stopBears();

    if (!this.hasShownAllBearsDown) {
      this.hasShownAllBearsDown = true;
      this.showMessage("一二和布布都倒下了，先降低压力再继续测试。");
    }
  }

  private stopBears(): void {
    for (const bear of Object.values(this.bears)) {
      bear.sprite.setVelocity(0, 0);
    }
  }

  private updateFusionMovement(): void {
    const left = Boolean(this.movementKeys?.left.isDown || this.cursors?.left.isDown);
    const right = Boolean(this.movementKeys?.right.isDown || this.cursors?.right.isDown);
    const up = Boolean(this.movementKeys?.up.isDown || this.cursors?.up.isDown);
    const down = Boolean(this.movementKeys?.down.isDown || this.cursors?.down.isDown);
    const velocity = new Phaser.Math.Vector2(
      (right ? 1 : 0) - (left ? 1 : 0),
      (down ? 1 : 0) - (up ? 1 : 0),
    );

    if (this.bears.yier.stats.hp <= 0 && this.bears.bubu.stats.hp <= 0) {
      this.stopBears();
      return;
    }

    if (velocity.lengthSq() > 0) {
      velocity.normalize().scale(FUSION_MOVE_SPEED * this.getFusionStageSpeedMultiplier());
      this.bears.yier.aimDirection.copy(velocity).normalize();
      this.bears.bubu.aimDirection.copy(velocity).normalize();
    }

    if (velocity.x < -0.1) {
      this.bears.yier.facing = -1;
      this.bears.bubu.facing = -1;
    } else if (velocity.x > 0.1) {
      this.bears.yier.facing = 1;
      this.bears.bubu.facing = 1;
    }

    this.bears.yier.sprite.setVelocity(velocity.x, velocity.y);
    this.bears.bubu.sprite.setVelocity(velocity.x, velocity.y);
  }

  private tryStartFusion(): void {
    if (this.isShelteredInTent || this.currentMapKind === "sea") {
      return;
    }

    if (this.time.now < this.nextFusionAllowedAt) {
      return;
    }

    const yier = this.bears.yier;
    const bubu = this.bears.bubu;
    const distance = Phaser.Math.Distance.Between(yier.sprite.x, yier.sprite.y, bubu.sprite.x, bubu.sprite.y);

    if (distance > BEAR_TOUCH_DISTANCE || yier.stats.hp <= 0 || bubu.stats.hp <= 0) {
      return;
    }

    const x = (yier.sprite.x + bubu.sprite.x) / 2;
    const y = (yier.sprite.y + bubu.sprite.y) / 2;
    const fusionUrl = Phaser.Utils.Array.GetRandom([
      "/characters/yierbubu.gif",
      "/characters/yierbubu2.gif",
    ]);

    this.isFusing = true;
    this.fusionEndsAt = this.time.now + FUSION_DURATION_MS;
    this.nextFusionAllowedAt = this.fusionEndsAt + FUSION_COOLDOWN_MS;
    yier.sprite.setPosition(x, y);
    bubu.sprite.setPosition(x, y);
    this.stopBears();
    yier.visual.setVisible(false);
    bubu.visual.setVisible(false);
    this.fusionVisual?.destroy();
    this.fusionVisual = this.createAnimatedVisual(fusionUrl, x, y, 132, 106);
    this.fusionVisual.setDepth(12);
    this.cameras.main.startFollow(this.activeBear.sprite, true, 0.08, 0.08);
    this.showMessage("一二和布布触碰合体了！");
  }

  private updateFusionState(): void {
    if (!this.isFusing) {
      return;
    }

    const yier = this.bears.yier;
    const bubu = this.bears.bubu;
    const x = (yier.sprite.x + bubu.sprite.x) / 2;
    const y = (yier.sprite.y + bubu.sprite.y) / 2;

    this.fusionVisual?.setPosition(x, y - 12);

    if (this.time.now < this.fusionEndsAt) {
      return;
    }

    this.isFusing = false;
    this.fusionVisual?.destroy();
    this.fusionVisual = undefined;
    yier.sprite.setPosition(x - FUSION_RELEASE_OFFSET, y);
    bubu.sprite.setPosition(x + FUSION_RELEASE_OFFSET, y);
    this.stopBears();
    yier.visual.setVisible(true);
    bubu.visual.setVisible(true);
    this.syncAnimatedVisuals();
  }

  private updateManualActions(): void {
    if (this.minimapToggleKey && Phaser.Input.Keyboard.JustDown(this.minimapToggleKey)) {
      this.toggleMinimapVisibility();
    }

    if (this.craftMenuKey && Phaser.Input.Keyboard.JustDown(this.craftMenuKey)) {
      this.toggleCraftingPanel();
    }

    if (this.attackKey && Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.attackWithBear(this.activeBear);
    }

    if (this.pickupKey && Phaser.Input.Keyboard.JustDown(this.pickupKey)) {
      if (
        !this.tryHandleSeaFishingAction() &&
        !this.tryToggleTentShelter() &&
        !this.tryToggleStorageChest() &&
        !this.tryRefuelNearestCampfire() &&
        !this.tryCollectBirdOrUseCropPlot() &&
        !this.tryBoardSeaDock() &&
        !this.tryMapInteraction() &&
        !this.tryPickNearestWeapon() &&
        !this.tryCollectNearestResource()
      ) {
        this.tryPickNearestApple();
      }
    }

    if (this.eatKey && Phaser.Input.Keyboard.JustDown(this.eatKey)) {
      this.eatFoodOrApple(this.activeBear);
    }

    this.closeStoragePanelIfTooFar();
  }

  private updateInteractionHint(): void {
    if (!this.interactionHintText || this.gameEnded) {
      return;
    }

    this.interactionHintText.setText(this.getInteractionHintText());
  }

  private getInteractionHintText(): string {
    const bear = this.activeBear;
    const x = bear.sprite.x;
    const y = bear.sprite.y;

    if (this.isShelteredInTent) {
      return "E 离开帐篷";
    }

    const seaHint = this.getSeaFishingHint();

    if (seaHint) {
      return seaHint;
    }

    if (this.isNearTent(x, y)) {
      return this.phase === "Night" ? "E 进入帐篷避难" : "E 进入帐篷";
    }

    const chest = this.findNearestStorageChest(x, y, STORAGE_INTERACT_RADIUS);

    if (chest) {
      return this.isStoragePanelOpen ? "E 关闭储物箱" : "E 打开储物箱";
    }

    const campfire = this.findNearestCampfire(x, y, CAMPFIRE_INTERACT_RADIUS, false);

    if (campfire) {
      const fuelSeconds = this.getCampfireFuelSeconds(campfire);
      const maxFuelSeconds = this.getCampfireMaxFuelSeconds(campfire);

      if (fuelSeconds >= maxFuelSeconds) {
        return "篝火燃料已满";
      }

      return bear.inventory.wood > 0 ? `E 添加木材：篝火 +${WOOD_FUEL_SECONDS}s` : "需要木材";
    }

    const bird = this.findNearestBird(x, y, PICKUP_RADIUS);

    if (bird) {
      return this.gameStage === "Spring" ? "E 靠近鸟类收集种子" : "鸟在观察营地";
    }

    const cropHint = this.getNearestCropHint(x, y);

    if (cropHint) {
      return cropHint;
    }

    const seaDockHint = this.getSeaDockHint(x, y);

    if (seaDockHint) {
      return seaDockHint;
    }

    const mapHint = this.mapManager.getInteractionHint(bear.id, { x, y }, PICKUP_RADIUS);

    if (mapHint) {
      return mapHint;
    }

    const weapon = this.findNearestWeapon(x, y, PICKUP_RADIUS);

    if (weapon) {
      const weaponId = weapon.getData("weaponId") as WeaponId | undefined;
      return weaponId ? `E 装备${WEAPON_DEFINITIONS[weaponId].name}` : "E 拾取武器";
    }

    const resource = this.findNearestResource(x, y, PICKUP_RADIUS);

    if (resource) {
      const resourceId = resource.getData("resourceId") as ResourceId | undefined;
      return resourceId ? `E 采集${INVENTORY_ITEM_NAMES[resourceId]}` : "E 采集资源";
    }

    if (this.findNearestApple(x, y, PICKUP_RADIUS)) {
      return "E 拾取苹果";
    }

    return "";
  }

  private updateMapEvents(): void {
    const events = this.mapManager.updateDualBearState({
      yier: {
        id: "yier",
        sprite: this.bears.yier.sprite,
      },
      bubu: {
        id: "bubu",
        sprite: this.bears.bubu.sprite,
      },
    });

    for (const event of events) {
      if (event.type === "flashback") {
        this.mapFlashbacksFound += 1;
        this.cameras.main.flash(260, 224, 18, 38, false);
        this.showMessage(`${event.message} ${this.mapFlashbacksFound}/4`);
      }
    }
  }

  private tryToggleTentShelter(): boolean {
    const bear = this.activeBear;

    if (this.isShelteredInTent) {
      this.leaveTentShelter();
      return true;
    }

    if (!this.isNearTent(bear.sprite.x, bear.sprite.y)) {
      return false;
    }

    const tent = this.mapManager.getHubTentPoint();
    this.isShelteredInTent = true;
    this.setStoragePanelVisible(false);
    this.setCraftingPanelVisible(false);
    this.bears.yier.sprite.setPosition(tent.x - 24, tent.y + 58);
    this.bears.bubu.sprite.setPosition(tent.x + 24, tent.y + 58);
    this.stopBears();
    this.syncAnimatedVisuals();
    this.showMessage(this.phase === "Night" ? "两只熊躲进帐篷，影子暂时够不到它们。" : "两只熊钻进帐篷休整。");
    return true;
  }

  private leaveTentShelter(): void {
    const tent = this.mapManager.getHubTentPoint();
    this.isShelteredInTent = false;
    this.bears.yier.sprite.setPosition(tent.x - 54, tent.y + 88);
    this.bears.bubu.sprite.setPosition(tent.x + 54, tent.y + 88);
    this.stopBears();
    this.syncAnimatedVisuals();
    this.showMessage("两只熊离开帐篷。");
  }

  private isNearTent(x: number, y: number): boolean {
    if (this.currentMapKind !== "main") {
      return false;
    }

    const tent = this.mapManager.getHubTentPoint();
    return Phaser.Math.Distance.Between(x, y, tent.x, tent.y) <= TENT_INTERACT_RADIUS;
  }

  private tryToggleStorageChest(): boolean {
    const bear = this.activeBear;
    const chest = this.findNearestStorageChest(bear.sprite.x, bear.sprite.y, STORAGE_INTERACT_RADIUS);

    if (!chest) {
      return false;
    }

    this.setStoragePanelVisible(!this.isStoragePanelOpen);
    this.showMessage(this.isStoragePanelOpen ? "Camp storage opened." : "Camp storage closed.");
    return true;
  }

  private tryRefuelNearestCampfire(): boolean {
    const bear = this.activeBear;
    const campfire = this.findNearestCampfire(bear.sprite.x, bear.sprite.y, CAMPFIRE_INTERACT_RADIUS, false);

    if (!campfire) {
      return false;
    }

    if (bear.inventory.wood <= 0) {
      this.showMessage("Need 1 wood to feed the fire.");
      return true;
    }

    const maxFuelSeconds = this.getCampfireMaxFuelSeconds(campfire);
    const fuelSeconds = this.getCampfireFuelSeconds(campfire);

    if (fuelSeconds >= maxFuelSeconds) {
      this.showMessage(`Fire is already full (${Math.ceil(maxFuelSeconds)}s).`);
      return true;
    }

    bear.inventory.wood -= 1;
    campfire.setData("fuelSeconds", Phaser.Math.Clamp(fuelSeconds + WOOD_FUEL_SECONDS, 0, maxFuelSeconds));
    this.showMessage(`Added wood. Fire ${Math.ceil(this.getCampfireFuelSeconds(campfire))}s.`);
    return true;
  }

  private tryCollectBirdOrUseCropPlot(): boolean {
    const bear = this.activeBear;
    const bird = this.findNearestBird(bear.sprite.x, bear.sprite.y, PICKUP_RADIUS);

    if (bird) {
      if (this.gameStage !== "Spring") {
        this.showMessage("这只鸟不肯靠近，春天才会留下种子。");
        return true;
      }

      const seeds = Phaser.Math.Between(1, 2);
      bear.inventory.seeds += seeds;
      this.tweens.add({
        targets: bird,
        y: bird.y - 32,
        alpha: 0,
        duration: 360,
        ease: "Sine.easeIn",
        onComplete: () => bird.disableBody(true, true),
      });
      this.showMessage(`${bear.name}收集到鸟类留下的种子 +${seeds}。`);
      return true;
    }

    return this.tryUseNearestCropPlot(bear);
  }

  private getSeaDockHint(x: number, y: number): string | null {
    if (this.currentMapKind !== "main" || !this.isNearSeaDock(x, y)) {
      return null;
    }

    if (this.dayIndex < SEA_DEPARTURE_UNLOCK_DAY) {
      return "破船还没修好：第 40 天后可以从这里出海";
    }

    if (this.dayIndex >= ISLAND_START_DAY) {
      return null;
    }

    return "E 登船出海";
  }

  private tryBoardSeaDock(): boolean {
    const bear = this.activeBear;

    if (this.currentMapKind !== "main" || !this.isNearSeaDock(bear.sprite.x, bear.sprite.y)) {
      return false;
    }

    if (this.dayIndex < SEA_DEPARTURE_UNLOCK_DAY) {
      this.showMessage("这艘破船还没修好。第 40 天后再来海岸准备出海。");
      return true;
    }

    if (this.dayIndex >= ISLAND_START_DAY) {
      return false;
    }

    this.dayIndex = Math.max(this.dayIndex, SEA_START_DAY);
    this.clockSeconds = 0;
    this.phase = "Day";
    this.gameStage = "Sea";
    this.clearEnemies();
    this.switchWorldMap("sea");
    this.showStageTransition("一二和布布登上破船。森林退到雾后，海面开始接管这一天。");
    return true;
  }

  private isNearSeaDock(x: number, y: number): boolean {
    const dock = this.mapManager.getSeaDockPoint();
    return Phaser.Math.Distance.Between(x, y, dock.x, dock.y) <= SEA_DOCK_INTERACT_RADIUS;
  }

  private closeStoragePanelIfTooFar(): void {
    if (!this.isStoragePanelOpen) {
      return;
    }

    const bear = this.activeBear;
    const chest = this.findNearestStorageChest(bear.sprite.x, bear.sprite.y, STORAGE_INTERACT_RADIUS + 28);

    if (!chest) {
      this.setStoragePanelVisible(false);
    }
  }

  private tryMapInteraction(): boolean {
    const bear = this.activeBear;
    const result = this.mapManager.tryInteract(bear.id, {
      x: bear.sprite.x,
      y: bear.sprite.y,
    });

    if (!result) {
      return false;
    }

    this.applyMapInteractionResult(bear, result);
    return true;
  }

  private applyMapInteractionResult(bear: BearActor, result: MapInteractionResult): void {
    if (result.type === "supply-cache") {
      const freeSlots = bear.inventory.maxApples - bear.inventory.apples;
      const pickedApples = Math.min(freeSlots, result.apples);
      bear.inventory.apples += pickedApples;
      this.addResourceToInventory(bear, "wood", result.wood);

      const appleText = pickedApples > 0 ? `苹果 +${pickedApples}` : "背包已满，苹果留在原地";
      this.showMessage(`${bear.name}打开伪装补给箱：${appleText}，木材 +${result.wood}`);
      return;
    }

    this.showMessage(result.message);
  }

  private tryCraft(recipeId: CraftRecipeId, bear: BearActor): void {
    const recipe = CRAFTING_RECIPES[recipeId];

    if (bear.stats.hp <= 0) {
      this.showMessage(`${bear.name}现在不能制作。`);
      return;
    }

    if (recipe.requiresBurningFire && !this.findNearestBurningCampfire(bear.sprite.x, bear.sprite.y, CAMPFIRE_INTERACT_RADIUS + 34)) {
      this.showMessage("Need a burning campfire nearby.");
      return;
    }

    if (!this.hasResourcesForRecipe(bear, recipe)) {
      this.showMessage(`${recipe.name}材料不足：${this.formatRecipeCosts(recipe)}`);
      return;
    }

    this.consumeRecipeCosts(bear, recipe);

    if (recipe.id === "campfire") {
      this.placeCraftedCampfire(bear);
      this.showMessage(`${bear.name}搭起了一堆篝火。`);
      return;
    }

    if (recipe.id === "wooden_spear" || recipe.id === "stone_club") {
      bear.weaponId = recipe.id;
      this.showMessage(`${bear.name}制作并装备了${recipe.name}。`);
      return;
    }

    if (recipe.id === "cooked_apple") {
      bear.stats.hunger = Phaser.Math.Clamp(
        bear.stats.hunger + COOKED_APPLE_HUNGER_RESTORE,
        0,
        bear.stats.maxHunger,
      );
      this.showHealingBurst(bear.sprite.x, bear.sprite.y);
      this.showMessage(`${bear.name} roasted an apple. Hunger +${COOKED_APPLE_HUNGER_RESTORE}`);
      return;
    }

    const before = bear.stats.hp;
    bear.stats.hp = Phaser.Math.Clamp(bear.stats.hp + BANDAGE_HEAL_AMOUNT, 0, bear.stats.maxHp);
    this.showHealingBurst(bear.sprite.x, bear.sprite.y);
    this.showMessage(`${bear.name}使用绷带。HP +${Math.round(bear.stats.hp - before)}`);
  }

  private hasResourcesForRecipe(bear: BearActor, recipe: CraftingRecipe): boolean {
    return Object.entries(recipe.costs).every(([itemId, amount]) => {
      return this.getInventoryAmount(bear, itemId as InventoryItemId) >= (amount ?? 0);
    });
  }

  private canCraftRecipe(bear: BearActor, recipe: CraftingRecipe): boolean {
    if (!this.hasResourcesForRecipe(bear, recipe)) {
      return false;
    }

    if (recipe.requiresBurningFire) {
      return Boolean(this.findNearestBurningCampfire(bear.sprite.x, bear.sprite.y, CAMPFIRE_INTERACT_RADIUS + 34));
    }

    return true;
  }

  private consumeRecipeCosts(bear: BearActor, recipe: CraftingRecipe): void {
    for (const [itemId, amount] of Object.entries(recipe.costs)) {
      this.addInventoryToBear(bear, itemId as InventoryItemId, -(amount ?? 0));
    }
  }

  private placeCraftedCampfire(bear: BearActor): void {
    const point = bear.aimDirection.clone().normalize().scale(46);
    const campfire = this.campfires.create(bear.sprite.x + point.x, bear.sprite.y + point.y, "crafted_campfire") as Phaser.Physics.Arcade.Image;

    campfire.setDepth(3);
    campfire.setData("permanent", false);
    campfire.setData("fuelSeconds", CRAFTED_CAMPFIRE_START_FUEL_SECONDS);
    campfire.setData("maxFuelSeconds", CRAFTED_CAMPFIRE_MAX_FUEL_SECONDS);
    campfire.refreshBody();
    this.createCampfireGlow(campfire);
    this.tweens.add({
      targets: campfire,
      scale: 1.1,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private createCampfireGlow(campfire: Phaser.Physics.Arcade.Image): void {
    const glow = this.add
      .ellipse(campfire.x, campfire.y, CAMPFIRE_SAFE_RADIUS * 2, CAMPFIRE_SAFE_RADIUS * 2, 0xffb45a, 0)
      .setDepth(901);

    glow.setStrokeStyle(2, 0xffdf91, 0.36);
    glow.setVisible(false);
    this.campfireGlows.push({
      campfire,
      glow,
    });
  }

  private formatRecipeCosts(recipe: CraftingRecipe): string {
    return Object.entries(recipe.costs)
      .map(([itemId, amount]) => `${INVENTORY_ITEM_NAMES[itemId as InventoryItemId]}x${amount}`)
      .join(" ");
  }

  private addResourceToInventory(bear: BearActor, resourceId: ResourceId, amount: number): void {
    this.addInventoryToBear(bear, resourceId, amount);
  }

  private getInventoryAmount(bear: BearActor, itemId: InventoryItemId): number {
    return bear.inventory[itemId];
  }

  private addInventoryToBear(bear: BearActor, itemId: InventoryItemId, amount: number): number {
    if (itemId === "apples") {
      const before = bear.inventory.apples;
      bear.inventory.apples = Phaser.Math.Clamp(bear.inventory.apples + amount, 0, bear.inventory.maxApples);
      return bear.inventory.apples - before;
    }

    const before = bear.inventory[itemId];
    bear.inventory[itemId] = Math.max(0, bear.inventory[itemId] + amount);
    return bear.inventory[itemId] - before;
  }

  private depositOneToStorage(itemId: InventoryItemId): void {
    const bear = this.activeBear;

    if (this.getInventoryAmount(bear, itemId) <= 0) {
      this.showMessage(`No ${INVENTORY_ITEM_NAMES[itemId]} to store.`);
      return;
    }

    this.addInventoryToBear(bear, itemId, -1);
    this.campStorage[itemId] += 1;
    this.updateStoragePanelState();
    this.showMessage(`Stored 1 ${INVENTORY_ITEM_NAMES[itemId]}.`);
  }

  private withdrawOneFromStorage(itemId: InventoryItemId): void {
    const bear = this.activeBear;

    if (this.campStorage[itemId] <= 0) {
      this.showMessage(`No ${INVENTORY_ITEM_NAMES[itemId]} in storage.`);
      return;
    }

    if (itemId === "apples" && bear.inventory.apples >= bear.inventory.maxApples) {
      this.showMessage(`${bear.name}'s apple bag is full.`);
      return;
    }

    const added = this.addInventoryToBear(bear, itemId, 1);

    if (added <= 0) {
      this.showMessage(`${bear.name} cannot carry more ${INVENTORY_ITEM_NAMES[itemId]}.`);
      return;
    }

    this.campStorage[itemId] -= 1;
    this.updateStoragePanelState();
    this.showMessage(`Took 1 ${INVENTORY_ITEM_NAMES[itemId]}.`);
  }

  private attackWithBear(bear: BearActor): void {
    if (bear.stats.hp <= 0) {
      this.showMessage(`${bear.name}现在不能战斗。`);
      return;
    }

    if (this.time.now < bear.nextAttackAllowedAt) {
      return;
    }

    const weapon = WEAPON_DEFINITIONS[bear.weaponId];
    const aim = bear.aimDirection.clone().normalize();
    let hitCount = 0;

    bear.nextAttackAllowedAt = this.time.now + weapon.cooldownMs;

    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;

      if (!enemy.active || !this.isEnemyInsideAttackArc(bear, enemy, weapon, aim)) {
        continue;
      }

      this.damageEnemy(enemy, bear, weapon, aim);
      hitCount += 1;
    }

    this.showAttackArc(bear, weapon, aim, hitCount > 0);

    if (hitCount === 0) {
      this.showMessage(`${bear.name}挥动${weapon.name}，没有击中。`);
    }
  }

  private isEnemyInsideAttackArc(
    bear: BearActor,
    enemy: Phaser.Physics.Arcade.Sprite,
    weapon: WeaponDefinition,
    aim: Phaser.Math.Vector2,
  ): boolean {
    const toEnemy = new Phaser.Math.Vector2(enemy.x - bear.sprite.x, enemy.y - bear.sprite.y);
    const distance = toEnemy.length();

    if (distance <= 18) {
      return true;
    }

    if (distance > weapon.range) {
      return false;
    }

    return toEnemy.normalize().dot(aim) >= weapon.coneDot;
  }

  private damageEnemy(
    enemy: Phaser.Physics.Arcade.Sprite,
    bear: BearActor,
    weapon: WeaponDefinition,
    aim: Phaser.Math.Vector2,
  ): void {
    const currentHp = (enemy.getData("hp") as number | undefined) ?? ENEMY_MAX_HP;
    const damage = this.getWeaponDamageForBear(bear, weapon);
    const nextHp = currentHp - damage;
    const knockback = aim.clone().scale(weapon.knockback);

    enemy.setData("hp", nextHp);
    enemy.setData("stunnedUntil", this.time.now + 180);
    enemy.setVelocity(knockback.x, knockback.y);
    enemy.setTint(0xff6b6b);
    this.showHitBurst(enemy.x, enemy.y, damage);

    this.time.delayedCall(120, () => {
      if (enemy.active) {
        enemy.clearTint();
      }
    });

    if (nextHp > 0) {
      this.showMessage(`${bear.name}用${weapon.name}击中了影子。`);
      return;
    }

    this.showEnemyDeath(enemy);
    this.showMessage(`${bear.name}击散了一团影子。`);
  }

  private getWeaponDamageForBear(bear: BearActor, weapon: WeaponDefinition): number {
    if (bear.id === "bubu" && weapon.id === "stone_club") {
      return Math.round(weapon.damage * 1.25);
    }

    if (bear.id === "yier" && weapon.id === "wooden_spear") {
      return Math.round(weapon.damage * 1.15);
    }

    return weapon.damage;
  }

  private getActiveStageModifiers(bear: BearActor): StageModifiers {
    if (this.gameStage === "Summer" && bear.id === "yier") {
      return { hungerMultiplier: 1.8, speedMultiplier: 0.92 };
    }

    if (this.gameStage === "Autumn") {
      return { hungerMultiplier: 0.9, speedMultiplier: 1 };
    }

    if (this.gameStage === "Winter") {
      if (bear.id === "yier") {
        return { hungerMultiplier: 0.55, speedMultiplier: 1.04 };
      }

      const nearFire = Boolean(this.findNearestBurningCampfire(bear.sprite.x, bear.sprite.y, CAMPFIRE_SLOW_RADIUS));
      return nearFire ? { hungerMultiplier: 1.25, speedMultiplier: 0.9 } : { hungerMultiplier: 2.2, speedMultiplier: 0.65 };
    }

    if (this.gameStage === "Sea") {
      return { hungerMultiplier: 1.25, speedMultiplier: 0.85 };
    }

    if (this.gameStage === "Island") {
      return { hungerMultiplier: 1.1, speedMultiplier: 1 };
    }

    if (this.gameStage === "Abyss") {
      return { hungerMultiplier: bear.id === "yier" ? 1.15 : 1.35, speedMultiplier: 1 };
    }

    return { hungerMultiplier: 1, speedMultiplier: 1 };
  }

  private getFusionStageSpeedMultiplier(): number {
    const yier = this.getActiveStageModifiers(this.bears.yier).speedMultiplier;
    const bubu = this.getActiveStageModifiers(this.bears.bubu).speedMultiplier;

    return (yier + bubu) / 2;
  }

  private updateHunger(deltaSeconds: number): void {
    const phaseMultiplier = this.phase === "Night" ? NIGHT_HUNGER_MULTIPLIER : 1;

    for (const bear of Object.values(this.bears)) {
      if (bear.stats.hp <= 0) {
        bear.sprite.setVelocity(0, 0);
        bear.sprite.setTint(0x555555);
        continue;
      }

      bear.sprite.clearTint();
      const stageModifiers = this.getActiveStageModifiers(bear);
      bear.stats.hunger = Phaser.Math.Clamp(
        bear.stats.hunger - HUNGER_DRAIN_PER_SECOND * phaseMultiplier * stageModifiers.hungerMultiplier * deltaSeconds,
        0,
        bear.stats.maxHunger,
      );

      if (bear.stats.hunger <= 0) {
        bear.stats.hp = Phaser.Math.Clamp(
          bear.stats.hp - STARVING_HP_DRAIN_PER_SECOND * deltaSeconds,
          0,
          bear.stats.maxHp,
        );
      }
    }
  }

  private updateBearComfort(deltaSeconds: number): void {
    for (const bear of Object.values(this.bears)) {
      const targetTemperature = this.getTargetTemperatureForBear(bear);
      const hydrationDrain = this.getHydrationDrainForBear(bear);
      const hydrationRainRestore = this.weatherKind === "rain" ? 0.018 : 0;

      bear.temperature = Phaser.Math.Linear(bear.temperature, targetTemperature, Phaser.Math.Clamp(deltaSeconds * 0.45, 0, 1));
      bear.hydration = Phaser.Math.Clamp(bear.hydration - hydrationDrain * deltaSeconds + hydrationRainRestore * deltaSeconds, 0, 100);
      bear.condition = this.getBearCondition(bear);
    }
  }

  private getTargetTemperatureForBear(bear: BearActor): number {
    let target = 37;

    if (this.gameStage === "Summer") {
      target = bear.id === "yier" ? 39.1 : 37.8;
    } else if (this.gameStage === "Winter") {
      target = bear.id === "yier" ? 36.3 : 34.7;
    } else if (this.gameStage === "Sea") {
      target = 36.2;
    } else if (this.gameStage === "Island") {
      target = 37.4;
    } else if (this.gameStage === "Abyss") {
      target = bear.id === "yier" ? 36.2 : 35.7;
    }

    if (this.weatherKind === "rain") {
      target -= bear.id === "yier" ? 0.2 : 0.45;
    } else if (this.weatherKind === "snow") {
      target -= bear.id === "yier" ? 0.25 : 0.75;
    } else if (this.weatherKind === "sun") {
      target += bear.id === "yier" ? 0.55 : 0.25;
    }

    if (this.isShelteredInTent) {
      target = Phaser.Math.Linear(target, 37, 0.45);
    }

    return target;
  }

  private getHydrationDrainForBear(bear: BearActor): number {
    let drain = HYDRATION_DRAIN_PER_SECOND;

    if (this.gameStage === "Summer") {
      drain *= bear.id === "yier" ? 2.4 : 1.35;
    } else if (this.gameStage === "Sea") {
      drain *= 1.25;
    } else if (this.gameStage === "Winter") {
      drain *= 0.72;
    }

    return drain;
  }

  private getBearCondition(bear: BearActor): BearCondition {
    if (bear.stats.hunger / bear.stats.maxHunger < 0.22) {
      return "饿了";
    }

    if (bear.hydration < 34) {
      return "缺水";
    }

    if (bear.temperature < 35.6) {
      return "寒冷";
    }

    if (bear.temperature > 38.2) {
      return "好热";
    }

    return "健康";
  }

  private updateWeather(deltaSeconds: number): void {
    this.updateWeatherKind(deltaSeconds);
    this.collectRainWater(deltaSeconds);
    this.renderWeatherEffects();
  }

  private updateWeatherKind(deltaSeconds: number): void {
    if (this.currentMapKind !== "main") {
      this.weatherKind = "clear";
      return;
    }

    if (this.gameStage === "Spring") {
      this.weatherEventTimer -= deltaSeconds;

      if (this.weatherEventTimer <= 0) {
        this.springRainActive = Phaser.Math.Between(0, 100) < 58;
        this.weatherEventTimer = Phaser.Math.FloatBetween(this.springRainActive ? 7 : 4, this.springRainActive ? 13 : 9);
      }

      this.weatherKind = this.springRainActive ? "rain" : "clear";
      return;
    }

    if (this.gameStage === "Summer") {
      this.weatherKind = "sun";
      return;
    }

    if (this.gameStage === "Winter") {
      this.weatherKind = "snow";
      return;
    }

    this.weatherKind = "clear";
  }

  private collectRainWater(deltaSeconds: number): void {
    if (this.weatherKind !== "rain" || this.currentMapKind !== "main") {
      return;
    }

    this.rainWaterProgress += RAIN_WATER_PER_SECOND * deltaSeconds;

    while (this.rainWaterProgress >= 1) {
      this.rainWaterProgress -= 1;
      this.campStorage.water += 1;
    }
  }

  private renderWeatherEffects(): void {
    if (!this.weatherGraphics || !this.sunOverlay) {
      return;
    }

    this.weatherGraphics.clear();
    this.sunOverlay.setAlpha(this.weatherKind === "sun" ? 0.13 : 0);

    if (this.weatherKind === "rain") {
      this.weatherGraphics.fillStyle(0x14324b, 0.16);
      this.weatherGraphics.fillRect(0, 0, this.scale.width, this.scale.height);
      this.weatherGraphics.lineStyle(2, 0x9dd2ff, 0.52);

      for (let index = 0; index < 68; index += 1) {
        const x = (index * 37 + this.time.now * 0.22) % (this.scale.width + 80);
        const y = (index * 53 + this.time.now * 0.62) % (this.scale.height + 80);
        this.weatherGraphics.lineBetween(x, y - 34, x - 12, y + 24);
      }
    } else if (this.weatherKind === "snow") {
      this.weatherGraphics.fillStyle(0xc9e6ff, 0.11);
      this.weatherGraphics.fillRect(0, 0, this.scale.width, this.scale.height);
      this.weatherGraphics.fillStyle(0xf4fbff, 0.72);

      for (let index = 0; index < 56; index += 1) {
        const x = (index * 47 + Math.sin(this.time.now * 0.001 + index) * 18) % this.scale.width;
        const y = (index * 41 + this.time.now * 0.045) % this.scale.height;
        this.weatherGraphics.fillCircle(x, y, index % 3 === 0 ? 2.4 : 1.6);
      }
    } else if (this.weatherKind === "sun") {
      this.weatherGraphics.fillStyle(0xffd27a, 0.16);
      this.weatherGraphics.fillTriangle(this.scale.width, 0, this.scale.width - 360, 0, this.scale.width, 220);
      this.weatherGraphics.lineStyle(3, 0xffe1a0, 0.28);

      for (let index = 0; index < 7; index += 1) {
        const offset = index * 42;
        this.weatherGraphics.lineBetween(this.scale.width - 20 - offset, 0, this.scale.width - 220 - offset, 150 + offset * 0.2);
      }
    }
  }

  private updateAppleRespawn(deltaSeconds: number): void {
    if (this.currentMapKind === "sea") {
      return;
    }

    this.appleRespawnTimer += deltaSeconds;

    if (this.appleRespawnTimer < APPLE_RESPAWN_SECONDS) {
      return;
    }

    this.appleRespawnTimer = 0;
    this.trySpawnRandomApple();
  }

  private updateBirdSpawn(deltaSeconds: number): void {
    if (this.currentMapKind !== "main" || this.gameStage !== "Spring") {
      this.clearBirds();
      return;
    }

    this.birdSpawnTimer += deltaSeconds;

    if (this.birdSpawnTimer < this.nextBirdSpawnSeconds) {
      return;
    }

    this.birdSpawnTimer = 0;
    this.nextBirdSpawnSeconds = Phaser.Math.FloatBetween(BIRD_MIN_SPAWN_SECONDS, BIRD_MAX_SPAWN_SECONDS);
    this.spawnSeasonalBirds();
  }

  private clearBirds(): void {
    for (const child of this.birds.getChildren()) {
      const bird = child as Phaser.Physics.Arcade.Image;

      if (bird.active) {
        bird.disableBody(true, true);
      }
    }
  }

  private updateBlackCatSpawn(deltaSeconds: number): void {
    this.blackCatSpawnTimer += deltaSeconds;

    if (this.blackCatSpawnTimer < this.nextBlackCatSpawnSeconds || this.blackCats.countActive(true) > 0) {
      return;
    }

    this.blackCatSpawnTimer = 0;
    this.nextBlackCatSpawnSeconds = Phaser.Math.FloatBetween(
      BLACK_CAT_MIN_SPAWN_SECONDS,
      BLACK_CAT_MAX_SPAWN_SECONDS,
    );
    this.spawnBlackCat();
  }

  private spawnBlackCat(): void {
    const point = Phaser.Utils.Array.GetRandom(this.appleSpawnPoints);
    const jitterX = Phaser.Math.Between(-38, 38);
    const jitterY = Phaser.Math.Between(-30, 30);
    const blackCat = this.blackCats.create(point.x + jitterX, point.y + jitterY, "black_cat") as Phaser.Physics.Arcade.Image;

    blackCat.setDepth(6);
    blackCat.setAlpha(0);
    blackCat.refreshBody();
    this.tweens.add({
      targets: blackCat,
      alpha: 1,
      y: blackCat.y - 5,
      duration: 360,
      ease: "Sine.easeOut",
      yoyo: true,
    });
    this.time.delayedCall(BLACK_CAT_LIFETIME_SECONDS * 1000, () => {
      if (!blackCat.active) {
        return;
      }

      this.tweens.add({
        targets: blackCat,
        alpha: 0,
        duration: 420,
        ease: "Sine.easeIn",
        onComplete: () => blackCat.disableBody(true, true),
      });
    });
    this.showMessage("A black cat is watching from the moss.");
  }

  private trySpawnRandomApple(): void {
    if (this.apples.countActive(true) >= MAX_APPLES_ON_GROUND) {
      return;
    }

    const shuffled = Phaser.Utils.Array.Shuffle([...this.appleSpawnPoints]);
    const point = shuffled.find((candidate) => !this.hasAppleNear(candidate.x, candidate.y, 20));

    if (!point) {
      return;
    }

    const apple = this.apples.create(point.x, point.y, "apple") as Phaser.Physics.Arcade.Image;
    apple.refreshBody();
  }

  private updateNightEnemies(deltaSeconds: number): void {
    if (this.currentMapKind === "sea") {
      this.enemySpawnTimer = 0;
      this.clearEnemies();
      return;
    }

    if (this.phase === "Night") {
      this.enemySpawnTimer += deltaSeconds;

      if (this.enemySpawnTimer >= this.getEnemySpawnIntervalSeconds() && this.enemies.countActive(true) < this.getMaxNightEnemies()) {
        this.enemySpawnTimer = 0;
        this.spawnEnemy();
      }
    } else {
      this.enemySpawnTimer = 0;
      this.clearEnemies();
      return;
    }

    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;

      if (!enemy.active) {
        continue;
      }

      if (this.time.now < ((enemy.getData("stunnedUntil") as number | undefined) ?? 0)) {
        continue;
      }

      if (this.applyCampfireFear(enemy)) {
        continue;
      }

      if (this.isShelteredInTent) {
        this.circleTentWithEnemy(enemy);
      } else {
        enemy.setAlpha(0.82);
        this.physics.moveToObject(enemy, this.activeBear.sprite, this.getEnemyMoveSpeed());
      }
    }
  }

  private circleTentWithEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    const tent = this.mapManager.getHubTentPoint();
    const offset = new Phaser.Math.Vector2(enemy.x - tent.x, enemy.y - tent.y);

    if (offset.lengthSq() <= 0.1) {
      offset.set(1, 0);
    }

    const tangent = new Phaser.Math.Vector2(-offset.y, offset.x).normalize().scale(42);
    const push = offset.normalize().scale(34);
    enemy.setVelocity(tangent.x + push.x, tangent.y + push.y);
    enemy.setAlpha(0.54);
  }

  private getMaxNightEnemies(): number {
    return this.gameStage === "Abyss" ? ABYSS_MAX_ENEMIES_AT_NIGHT : MAX_ENEMIES_AT_NIGHT;
  }

  private getEnemyMoveSpeed(): number {
    return this.gameStage === "Abyss" ? ABYSS_ENEMY_SPEED : ENEMY_SPEED;
  }

  private getEnemySpawnIntervalSeconds(): number {
    return this.gameStage === "Abyss" ? 3.4 : 5;
  }

  private applyCampfireFear(enemy: Phaser.Physics.Arcade.Sprite): boolean {
    const nearest = this.findNearestBurningCampfire(enemy.x, enemy.y, CAMPFIRE_SLOW_RADIUS);

    if (!nearest) {
      return false;
    }

    const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, nearest.x, nearest.y);

    if (distance <= CAMPFIRE_SAFE_RADIUS) {
      const flee = new Phaser.Math.Vector2(enemy.x - nearest.x, enemy.y - nearest.y);

      if (flee.lengthSq() <= 0.1) {
        flee.set(1, 0);
      }

      flee.normalize().scale(CAMPFIRE_REPEL_SPEED);
      enemy.setVelocity(flee.x, flee.y);
      enemy.setAlpha(0.58);
      return true;
    }

    this.physics.moveToObject(enemy, this.activeBear.sprite, CAMPFIRE_SLOWED_ENEMY_SPEED);
    enemy.setAlpha(0.7);
    return true;
  }

  private findNearestBurningCampfire(x: number, y: number, maxDistance: number): Phaser.Physics.Arcade.Image | undefined {
    return this.findNearestCampfire(x, y, maxDistance, true);
  }

  private findNearestCampfire(
    x: number,
    y: number,
    maxDistance: number,
    burningOnly: boolean,
  ): Phaser.Physics.Arcade.Image | undefined {
    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let nearestDistance = maxDistance;

    for (const child of this.campfires.getChildren()) {
      const campfire = child as Phaser.Physics.Arcade.Image;

      if (!campfire.active || (burningOnly && !this.isCampfireBurning(campfire))) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, campfire.x, campfire.y);

      if (distance <= nearestDistance) {
        nearest = campfire;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private findNearestStorageChest(
    x: number,
    y: number,
    maxDistance: number,
  ): Phaser.Physics.Arcade.Image | undefined {
    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let nearestDistance = maxDistance;

    for (const child of this.storageChests.getChildren()) {
      const chest = child as Phaser.Physics.Arcade.Image;

      if (!chest.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, chest.x, chest.y);

      if (distance <= nearestDistance) {
        nearest = chest;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private findNearestBird(x: number, y: number, maxDistance: number): Phaser.Physics.Arcade.Image | undefined {
    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let nearestDistance = maxDistance;

    for (const child of this.birds.getChildren()) {
      const bird = child as Phaser.Physics.Arcade.Image;

      if (!bird.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, bird.x, bird.y);

      if (distance <= nearestDistance) {
        nearest = bird;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private getNearestCropPlot(x: number, y: number, maxDistance = CROP_INTERACT_RADIUS): CropPlotState | undefined {
    if (this.currentMapKind !== "main") {
      return undefined;
    }

    return this.cropPlotStates.find((plot) => {
      return Boolean(plot.sprite?.active) && Phaser.Math.Distance.Between(x, y, plot.x, plot.y) <= maxDistance;
    });
  }

  private getNearestCropHint(x: number, y: number): string | null {
    const plot = this.getNearestCropPlot(x, y);

    if (!plot) {
      return null;
    }

    if (plot.state === "empty") {
      return this.activeBear.inventory.seeds > 0 ? "E 播种" : "需要种子";
    }

    if (plot.state === "planted") {
      return this.gameStage === "Autumn" ? "E 收获成熟食物" : "作物会在秋天成熟";
    }

    return "E 收获食物";
  }

  private tryUseNearestCropPlot(bear: BearActor): boolean {
    const plot = this.getNearestCropPlot(bear.sprite.x, bear.sprite.y);

    if (!plot) {
      return false;
    }

    if (plot.state === "empty") {
      if (bear.inventory.seeds <= 0) {
        this.showMessage("需要种子才能播种。春天靠近鸟类可以收集种子。");
        return true;
      }

      bear.inventory.seeds -= 1;
      plot.state = "planted";
      this.updateCropPlotSprite(plot);
      this.showMessage(`${bear.name}把种子埋进营地土里。秋天会长出食物。`);
      return true;
    }

    if (plot.state === "planted" && this.gameStage === "Autumn") {
      plot.state = "mature";
      this.updateCropPlotSprite(plot);
    }

    if (plot.state === "planted") {
      this.showMessage("作物还在等待秋天。");
      return true;
    }

    bear.inventory.food += 1;
    plot.state = "empty";
    this.updateCropPlotSprite(plot);
    this.showHealingBurst(plot.x, plot.y);
    this.showMessage(`${bear.name}收获食物 +1。`);
    return true;
  }

  private isCampfireBurning(campfire: Phaser.Physics.Arcade.Image): boolean {
    return campfire.active && this.getCampfireFuelSeconds(campfire) > 0;
  }

  private getCampfireFuelSeconds(campfire: Phaser.Physics.Arcade.Image): number {
    return Math.max(0, (campfire.getData("fuelSeconds") as number | undefined) ?? 0);
  }

  private getCampfireMaxFuelSeconds(campfire: Phaser.Physics.Arcade.Image): number {
    return Math.max(1, (campfire.getData("maxFuelSeconds") as number | undefined) ?? CRAFTED_CAMPFIRE_MAX_FUEL_SECONDS);
  }

  private getCampfireFuelRatio(campfire: Phaser.Physics.Arcade.Image): number {
    return Phaser.Math.Clamp(this.getCampfireFuelSeconds(campfire) / this.getCampfireMaxFuelSeconds(campfire), 0, 1);
  }

  private spawnEnemy(): void {
    const point = Phaser.Utils.Array.GetRandom(this.enemySpawnPoints);
    const enemy = this.enemies.create(point.x, point.y, "shadow_enemy") as Phaser.Physics.Arcade.Sprite;
    enemy.setDepth(4);
    enemy.setAlpha(0.82);
    enemy.setData("hp", ENEMY_MAX_HP);
    enemy.setData("stunnedUntil", 0);
    enemy.body?.setSize(34, 34);
    this.showMessage("Night falls. Something is following the bears.");
  }

  private clearEnemies(): void {
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      enemy.destroy();
    }
  }

  private updateResourceRespawns(): void {
    for (const child of this.resources.getChildren()) {
      const resource = child as Phaser.Physics.Arcade.Image;
      const respawnDay = (resource.getData("respawnDay") as number | undefined) ?? 0;

      if (resource.active || respawnDay <= 0 || this.dayIndex < respawnDay) {
        continue;
      }

      resource.setData("respawnDay", 0);
      resource.enableBody(false, resource.x, resource.y, true, true);
      resource.refreshBody();
      resource.setAlpha(0);
      this.tweens.add({
        targets: resource,
        alpha: 1,
        duration: 520,
        ease: "Sine.easeOut",
      });
    }
  }

  private damageBearFromEnemy(bear: BearActor, enemy: Phaser.Physics.Arcade.Sprite): void {
    if (this.phase !== "Night" || this.isShelteredInTent || bear.stats.hp <= 0 || !enemy.active) {
      return;
    }

    bear.stats.hp = Phaser.Math.Clamp(
      bear.stats.hp - ENEMY_TOUCH_DAMAGE_PER_SECOND * (this.game.loop.delta / 1000),
      0,
      bear.stats.maxHp,
    );
    enemy.setVelocity(enemy.body?.velocity.x ? -enemy.body.velocity.x : 0, enemy.body?.velocity.y ? -enemy.body.velocity.y : 0);
  }

  private healBearFromBlackCat(bear: BearActor, blackCat: Phaser.Physics.Arcade.Image): void {
    if (!blackCat.active || bear.stats.hp <= 0) {
      return;
    }

    const before = bear.stats.hp;
    bear.stats.hp = Phaser.Math.Clamp(bear.stats.hp + BLACK_CAT_HEAL_AMOUNT, 0, bear.stats.maxHp);
    blackCat.disableBody(true, true);
    this.showHealingBurst(blackCat.x, blackCat.y);
    this.showMessage(`${bear.name} met the black cat. HP +${Math.round(bear.stats.hp - before)}`);
  }

  private showAttackArc(bear: BearActor, weapon: WeaponDefinition, aim: Phaser.Math.Vector2, didHit: boolean): void {
    const centerX = bear.sprite.x + aim.x * weapon.range * 0.5;
    const centerY = bear.sprite.y + aim.y * weapon.range * 0.5;
    const arc = this.add
      .ellipse(centerX, centerY, weapon.range * 0.98, weapon.range * 0.5, didHit ? 0xffd37a : 0xd9edf0, didHit ? 0.36 : 0.22)
      .setRotation(aim.angle())
      .setDepth(22);

    arc.setStrokeStyle(2, didHit ? 0xffefb1 : 0x9fb8c6, didHit ? 0.72 : 0.45);
    this.tweens.add({
      targets: arc,
      alpha: 0,
      scaleX: 1.22,
      scaleY: 1.16,
      duration: 150,
      ease: "Sine.easeOut",
      onComplete: () => arc.destroy(),
    });
  }

  private showHitBurst(x: number, y: number, damage: number): void {
    const burst = this.add.circle(x, y, 10, 0xff625f, 0.72).setDepth(23);
    const text = this.add
      .text(x, y - 26, `-${damage}`, {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#ffdfbf",
        shadow: {
          offsetX: 1,
          offsetY: 1,
          color: "#2a0808",
          blur: 0,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(24);

    this.tweens.add({
      targets: burst,
      radius: 26,
      alpha: 0,
      duration: 210,
      ease: "Sine.easeOut",
      onComplete: () => burst.destroy(),
    });
    this.tweens.add({
      targets: text,
      y: y - 48,
      alpha: 0,
      duration: 460,
      ease: "Sine.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  private showEnemyDeath(enemy: Phaser.Physics.Arcade.Sprite): void {
    const x = enemy.x;
    const y = enemy.y;
    const cloud = this.add.circle(x, y, 18, 0x120711, 0.72).setDepth(23);

    enemy.destroy();
    this.tweens.add({
      targets: cloud,
      radius: 46,
      alpha: 0,
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => cloud.destroy(),
    });
  }

  private showResourcePickupBurst(x: number, y: number, resourceId: ResourceId): void {
    const color = resourceId === "wood" ? 0xb88442 : resourceId === "stone" ? 0xaeb7aa : 0x74b957;
    const burst = this.add.circle(x, y, 8, color, 0.72).setDepth(21);

    this.tweens.add({
      targets: burst,
      radius: 24,
      alpha: 0,
      duration: 280,
      ease: "Sine.easeOut",
      onComplete: () => burst.destroy(),
    });
  }

  private showHealingBurst(x: number, y: number): void {
    const ring = this.add.circle(x, y, 12, 0x6df0b0, 0).setDepth(20);

    ring.setStrokeStyle(3, 0x6df0b0, 0.95);
    this.tweens.add({
      targets: ring,
      radius: 38,
      alpha: 0,
      duration: 620,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });

    const text = this.add
      .text(x, y - 34, "+HP", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#9dffd0",
        shadow: {
          offsetX: 1,
          offsetY: 1,
          color: "#102016",
          blur: 0,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.tweens.add({
      targets: text,
      y: y - 58,
      alpha: 0,
      duration: 760,
      ease: "Sine.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  private tryPickNearestApple(): void {
    const bear = this.activeBear;

    if (bear.stats.hp <= 0) {
      this.showMessage(`${bear.name} cannot move.`);
      return;
    }

    if (bear.inventory.apples >= bear.inventory.maxApples) {
      this.showMessage(`${bear.name}'s backpack is full.`);
      return;
    }

    const apple = this.findNearestApple(bear.sprite.x, bear.sprite.y, PICKUP_RADIUS);

    if (!apple) {
      this.showMessage("No apple nearby.");
      return;
    }

    apple.disableBody(true, true);
    bear.inventory.apples += 1;
    this.showMessage(`${bear.name} picked up an apple. Backpack ${bear.inventory.apples}/${bear.inventory.maxApples}`);
  }

  private tryPickNearestWeapon(): boolean {
    const bear = this.activeBear;

    if (bear.stats.hp <= 0) {
      this.showMessage(`${bear.name}现在不能拿武器。`);
      return true;
    }

    const pickup = this.findNearestWeapon(bear.sprite.x, bear.sprite.y, PICKUP_RADIUS);

    if (!pickup) {
      return false;
    }

    const weaponId = pickup.getData("weaponId") as WeaponId | undefined;

    if (!weaponId || weaponId === "claws") {
      return false;
    }

    bear.weaponId = weaponId;
    pickup.disableBody(true, true);
    this.showMessage(`${bear.name}装备了${WEAPON_DEFINITIONS[weaponId].name}。空格攻击。`);
    return true;
  }

  private tryCollectNearestResource(): boolean {
    const bear = this.activeBear;

    if (bear.stats.hp <= 0) {
      this.showMessage(`${bear.name}现在不能采集。`);
      return true;
    }

    const node = this.findNearestResource(bear.sprite.x, bear.sprite.y, PICKUP_RADIUS);

    if (!node) {
      return false;
    }

    const resourceId = node.getData("resourceId") as ResourceId | undefined;
    const amount = (node.getData("amount") as number | undefined) ?? 1;

    if (!resourceId) {
      return false;
    }

    this.addResourceToInventory(bear, resourceId, amount);
    node.setData("respawnDay", this.dayIndex + RESOURCE_RESPAWN_DAYS[resourceId]);
    node.disableBody(true, true);
    this.showResourcePickupBurst(node.x, node.y, resourceId);
    this.showMessage(
      `${bear.name}采集到${RESOURCE_DEFINITIONS[resourceId].name} +${amount}，约 ${RESOURCE_RESPAWN_DAYS[resourceId]} 天后再生。`,
    );
    return true;
  }

  private eatFoodOrApple(bear: BearActor): void {
    if (bear.stats.hp <= 0) {
      this.showMessage(`${bear.name} cannot eat right now.`);
      return;
    }

    if (bear.inventory.apples > 0) {
      bear.inventory.apples -= 1;
      bear.stats.hunger = Phaser.Math.Clamp(
        bear.stats.hunger + APPLE_HUNGER_RESTORE,
        0,
        bear.stats.maxHunger,
      );
      this.showMessage(`${bear.name} ate an apple. Hunger +${APPLE_HUNGER_RESTORE}`);
      return;
    }

    if (bear.inventory.food > 0) {
      bear.inventory.food -= 1;
      bear.stats.hunger = Phaser.Math.Clamp(
        bear.stats.hunger + FOOD_HUNGER_RESTORE,
        0,
        bear.stats.maxHunger,
      );
      this.showMessage(`${bear.name} ate stored food. Hunger +${FOOD_HUNGER_RESTORE}`);
      return;
    }

    if (bear.inventory.fishMeat > 0) {
      bear.inventory.fishMeat -= 1;
      bear.stats.hunger = Phaser.Math.Clamp(
        bear.stats.hunger + FISH_MEAT_HUNGER_RESTORE,
        0,
        bear.stats.maxHunger,
      );
      this.showMessage(`${bear.name} ate fish meat. Hunger +${FISH_MEAT_HUNGER_RESTORE}`);
      return;
    }

    this.showMessage(`${bear.name}'s backpack has no food.`);
  }

  private findNearestApple(
    x: number,
    y: number,
    maxDistance: number,
  ): Phaser.Physics.Arcade.Image | undefined {
    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let nearestDistance = maxDistance;

    for (const child of this.apples.getChildren()) {
      const apple = child as Phaser.Physics.Arcade.Image;

      if (!apple.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, apple.x, apple.y);

      if (distance <= nearestDistance) {
        nearest = apple;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private findNearestWeapon(
    x: number,
    y: number,
    maxDistance: number,
  ): Phaser.Physics.Arcade.Image | undefined {
    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let nearestDistance = maxDistance;

    for (const child of this.weapons.getChildren()) {
      const weapon = child as Phaser.Physics.Arcade.Image;

      if (!weapon.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, weapon.x, weapon.y);

      if (distance <= nearestDistance) {
        nearest = weapon;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private findNearestResource(
    x: number,
    y: number,
    maxDistance: number,
  ): Phaser.Physics.Arcade.Image | undefined {
    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let nearestDistance = maxDistance;

    for (const child of this.resources.getChildren()) {
      const resource = child as Phaser.Physics.Arcade.Image;

      if (!resource.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, resource.x, resource.y);

      if (distance <= nearestDistance) {
        nearest = resource;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private hasAppleNear(x: number, y: number, maxDistance: number): boolean {
    return Boolean(this.findNearestApple(x, y, maxDistance));
  }

  private refreshHud(): void {
    if (!this.hudInfoText) {
      return;
    }

    const yier = this.bears.yier;
    const bubu = this.bears.bubu;
    const active = this.activeBear;
    const dayProgress = this.clockSeconds / DAY_LENGTH_SECONDS;
    const timeColor = this.phase === "Night" ? 0x6d7cff : 0xf0c85a;
    const currentZone = this.getCurrentZone();

    this.hudMeters.time.color = timeColor;
    this.updateCircularMeter(
      this.hudMeters.hp,
      active.stats.hp / active.stats.maxHp,
      `${Math.ceil(active.stats.hp)}/${active.stats.maxHp}`,
    );
    this.updateCircularMeter(
      this.hudMeters.hunger,
      active.stats.hunger / active.stats.maxHunger,
      `${Math.ceil(active.stats.hunger)}/${active.stats.maxHunger}`,
    );
    this.updateCircularMeter(this.hudMeters.time, dayProgress, `${this.phase} ${Math.round(dayProgress * 100)}%`);
    this.renderQuestTracker();

    this.hudInfoText.setText(
      [
        this.formatOnlineStatus(),
        this.formatBearStats(yier),
        this.formatBearStats(bubu),
        "",
        `${this.formatNearbyFireStatus(active)} | Shelter ${this.isShelteredInTent ? "Tent" : "--"} | Weather ${this.formatWeatherName()}`,
        `Storage A${this.campStorage.apples}/F${this.campStorage.food}/Fish${this.campStorage.fishMeat}/Seed${this.campStorage.seeds}/Water${this.campStorage.water}/W${this.campStorage.wood}/S${this.campStorage.stone}/G${this.campStorage.grass}`,
        `Day ${this.dayIndex} | Area ${currentZone?.displayName ?? "未知区域"} | Ground apples ${this.apples.countActive(
          true,
        )}/${MAX_APPLES_ON_GROUND} | Night enemies ${this.enemies.countActive(
          true,
        )} | Resources ${this.resources.countActive(true)} | Weapons ${this.weapons.countActive(true)} | Fires ${this.campfires.countActive(
          true,
        )} | Black cat ${this.blackCats.countActive(
          true,
        )} | Stage ${this.gameStage} | Season ${this.mapSeason} | Flashbacks ${this.mapFlashbacksFound}/4`,
      ].join("\n"),
    );

    for (const bear of Object.values(this.bears)) {
      bear.visual.setAlpha(bear.id === this.activeBearId ? 1 : 0.68);
    }

    if (this.isCraftingPanelOpen) {
      this.updateCraftingPanelState();
    }

    if (this.isStoragePanelOpen) {
      this.updateStoragePanelState();
    }
  }

  private formatStageCountdown(): string {
    const range = this.getStageDayRange(this.gameStage);
    const stageLength = range.end - range.start + 1;
    const stageDay = Phaser.Math.Clamp(this.dayIndex - range.start + 1, 1, stageLength);
    const daysLeft = this.getStageDaysRemaining();

    if (this.gameStage === "Sea") {
      if (this.currentMapKind === "main") {
        return "Stage Sea ready | Board at south coast dock";
      }

      if (this.bigFishState === "pulling") {
        return `Stage Sea finale | Big fish pull ${Math.round(this.bigFishPull)}%`;
      }

      return `Stage Sea voyage ${Math.round(this.seaVoyageProgress * 100)}% | Big fish at 85%`;
    }

    if (this.gameStage === "Island") {
      return `Stage Island ${stageDay}/${stageLength} | Return on Day 50`;
    }

    if (this.gameStage === "Return") {
      return "Stage Return 1/1 | Abyss tomorrow";
    }

    if (this.gameStage === "Abyss") {
      return `Stage Abyss ${stageDay}/${stageLength} | Finale in ${daysLeft} days`;
    }

    return `Stage ${this.gameStage} ${stageDay}/${stageLength} | ${daysLeft} days left | Next: ${this.getNextStageLabel()}`;
  }

  private getDailyObjective(): DailyObjective {
    return {
      day: this.dayIndex,
      stage: this.gameStage,
      text: this.getDailyObjectiveText(),
    };
  }

  private getDailyObjectiveText(): string {
    if (this.gameStage === "Spring") {
      return this.dayIndex <= 3 ? "春天收集种子、储雨水，并把第一块地播下。" : "趁雨季储水，探索森林，把食物和木材存进营地箱。";
    }

    if (this.gameStage === "Summer") {
      return this.activeBearId === "yier" ? "太阳很毒，让一二少跑远路，留意体温状态。" : "用布布外出采集，补足夜晚燃料和储物箱。";
    }

    if (this.gameStage === "Autumn") {
      return "秋天收获春天播下的作物，囤积食物和木材，为冬季做准备。";
    }

    if (this.gameStage === "Winter") {
      if (this.dayIndex >= SEA_DEPARTURE_UNLOCK_DAY) {
        return "前往荒芜海岸南侧的破船，靠近后按 E 登船出海。";
      }

      return "雪天注意体温；让一二探索矿山，布布外出前先靠近燃烧篝火。";
    }

    if (this.gameStage === "Sea") {
      if (this.currentMapKind === "main") {
        return "去荒芜海岸南侧找破船码头，按 E 登船进入海上阶段。";
      }

      if (this.bigFishState === "pulling") {
        return "大鱼咬钩了：Tab 切换一二和布布，交替按 E 合作用力。";
      }

      return "坐船横渡海面，按 E 钓鱼补给；航程末段等待大鱼带你们去小岛。";
    }

    if (this.gameStage === "Island") {
      return "探索小岛并寻找记忆方尖碑，准备第 50 天返航。";
    }

    if (this.gameStage === "Return") {
      return "整理储物箱、续满营地篝火，明天深渊会到来。";
    }

    return this.mapFlashbacksFound >= REQUIRED_FLASHBACKS_TO_WIN
      ? "记忆已足够，守住双熊生命值并撑过第 60 天。"
      : `深渊中寻找记忆：${this.mapFlashbacksFound}/${REQUIRED_FLASHBACKS_TO_WIN}，同时保证双熊存活。`;
  }

  private getNextStageLabel(): string {
    if (this.gameStage === "Spring") {
      return "Summer";
    }

    if (this.gameStage === "Summer") {
      return "Autumn";
    }

    if (this.gameStage === "Autumn") {
      return "Winter";
    }

    if (this.gameStage === "Winter") {
      return "Sea";
    }

    if (this.gameStage === "Sea") {
      return "Island";
    }

    if (this.gameStage === "Island") {
      return "Return";
    }

    if (this.gameStage === "Return") {
      return "Abyss";
    }

    return "Finale";
  }

  private formatNearbyFireStatus(bear: BearActor): string {
    const campfire = this.findNearestCampfire(bear.sprite.x, bear.sprite.y, CAMPFIRE_SLOW_RADIUS, false);

    if (!campfire) {
      return "Fire --";
    }

    const fuelSeconds = Math.ceil(this.getCampfireFuelSeconds(campfire));

    return fuelSeconds > 0 ? `Fire ${fuelSeconds}s` : "Fire empty";
  }

  private formatWeatherName(): string {
    if (this.weatherKind === "rain") {
      return "Rain";
    }

    if (this.weatherKind === "sun") {
      return "Sun";
    }

    if (this.weatherKind === "snow") {
      return "Snow";
    }

    return "Clear";
  }

  private formatBearStats(bear: BearActor): string {
    const displayName = bear.id === "yier" ? "Yier" : "Bubu";

    return `${displayName} HP ${Math.ceil(bear.stats.hp)}/${bear.stats.maxHp} Hunger ${Math.ceil(
      bear.stats.hunger,
    )}/${bear.stats.maxHunger} Temp ${bear.temperature.toFixed(1)}C Water ${Math.round(bear.hydration)}% Status ${
      bear.condition
    } Bag A${bear.inventory.apples}/${bear.inventory.maxApples} F${bear.inventory.food} Fish${bear.inventory.fishMeat} Seed${bear.inventory.seeds} W${bear.inventory.wood} S${
      bear.inventory.stone
    } G${bear.inventory.grass} Weapon ${WEAPON_DEFINITIONS[bear.weaponId].name}`;
  }

  private formatOnlineStatus(): string {
    if (!this.onlineMode) {
      return "Mode Local";
    }

    const controlledBearName = this.onlineControlledBearId ? this.bears[this.onlineControlledBearId].name : "旁观";

    return `${this.onlineStatus} | Players ${this.onlineConnectedCount}/2 | Control ${controlledBearName}`;
  }

  private updateCircularMeter(meter: CircularMeter, progress: number, value: string): void {
    const safeProgress = Phaser.Math.Clamp(progress, 0, 1);
    const startAngle = Phaser.Math.DegToRad(-90);
    const endAngle = startAngle + Math.PI * 2 * safeProgress;

    meter.graphics.clear();
    meter.graphics.fillStyle(0x1a120b, 0.78);
    meter.graphics.fillCircle(meter.x, meter.y, meter.radius + 10);
    meter.graphics.lineStyle(9, meter.trackColor, 0.92);
    meter.graphics.beginPath();
    meter.graphics.arc(meter.x, meter.y, meter.radius, 0, Math.PI * 2);
    meter.graphics.strokePath();
    meter.graphics.lineStyle(9, meter.color, 1);
    meter.graphics.beginPath();
    meter.graphics.arc(meter.x, meter.y, meter.radius, startAngle, endAngle);
    meter.graphics.strokePath();
    meter.graphics.lineStyle(2, 0xfff0bd, 0.34);
    meter.graphics.strokeCircle(meter.x, meter.y, meter.radius + 10);
    this.drawMeterIcon(meter, safeProgress);
    meter.valueText.setText(value);
  }

  private drawMeterIcon(meter: CircularMeter, progress: number): void {
    if (meter.icon === "heart") {
      meter.graphics.fillStyle(0x3a1110, 0.9);
      meter.graphics.fillCircle(meter.x - 6, meter.y - 11, 7);
      meter.graphics.fillCircle(meter.x + 6, meter.y - 11, 7);
      meter.graphics.fillTriangle(meter.x - 15, meter.y - 8, meter.x + 15, meter.y - 8, meter.x, meter.y + 10);
      meter.graphics.fillStyle(progress > 0.3 ? 0xff6b63 : 0x8d1f1a, 1);
      meter.graphics.fillCircle(meter.x - 5, meter.y - 12, 5);
      meter.graphics.fillCircle(meter.x + 5, meter.y - 12, 5);
      meter.graphics.fillTriangle(meter.x - 11, meter.y - 9, meter.x + 11, meter.y - 9, meter.x, meter.y + 6);
      return;
    }

    if (meter.icon === "food") {
      meter.graphics.fillStyle(0x7a3e17, 1);
      meter.graphics.fillEllipse(meter.x - 4, meter.y - 10, 20, 14);
      meter.graphics.fillStyle(0xe7aa55, 1);
      meter.graphics.fillEllipse(meter.x - 5, meter.y - 11, 15, 10);
      meter.graphics.fillStyle(0xe8d8b4, 1);
      meter.graphics.fillRect(meter.x + 5, meter.y - 7, 13, 5);
      meter.graphics.fillCircle(meter.x + 20, meter.y - 7, 4);
      meter.graphics.fillCircle(meter.x + 20, meter.y - 2, 4);
      return;
    }

    meter.graphics.fillStyle(0xf5c65b, meter.color === 0xf0c85a ? 1 : 0.36);
    meter.graphics.fillCircle(meter.x - 12, meter.y - 14, 7);
    meter.graphics.lineStyle(2, 0xf5c65b, meter.color === 0xf0c85a ? 0.9 : 0.22);
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      meter.graphics.lineBetween(
        meter.x - 12 + Math.cos(angle) * 10,
        meter.y - 14 + Math.sin(angle) * 10,
        meter.x - 12 + Math.cos(angle) * 14,
        meter.y - 14 + Math.sin(angle) * 14,
      );
    }

    meter.graphics.fillStyle(0xbcc8ff, meter.color === 0x6d7cff ? 1 : 0.38);
    meter.graphics.fillCircle(meter.x + 15, meter.y - 14, 8);
    meter.graphics.fillStyle(0x1a120b, 1);
    meter.graphics.fillCircle(meter.x + 19, meter.y - 17, 8);

    const needleAngle = Phaser.Math.DegToRad(-90) + Math.PI * 2 * progress;
    meter.graphics.lineStyle(3, 0xfff0bd, 1);
    meter.graphics.lineBetween(
      meter.x,
      meter.y,
      meter.x + Math.cos(needleAngle) * (meter.radius - 8),
      meter.y + Math.sin(needleAngle) * (meter.radius - 8),
    );
    meter.graphics.fillStyle(0xfff0bd, 1);
    meter.graphics.fillCircle(meter.x, meter.y, 4);
  }

  private showMessage(message: string): void {
    if (!this.messageText) {
      return;
    }

    this.messageText.setText(message);
    this.time.delayedCall(1700, () => {
      this.messageText?.setText(this.getDefaultPromptText());
    });
  }

  private getDefaultPromptText(): string {
    if (this.onlineMode) {
      return "Online: WASD/Arrow move your bear  E interact  F eat  Q crafting  M map  local systems are prototype-only";
    }

    return "Move: WASD/Arrow  Attack: Space  E interact/tent/seed  F eat  Q crafting  M map  [/] debug days  1-4 seasons";
  }

  private createAnimatedVisual(
    imageUrl: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.DOMElement {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.draggable = false;
    image.alt = "";
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    image.style.objectFit = "contain";
    image.style.imageRendering = "pixelated";
    image.style.pointerEvents = "none";
    image.style.userSelect = "none";
    image.style.transformOrigin = "center center";

    return this.add.dom(x, y - 14, image).setOrigin(0.5, 0.82).setDepth(10);
  }

  private syncAnimatedVisuals(): void {
    for (const bear of Object.values(this.bears)) {
      bear.visual.setPosition(bear.sprite.x, bear.sprite.y - 14);
      this.setVisualFacing(bear.visual, bear.facing);
    }

    if (this.isFusing && this.fusionVisual) {
      const yier = this.bears.yier;
      const bubu = this.bears.bubu;
      this.fusionVisual.setPosition((yier.sprite.x + bubu.sprite.x) / 2, (yier.sprite.y + bubu.sprite.y) / 2 - 12);
      this.setVisualFacing(this.fusionVisual, yier.facing);
    }
  }

  private setVisualFacing(visual: Phaser.GameObjects.DOMElement, facing: -1 | 1): void {
    const node = visual.node;

    if (node instanceof HTMLImageElement) {
      node.style.transform = `scaleX(${facing})`;
    }
  }

  private setVisualBrightness(visual: Phaser.GameObjects.DOMElement | undefined, brightness: number): void {
    const node = visual?.node;

    if (node instanceof HTMLImageElement) {
      node.style.filter = `brightness(${brightness})`;
    }
  }

  private get activeBear(): BearActor {
    return this.bears[this.activeBearId];
  }

  private createRuntimeTextures(): void {
    const graphics = this.add.graphics().setVisible(false);

    this.generateTextureIfMissing(graphics, "forest_floor", 128, 128, (g) => {
      g.fillStyle(0x1a2b1a, 1);
      g.fillRect(0, 0, 128, 128);
      g.fillStyle(0x213820, 1);
      g.fillRect(0, 0, 128, 18);
      g.fillRect(0, 72, 128, 14);
      g.fillStyle(0x102011, 0.82);
      g.fillRect(12, 25, 34, 6);
      g.fillRect(86, 42, 28, 7);
      g.fillRect(42, 102, 46, 5);
      g.fillStyle(0x426c36, 0.75);
      g.fillRect(18, 56, 8, 4);
      g.fillRect(25, 52, 6, 4);
      g.fillRect(70, 18, 10, 5);
      g.fillRect(92, 96, 12, 5);
      g.fillStyle(0x2a4524, 0.9);
      g.fillRect(112, 12, 5, 18);
      g.fillRect(108, 16, 13, 5);
      g.fillRect(6, 88, 4, 18);
      g.fillRect(2, 94, 14, 4);
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
      g.fillStyle(0x6c8f4a, 0.92);
      g.fillRect(44, 68, 6, 4);
      g.fillRect(30, 95, 8, 4);
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
      g.fillStyle(0x6b8f49, 1);
      g.fillRect(14, 3, 8, 4);
      g.fillRect(58, 1, 7, 4);
      g.fillRect(76, 24, 7, 4);
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
      g.fillStyle(0x8da86e, 0.9);
      g.fillRect(11, 19, 4, 4);
      g.fillRect(33, 43, 4, 4);
    });

    this.generateTextureIfMissing(graphics, "wood_sign_panel", 256, 72, (g) => {
      g.fillStyle(0x1b1008, 0.55);
      g.fillRoundedRect(4, 6, 248, 62, 8);
      g.fillStyle(0x5f381d, 1);
      g.fillRoundedRect(0, 0, 256, 62, 7);
      g.fillStyle(0x8a5529, 1);
      g.fillRoundedRect(6, 6, 244, 50, 5);
      g.fillStyle(0x4a2a16, 1);
      g.fillRect(14, 18, 220, 4);
      g.fillRect(22, 40, 210, 4);
      g.fillStyle(0x2f1a0d, 1);
      g.fillCircle(22, 14, 4);
      g.fillCircle(236, 14, 4);
      g.fillCircle(22, 48, 4);
      g.fillCircle(236, 48, 4);
      g.fillStyle(0x35552a, 1);
      g.fillRect(5, 0, 46, 5);
      g.fillRect(162, 55, 50, 5);
    });

    this.generateTextureIfMissing(graphics, "stone_tablet_panel", 256, 72, (g) => {
      g.fillStyle(0x111313, 0.5);
      g.fillRoundedRect(4, 7, 248, 60, 8);
      g.fillStyle(0x4f554e, 1);
      g.fillRoundedRect(0, 0, 256, 62, 7);
      g.fillStyle(0x737a70, 1);
      g.fillRoundedRect(8, 8, 240, 46, 4);
      g.fillStyle(0x3b423c, 1);
      g.fillRect(18, 15, 58, 3);
      g.fillRect(96, 45, 92, 3);
      g.fillRect(212, 18, 22, 3);
      g.fillStyle(0x263923, 1);
      g.fillRect(12, 3, 40, 5);
      g.fillRect(198, 55, 44, 5);
    });

    this.generateTextureIfMissing(graphics, "bear_yier", 64, 64, (g) => {
      g.fillStyle(0x000000, 0);
      g.fillRect(0, 0, 64, 64);
      g.fillStyle(0xe8e1cf, 1);
      g.fillRect(16, 18, 32, 30);
      g.fillRect(12, 28, 40, 18);
      g.fillStyle(0xf8f1df, 1);
      g.fillRect(18, 12, 10, 10);
      g.fillRect(38, 12, 10, 10);
      g.fillRect(20, 20, 24, 18);
      g.fillStyle(0xd2c8b5, 1);
      g.fillRect(14, 40, 10, 10);
      g.fillRect(40, 40, 10, 10);
      g.fillStyle(0x22201c, 1);
      g.fillRect(24, 28, 4, 4);
      g.fillRect(38, 28, 4, 4);
      g.fillRect(31, 36, 5, 4);
      g.fillStyle(0x87a8b2, 1);
      g.fillRect(21, 50, 22, 5);
      g.fillStyle(0xffffff, 0.45);
      g.fillRect(21, 20, 8, 4);
    });

    this.generateTextureIfMissing(graphics, "bear_bubu", 68, 68, (g) => {
      g.fillStyle(0x000000, 0);
      g.fillRect(0, 0, 68, 68);
      g.fillStyle(0x1d1815, 1);
      g.fillRect(16, 17, 36, 36);
      g.fillRect(11, 29, 46, 18);
      g.fillRect(14, 10, 12, 12);
      g.fillRect(43, 10, 12, 12);
      g.fillStyle(0xf0e8d8, 1);
      g.fillRect(22, 20, 24, 24);
      g.fillStyle(0x2a211b, 1);
      g.fillRect(22, 27, 8, 9);
      g.fillRect(38, 27, 8, 9);
      g.fillStyle(0x0b0a09, 1);
      g.fillRect(25, 30, 3, 3);
      g.fillRect(41, 30, 3, 3);
      g.fillRect(32, 39, 5, 4);
      g.fillStyle(0x6d4426, 1);
      g.fillRect(14, 45, 12, 10);
      g.fillRect(43, 45, 12, 10);
      g.fillStyle(0xe7d8b6, 1);
      g.fillRect(30, 48, 10, 5);
    });

    this.generateTextureIfMissing(graphics, "apple", 30, 30, (g) => {
      g.fillStyle(0xb8322a, 1);
      g.fillCircle(15, 17, 10);
      g.fillStyle(0x6d3a15, 1);
      g.fillRect(14, 4, 3, 9);
      g.fillStyle(0x5e9d43, 1);
      g.fillEllipse(22, 8, 10, 5);
    });

    this.generateTextureIfMissing(graphics, "cooked_apple", 34, 30, (g) => {
      g.fillStyle(0x120c06, 0.35);
      g.fillEllipse(17, 26, 26, 5);
      g.fillStyle(0x7c231d, 1);
      g.fillCircle(17, 16, 10);
      g.fillStyle(0xd4742a, 1);
      g.fillCircle(14, 13, 6);
      g.fillStyle(0x2a1309, 1);
      g.fillRect(9, 20, 17, 3);
      g.fillStyle(0xffd06c, 1);
      g.fillRect(22, 7, 4, 7);
      g.fillRect(25, 10, 3, 5);
    });

    this.generateTextureIfMissing(graphics, "resource_wood", 42, 28, (g) => {
      g.fillStyle(0x120c06, 0.35);
      g.fillEllipse(21, 25, 34, 6);
      g.fillStyle(0x2b3f1d, 1);
      g.fillCircle(20, 10, 11);
      g.fillCircle(11, 15, 8);
      g.fillCircle(29, 16, 9);
      g.fillStyle(0x6f421f, 1);
      g.fillRect(18, 14, 7, 12);
      g.fillStyle(0xa7672d, 1);
      g.fillRect(22, 15, 3, 10);
      g.fillStyle(0x77a34a, 1);
      g.fillRect(13, 18, 7, 3);
    });

    this.generateTextureIfMissing(graphics, "resource_stone", 38, 30, (g) => {
      g.fillStyle(0x120c06, 0.35);
      g.fillEllipse(19, 26, 30, 6);
      g.fillStyle(0x646c68, 1);
      g.fillCircle(14, 18, 10);
      g.fillStyle(0x858f87, 1);
      g.fillCircle(23, 14, 10);
      g.fillStyle(0x4f5d67, 1);
      g.fillCircle(10, 20, 6);
      g.fillStyle(0xaeb8ae, 1);
      g.fillRect(20, 8, 8, 4);
      g.fillStyle(0x3a403c, 1);
      g.fillRect(11, 21, 15, 3);
    });

    this.generateTextureIfMissing(graphics, "resource_grass", 38, 34, (g) => {
      g.fillStyle(0x120c06, 0.3);
      g.fillEllipse(19, 30, 30, 5);
      g.fillStyle(0x3e742e, 1);
      g.fillTriangle(6, 28, 12, 5, 17, 28);
      g.fillTriangle(14, 29, 20, 2, 25, 29);
      g.fillTriangle(22, 29, 29, 7, 34, 29);
      g.fillStyle(0x85b85a, 1);
      g.fillRect(18, 12, 4, 12);
      g.fillRect(26, 16, 4, 10);
    });

    this.generateTextureIfMissing(graphics, "spring_bird", 34, 28, (g) => {
      g.fillStyle(0x10140d, 0.28);
      g.fillEllipse(17, 24, 24, 5);
      g.fillStyle(0x5f4027, 1);
      g.fillEllipse(16, 15, 20, 14);
      g.fillStyle(0x8b6338, 1);
      g.fillEllipse(10, 14, 14, 9);
      g.fillStyle(0xd7b26a, 1);
      g.fillTriangle(25, 13, 33, 16, 25, 19);
      g.fillStyle(0x15110b, 1);
      g.fillCircle(20, 12, 2);
      g.fillStyle(0x86a755, 1);
      g.fillCircle(8, 8, 3);
    });

    this.generateTextureIfMissing(graphics, "crop_plot_empty", 46, 28, (g) => {
      g.fillStyle(0x160f09, 0.4);
      g.fillEllipse(23, 23, 38, 7);
      g.fillStyle(0x4b2e18, 1);
      g.fillEllipse(23, 16, 38, 18);
      g.lineStyle(2, 0x2d1c10, 0.9);
      g.lineBetween(8, 15, 38, 15);
      g.lineBetween(12, 20, 34, 10);
    });

    this.generateTextureIfMissing(graphics, "crop_plot_planted", 46, 34, (g) => {
      g.fillStyle(0x160f09, 0.4);
      g.fillEllipse(23, 28, 38, 7);
      g.fillStyle(0x4b2e18, 1);
      g.fillEllipse(23, 20, 38, 18);
      g.fillStyle(0x4d8a35, 1);
      g.fillTriangle(20, 22, 23, 6, 27, 22);
      g.fillTriangle(12, 23, 18, 12, 21, 23);
      g.fillTriangle(27, 23, 34, 11, 35, 23);
    });

    this.generateTextureIfMissing(graphics, "crop_plot_mature", 48, 42, (g) => {
      g.fillStyle(0x160f09, 0.4);
      g.fillEllipse(24, 36, 38, 7);
      g.fillStyle(0x4b2e18, 1);
      g.fillEllipse(24, 28, 38, 18);
      g.fillStyle(0x4d8a35, 1);
      g.fillRect(21, 13, 5, 18);
      g.fillTriangle(16, 25, 23, 7, 30, 25);
      g.fillStyle(0xd89a3a, 1);
      g.fillCircle(18, 12, 5);
      g.fillCircle(30, 16, 5);
      g.fillCircle(24, 8, 4);
    });

    this.generateTextureIfMissing(graphics, "crafted_campfire", 54, 48, (g) => {
      g.fillStyle(0x120c06, 0.45);
      g.fillEllipse(27, 42, 44, 8);
      g.lineStyle(5, 0x5b341c, 1);
      g.lineBetween(10, 36, 44, 26);
      g.lineBetween(10, 26, 44, 36);
      g.fillStyle(0xffd36b, 1);
      g.fillTriangle(25, 8, 15, 36, 35, 36);
      g.fillStyle(0xef6a2e, 1);
      g.fillTriangle(31, 16, 22, 37, 43, 37);
      g.fillStyle(0xfff0a8, 1);
      g.fillTriangle(25, 20, 21, 35, 31, 35);
    });

    this.generateTextureIfMissing(graphics, "camp_storage_chest", 62, 48, (g) => {
      g.fillStyle(0x120c06, 0.4);
      g.fillEllipse(31, 43, 48, 8);
      g.fillStyle(0x4a2c16, 1);
      g.fillRoundedRect(8, 17, 46, 24, 4);
      g.fillStyle(0x7b4b24, 1);
      g.fillRoundedRect(6, 10, 50, 16, 5);
      g.fillStyle(0x9c672f, 1);
      g.fillRect(11, 16, 40, 4);
      g.fillStyle(0xd2a04b, 1);
      g.fillRect(28, 22, 7, 8);
      g.fillStyle(0x263923, 1);
      g.fillRect(8, 8, 18, 4);
      g.fillRect(37, 37, 14, 4);
    });

    this.generateTextureIfMissing(graphics, "crafted_bandage", 42, 26, (g) => {
      g.fillStyle(0x120c06, 0.3);
      g.fillEllipse(21, 23, 32, 5);
      g.fillStyle(0xe6ddcb, 1);
      g.fillRoundedRect(5, 8, 32, 10, 4);
      g.fillStyle(0xf8efe0, 1);
      g.fillRoundedRect(9, 5, 24, 10, 4);
      g.fillStyle(0xc94a45, 1);
      g.fillRect(19, 7, 4, 8);
      g.fillRect(17, 9, 8, 4);
      g.fillStyle(0xb9ad9e, 1);
      g.fillRect(7, 17, 26, 2);
    });

    this.generateTextureIfMissing(graphics, "weapon_wooden_spear", 54, 18, (g) => {
      g.fillStyle(0x140f09, 0.35);
      g.fillEllipse(26, 15, 42, 5);
      g.lineStyle(5, 0x7b4a25, 1);
      g.lineBetween(8, 10, 42, 10);
      g.fillStyle(0xd8c38c, 1);
      g.fillTriangle(42, 4, 52, 10, 42, 16);
      g.fillStyle(0x31582b, 1);
      g.fillRect(13, 5, 8, 4);
    });

    this.generateTextureIfMissing(graphics, "weapon_stone_club", 42, 28, (g) => {
      g.fillStyle(0x140f09, 0.35);
      g.fillEllipse(21, 24, 32, 6);
      g.lineStyle(6, 0x75491f, 1);
      g.lineBetween(9, 18, 25, 12);
      g.fillStyle(0x6b716c, 1);
      g.fillRoundedRect(22, 4, 16, 16, 5);
      g.fillStyle(0x9aa197, 1);
      g.fillRect(26, 7, 7, 4);
      g.fillStyle(0x2b2e2b, 1);
      g.fillRect(30, 15, 5, 3);
    });

    this.generateTextureIfMissing(graphics, "shadow_enemy", 42, 42, (g) => {
      g.fillStyle(0x050407, 1);
      g.fillCircle(21, 21, 18);
      g.fillStyle(0x7c1118, 1);
      g.fillCircle(15, 18, 3);
      g.fillCircle(27, 18, 3);
    });

    this.generateTextureIfMissing(graphics, "black_cat", 54, 42, (g) => {
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(26, 36, 44, 8);
      g.fillStyle(0x050505, 1);
      g.fillEllipse(24, 25, 31, 18);
      g.fillCircle(38, 19, 10);
      g.fillTriangle(31, 12, 35, 4, 39, 14);
      g.fillTriangle(40, 12, 46, 5, 46, 16);
      g.lineStyle(5, 0x050505, 1);
      g.beginPath();
      g.arc(10, 23, 13, Phaser.Math.DegToRad(140), Phaser.Math.DegToRad(265));
      g.strokePath();
      g.fillStyle(0xa7ffd6, 1);
      g.fillRect(35, 18, 3, 3);
      g.fillRect(43, 18, 3, 3);
      g.fillStyle(0x172119, 1);
      g.fillRect(36, 18, 1, 3);
      g.fillRect(44, 18, 1, 3);
    });

    this.generateTextureIfMissing(graphics, "sea_boat", 176, 78, (g) => {
      g.fillStyle(0x02080d, 0.34);
      g.fillEllipse(88, 68, 148, 13);
      g.fillStyle(0x3b2515, 1);
      g.fillRoundedRect(18, 24, 140, 34, 18);
      g.fillStyle(0x6f4524, 1);
      g.fillRoundedRect(27, 17, 122, 28, 12);
      g.fillStyle(0x9a6534, 1);
      g.fillRect(38, 25, 30, 6);
      g.fillRect(79, 25, 29, 6);
      g.fillRect(119, 25, 22, 6);
      g.lineStyle(5, 0x26180e, 1);
      g.lineBetween(27, 52, 149, 52);
      g.fillStyle(0xd5b16a, 1);
      g.fillCircle(64, 39, 7);
      g.fillCircle(112, 38, 7);
      g.fillStyle(0xb7e7ff, 0.34);
      g.fillRect(2, 62, 54, 4);
      g.fillRect(123, 64, 48, 3);
    });

    this.generateTextureIfMissing(graphics, "fishing_bobber", 22, 30, (g) => {
      g.fillStyle(0x05080a, 0.3);
      g.fillEllipse(11, 27, 15, 4);
      g.fillStyle(0xf0f1e8, 1);
      g.fillCircle(11, 14, 7);
      g.fillStyle(0xd64234, 1);
      g.fillRect(4, 14, 14, 7);
      g.lineStyle(2, 0x1b2830, 1);
      g.lineBetween(11, 2, 11, 26);
    });

    this.generateTextureIfMissing(graphics, "fish_shadow_silver", 72, 34, (g) => {
      g.fillStyle(0x081018, 0);
      g.fillRect(0, 0, 72, 34);
      g.fillStyle(0xa9d8e6, 0.62);
      g.fillEllipse(36, 17, 48, 18);
      g.fillTriangle(10, 17, 0, 8, 0, 26);
      g.fillStyle(0xe8fbff, 0.52);
      g.fillEllipse(43, 13, 16, 5);
    });

    this.generateTextureIfMissing(graphics, "fish_shadow_red", 78, 38, (g) => {
      g.fillStyle(0x081018, 0);
      g.fillRect(0, 0, 78, 38);
      g.fillStyle(0xb94a45, 0.66);
      g.fillEllipse(40, 19, 52, 20);
      g.fillTriangle(13, 19, 0, 8, 0, 30);
      g.fillStyle(0xffa28f, 0.54);
      g.fillEllipse(49, 14, 17, 5);
    });

    this.generateTextureIfMissing(graphics, "fish_shadow_moon", 88, 34, (g) => {
      g.fillStyle(0x081018, 0);
      g.fillRect(0, 0, 88, 34);
      g.lineStyle(9, 0xc9d4ff, 0.56);
      g.beginPath();
      g.moveTo(8, 18);
      g.lineTo(28, 12);
      g.lineTo(52, 18);
      g.lineTo(80, 14);
      g.strokePath();
      g.fillStyle(0xf8fdff, 0.5);
      g.fillCircle(72, 14, 3);
    });

    this.generateTextureIfMissing(graphics, "fish_shadow_abyss", 92, 42, (g) => {
      g.fillStyle(0x081018, 0);
      g.fillRect(0, 0, 92, 42);
      g.fillStyle(0x161019, 0.78);
      g.fillEllipse(47, 21, 64, 24);
      g.fillTriangle(16, 21, 0, 8, 0, 34);
      g.fillStyle(0xff355d, 0.7);
      g.fillCircle(64, 17, 4);
      g.fillCircle(72, 23, 3);
      g.fillStyle(0x8b1831, 0.5);
      g.fillEllipse(43, 30, 24, 5);
    });

    this.generateTextureIfMissing(graphics, "big_fish", 240, 112, (g) => {
      g.fillStyle(0x02060a, 0.36);
      g.fillEllipse(120, 94, 178, 18);
      g.fillStyle(0x111b28, 1);
      g.fillEllipse(118, 57, 168, 58);
      g.fillTriangle(38, 58, 6, 22, 9, 96);
      g.fillStyle(0x22354a, 1);
      g.fillEllipse(136, 45, 82, 21);
      g.fillStyle(0x071018, 1);
      g.fillEllipse(190, 58, 32, 24);
      g.fillStyle(0xff3a52, 1);
      g.fillCircle(198, 51, 5);
      g.lineStyle(4, 0xb9e3ff, 0.34);
      g.lineBetween(76, 62, 177, 48);
      g.lineBetween(72, 75, 158, 76);
    });

    this.generateTextureIfMissing(graphics, "big_fish_back", 260, 82, (g) => {
      g.fillStyle(0x02060a, 0.28);
      g.fillEllipse(130, 70, 208, 16);
      g.fillStyle(0x14263a, 1);
      g.fillEllipse(130, 42, 210, 48);
      g.fillStyle(0x1f3954, 1);
      g.fillEllipse(146, 32, 128, 22);
      g.lineStyle(5, 0x9fd9ff, 0.42);
      g.lineBetween(54, 44, 204, 34);
      g.fillStyle(0x091622, 1);
      g.fillTriangle(23, 42, 0, 17, 0, 67);
    });

    this.generateTextureIfMissing(graphics, "wall", 32, 32, (g) => {
      g.fillStyle(0x4b3d29, 1);
      g.fillRect(0, 0, 32, 32);
      g.lineStyle(2, 0x2c2418, 1);
      g.strokeRect(1, 1, 30, 30);
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
    if (this.textures.exists(key)) {
      return;
    }

    graphics.clear();
    draw(graphics);
    graphics.generateTexture(key, width, height);
  }
}
