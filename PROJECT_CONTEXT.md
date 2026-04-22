# Dual Bear Survival Project Context

Last updated: 2026-04-22

## Project Overview

This project is a Phaser 3 + TypeScript browser survival prototype about two asymmetric bear protagonists:

- Yier: white bear, explorer, more sensitive to memory/deep-sea/abyss logic.
- Bubu: brown bear, stronger builder/carrier, more grounded and physical.

The current design goal is not to copy Don't Starve. The strongest original direction is:

> Two bears do not perceive the same world. Yier sees memory traces and abyss logic; Bubu sees physical anchors and structural truths. Survival, exploration, and later online co-op should require switching perspectives or communicating.

## Current Tech Stack

- Frontend: Vite + Phaser 3 + TypeScript.
- Main entry: `src/main.ts`.
- Main gameplay scene: `src/scenes/MainScene.ts`.
- Map/layout manager: `src/GameMapManager.ts`.
- Abyss prototype manager: `src/AbyssManager.ts`.
- Local online prototype server: `server/index.mjs`.
- Shared online protocol types: `src/shared/online.ts`.

Package scripts:

- `npm run dev`: local Vite client, single-player by default.
- `npm run dev:server`: starts the local WebSocket server on `ws://127.0.0.1:3000`.
- `npm run dev:online`: starts local client on port `5175` plus the local online server.
- `npm run build`: TypeScript + Vite production build.
- `npm run start:prod`: starts the Node production server, serving `dist/` and WebSocket from one process.

Important warning:

- `node server/index.mjs` and `npm run dev:server` are long-running server commands. They do not exit by themselves. Stop them with `Ctrl+C` when running manually.

## Implemented Gameplay Systems

The current prototype already includes:

- Two bears with independent HP, hunger, inventory, weapons, speed, and seasonal modifiers.
- Tab switching in local single-player.
- GIF/WEBP character visuals:
  - `/characters/yier.gif`
  - `/characters/bubu.webp`
  - `/characters/yierbubu.gif`
  - `/characters/yierbubu2.gif`
- Directional facing based on movement.
- Touch fusion animation for Yier + Bubu in local mode.
- Apple pickup, manual `E` interaction, eating with `F`.
- Inventory items:
  - apples
  - wood
  - stone
  - grass
- Crafting panel with:
  - campfire
  - wooden spear
  - stone club
  - bandage
  - cooked apple
- Campfire fuel system:
  - fuel consumed at night.
  - burning fire creates safety light.
  - enemies slow/retreat near safe fire.
  - add wood near campfire with `E`.
- Permanent camp storage chest:
  - store/take apples, wood, stone, grass.
- Resources and respawns:
  - grass refreshes daily.
  - trees/stone nodes take longer.
- Simple weapons and combat.
- Night enemies and darker night overlay.
- Black cat random spawn:
  - pure black visual.
  - touching it heals HP.
- 4x expanded world map with:
  - Hub
  - Forest
  - Mountains
  - Coast
- Sea and Island phase maps.
- Minimap and zone discovery.
- Interaction hint system.
- Daily objective HUD line.
- 60-day story timeline.
- Ecology/weather pack v0.25:
  - denser map decoration with more trees, shrubs, flowers, dry grass, and stone clusters.
  - improved resource visuals for wood/grass/stone nodes.
  - interactive central camp tent for sheltering from night enemies.
  - seasonal visual weather: Spring rain, Summer sun, Winter snow.
  - display-only bear temperature, hydration, and condition states.
  - Spring birds that give seeds.
  - camp crop plots that can be seeded and harvested as food in Autumn.
  - expanded storage for apples, food, seeds, water, wood, stone, grass.

## 60-Day Timeline

Current stage schedule:

- Day 1-10: Spring
- Day 11-20: Summer
- Day 21-30: Autumn
- Day 31-40: Winter
- Day 41-44: Sea
- Day 45-49: Island
- Day 50: Return
- Day 51-60: Abyss

Day 60 ending condition:

- Yier HP > 0.
- Bubu HP > 0.
- `mapFlashbacksFound >= 4`.

If these are true, the game shows a win ending; otherwise it shows a failure ending.

## Seasonal/Stage Gameplay Effects

Current modifiers are based on HP, hunger, and speed only. Sanity is not implemented yet.

- Spring: baseline.
- Summer: Yier hunger drain is higher and speed slightly lower; Bubu is mostly normal.
- Autumn: both bears get a light hunger reduction.
- Winter:
  - Yier gains polar advantage.
  - Bubu suffers unless near a burning campfire.
- Sea: both bears consume more and move slower.
- Island: mild exploration pressure.
- Abyss:
  - stronger enemy pressure.
  - Yier adapts slightly better than Bubu.

## Map Systems

`GameMapManager` currently manages:

- Zone definitions.
- Seasonal access locks:
  - Spring river blocks coast path.
  - Summer bramble blocks path and favors Bubu.
  - Winter snow path favors Yier.
- Supply caches.
- Black cat footprint trails.
- Memory obelisks.
- Main, Sea, and Island map creation.

Memory obelisks currently require both bears near the object to trigger a flashback.

## Local Online Prototype Status

The first local online skeleton has been implemented.

Files:

- `server/index.mjs`
- `scripts/dev-online.mjs`
- `src/shared/online.ts`
- `src/scenes/MainScene.ts`

Behavior:

- Normal local play remains single-player unless online mode is enabled.
- Online mode is enabled with URL param:
  - `http://127.0.0.1:5175/?online=1`
- First connected browser controls Yier.
- Second connected browser controls Bubu.
- Server broadcasts both bear positions and basic stats.
- Client smooths remote bear positions.

Current limitation:

- Only movement/basic snapshots are synchronized.
- Apples, combat, campfire, storage, enemies, day/night, seasons, and puzzles are still local client logic.
- Next online step should migrate pickup/resource authority to the server.

Health check:

- `http://127.0.0.1:3000/health`

## Known Development Notes

- PowerShell may display Chinese text as mojibake when using `Get-Content`. Do not assume the source file is broken. `Select-String` often displays the same lines correctly.
- `rg.exe` previously failed with `Access is denied`; use PowerShell commands if `rg` is unavailable.
- The workspace may not be a Git repository, so `git status` may fail.
- Running foreground server commands can look like a hang. Use separate terminal, `npm run dev:online`, or start/stop with explicit process handling.

## Ecology/Weather v0.25 Notes

Implemented in `src/scenes/MainScene.ts` and `src/GameMapManager.ts`.

Gameplay behavior:

- Spring periodically starts/stops rain locally. Rain draws a screen rain effect and slowly adds water to camp storage.
- Summer draws a warm sun overlay and pushes displayed bear temperature upward.
- Winter draws snow and pushes displayed bear temperature downward, especially for Bubu.
- Temperature/hydration/condition are HUD display values only. They do not currently damage bears or affect speed.
- Conditions are: 健康, 缺水, 饿了, 寒冷, 好热.
- The main camp tent can be entered/exited with `E` when nearby. While sheltered, bears stop moving and night enemy contact damage is ignored.
- Spring birds spawn around the forest/camp edge. Press `E` near a bird to collect seeds.
- Camp crop plots accept seeds with `E`; planted crops mature in Autumn and can be harvested into `food`.
- Food can be eaten with `F` after apples are gone and restores Hunger +35.

Follow-up ideas:

- Add a drinking action that consumes stored water and restores hydration.
- Make dehydration/temperature eventually affect speed or HP once the display loop feels readable.
- Move weather, crops, and storage authority to the online server after local gameplay is stable.

## Soft Zone Boundary Update

The user asked to replace hard internal zone walls with softer ecological boundaries.

Implemented direction:

- Main map internal static walls have been removed; only outer world boundaries remain.
- Seasonal locks are now visual/interactive markers instead of objects inside the shared collision wall group.
- Zone readability now comes from:
  - ground color overlays,
  - denser forest tree/shrub clusters,
  - north mountain stone clusters and cold fog,
  - south coast reed/dry-grass patches,
  - resource spawn distribution,
  - bird/small-animal distribution.
- Added generated decoration textures:
  - `forest_leaf_scatter`
  - `mountain_fog_patch`
  - `coast_reed_patch`
  - `distant_bird`

Design intent:

- Players should feel Hub, Forest, Mountains, and Coast as one continuous world.
- Movement should stay fluid; ecology and weather should guide exploration instead of collision walls.

## HUD And Larger Map Update

The user asked to move the minimap and make the quest UI feel more like an online RPG task tracker.

Implemented:

- Main world size increased from `2560x1440` to `3840x2160`.
- `GameMapManager` scale increased from `2` to `3`.
- Main-scene legacy coordinates are scaled once at scene startup so bears, resources, birds, weapons, crops, campfire, and storage chest stay aligned with the larger world.
- Sea and island map fixed points were also scaled to the larger world.
- Local online server spawn/bounds were scaled by `1.5` to match the new world.
- Minimap moved to the bottom-right corner.
- `M` toggles minimap visibility.
- A new top-right quest tracker panel shows:
  - day/stage/current area,
  - daily objective text,
  - stage countdown,
  - minimap toggle hint.
- The old `Goal:` line was removed from the left HUD stats block so the task panel owns objective guidance.

Follow-up boundary expansion:

- Main world size expanded again from `3840x2160` to `5120x2880`.
- `GameMapManager` scale increased from `3` to `4`.
- Local online server coordinate scale increased from `1.5` to `2` so online spawn/bounds match the larger map.

## Sea Departure Dock Update

The user asked for a clear sea departure entrance instead of an invisible automatic Day 41 transition.

Implemented:

- Added a visible broken boat / dock entrance on the south side of the Coast zone.
- `GameMapManager.getSeaDockPoint()` exposes the dock position to `MainScene`.
- Day 40+ near the dock shows `E 登船出海`.
- Pressing `E` near the dock:
  - sets the story day to at least Day 41,
  - sets stage to `Sea`,
  - switches to the sea map,
  - moves both bears to the sea starting area.
- Before Day 40, approaching the dock says the boat is not repaired yet.
- Day 41 now prompts the player to go to the south coast dock instead of automatically teleporting to Sea.
- The winter/sea daily objective text now points the player to the dock when departure is available.

## Sea Voyage + Fishing + Big Fish Update

Implemented in `src/scenes/MainScene.ts` and lightly in `src/GameMapManager.ts`.

Behavior:

- After boarding from the south Coast dock, Sea becomes a boat-voyage mode instead of normal free movement.
- Yier and Bubu sit on fixed seats in a small boat.
- The boat anchor moves across the sea route while the camera follows it.
- Normal WASD movement and local fusion are disabled while on the boat.
- Sea wake lines and fish shadows move around the boat to imply horizontal travel.
- Press `E` in Sea to fish:
  - If a fish shadow is close enough, the active bear casts the rod.
  - Pressing `E` while waiting cancels fishing.
  - When the bobber turns red / bite message appears, pressing `E` catches the fish.
  - Missing the bite window makes the fish escape.
- Fish types:
  - `silver_fish`
  - `red_snapper`
  - `moon_eel`
  - `abyss_carp`
- New inventory/storage item:
  - `fishMeat`
  - Fish meat can be stored in camp storage.
  - Pressing `F` eats fish meat after apples/food are unavailable and restores Hunger +40.
- Sea finale:
  - At roughly 85% voyage progress, a big fish event starts automatically.
  - Day rollover into Island is paused until this event is completed.
  - During the pull phase, the player must alternate `Tab` between Yier/Bubu and press `E`.
  - Alternating bears gives real pull progress; repeatedly using the same bear gives only a tiny amount.
  - Pull progress slowly decays but cannot hard-fail the story.
  - On success, the big fish surfaces, the screen flashes/shakes, `dayIndex` becomes Day 45, and the game switches to Island.

Notes:

- Sea no longer spawns the permanent campfire because the sea loop is now boat/fishing focused.
- Sea also skips static apples/resources/weapons so the player is not teased by pickups they cannot reach from the boat.
- Night enemies are disabled on the Sea map.
- This is still local-client authority only. Online mode does not yet synchronize fish shadows or the big fish event.

## Balance + Readability Tuning

Implemented after early playtest feedback:

- Trees and tree clusters are visually larger in `GameMapManager`, but remain decorative and non-colliding.
- Early survival pressure was softened:
  - hunger drain reduced,
  - night hunger multiplier reduced,
  - starving HP drain reduced,
  - enemy touch damage reduced.
- Night darkness is stronger and DOM bear sprites dim more clearly.
- In local mode, if the currently controlled bear reaches HP 0, control automatically switches to the other living bear.
- If both bears reach HP 0, movement stops and a message explains that both are down.

## Pending Requested Feature

The user requested implementation of:

> 错视探索 v0.3：双熊看到不同世界

This has not been implemented yet. The next implementation should follow the plan below.

## Next Implementation Plan: Perception Exploration v0.3

Core idea:

- Yier sees memory/sensitive objects.
- Bubu sees physical/grounded objects.
- The same map should reveal different truths depending on the current bear.

Add to `GameMapManager`:

- Perception node data structure.
- Memory Glyph objects visible/readable by Yier.
- Burden Stone objects visible/usable by Bubu.
- Echo Cache reward objects unlocked after both perception steps.
- False Apple illusion objects visible mainly to Yier in dangerous/abyss states.
- Forest, Mountains, Coast nodes on the main map.
- One Island node that rewards `mapFlashbacksFound +1`.

Add to `MainScene`:

- HUD perception line:
  - `Perception: Yier sees memory traces`
  - `Perception: Bubu sees physical anchors`
- Interaction hints:
  - `E 读取记忆纹路`
  - `E 撬动承重石`
  - `这里有东西，但不是它能理解的东西`
- Call into `GameMapManager` when pressing `E`.
- Refresh perception object visibility when switching bears or changing online controlled bear.
- Flash/tween visible perception objects briefly after switching.

Gameplay loop per perception node:

1. Yier reads the Memory Glyph.
2. A clue is shown in HUD/message.
3. Bubu uses the related Burden Stone.
4. Echo Cache appears or a shortcut opens.
5. Island node grants one memory flashback.

Testing expectations:

- `npm run build` must pass.
- `npm run dev` should still work without online server.
- Switching local bears should visibly change perception objects.
- Wrong bear near a perception object should get a hint but not complete it.
- Island perception node should increase `mapFlashbacksFound`.

## Suggested Follow-Up Order

1. Implement local perception exploration v0.3.
2. Migrate apple pickup/resource pickup to the online server.
3. Add simple room code UI for online play.
4. Move day/night and HP/Hunger authority to the online server.
5. Later, deploy production build to cloud server using `npm run build` + `npm run start:prod`.
