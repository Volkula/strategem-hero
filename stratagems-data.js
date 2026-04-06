/**
 * Stratagem list aligned with https://helldivers.wiki.gg/wiki/Stratagems (April 2026 snapshot).
 * Codes: IGN, Deltias Gaming, DualShockers, in-game community — verify after patches.
 * unverified: 1 = confirm in Ship Management / editor.
 */
(function () {
  const U = 1;
  /** @type {[string, string, string[], 0|1, string, string?][]} 6th col legacy RU (unused; locale ru = en/wiki). */
  const RAW = [
    // ——— Support weapons (wiki order) ———
    ["mg-43", "support_weapons", ["down", "left", "down", "up", "right"], 0, "MG-43 Machine Gun", "Пулемёт MG-43"],
    ["eat-17", "support_weapons", ["down", "down", "left", "up", "right"], 0, "EAT-17 Expendable Anti-Tank", "EAT-17 одноразовый ПТРК"],
    ["m-105-stalwart", "support_weapons", ["down", "left", "down", "up", "up", "left"], 0, "M-105 Stalwart", "M-105 Stalwart"],
    ["las-98", "support_weapons", ["down", "left", "down", "up", "left"], 0, "LAS-98 Laser Cannon", "LAS-98 лазерная пушка"],
    ["apw-1", "support_weapons", ["down", "left", "right", "up", "down"], 0, "APW-1 Anti-Materiel Rifle", "APW-1 крупнокалиберная винтовка"],
    ["gr-8", "support_weapons", ["down", "left", "right", "right", "left"], 0, "GR-8 Recoilless Rifle", "GR-8 безоткатное ружьё"],
    ["gl-21", "support_weapons", ["down", "left", "up", "left", "down"], 0, "GL-21 Grenade Launcher", "GL-21 гранатомёт"],
    ["flam-40", "support_weapons", ["down", "left", "up", "down", "up"], 0, "FLAM-40 Flamethrower", "FLAM-40 огнемёт"],
    ["mg-206", "support_weapons", ["down", "left", "up", "down", "down"], 0, "MG-206 Heavy Machine Gun", "MG-206 тяжёлый пулемёт"],
    ["ac-8", "support_weapons", ["down", "left", "down", "up", "up", "right"], 0, "AC-8 Autocannon", "AC-8 автопушка"],
    ["arc-3", "support_weapons", ["down", "right", "down", "up", "left", "left"], 0, "ARC-3 Arc Thrower", "ARC-3 дуговой излучатель"],
    ["las-99", "support_weapons", ["down", "down", "up", "left", "right"], 0, "LAS-99 Quasar Cannon", "LAS-99 квазарная пушка"],
    ["rl-77", "support_weapons", ["down", "up", "up", "left", "right"], 0, "RL-77 Airburst Rocket Launcher", "RL-77 ракетница с воздушным подрывом"],
    ["mls-4x", "support_weapons", ["down", "left", "up", "down", "right"], 0, "MLS-4X Commando", "MLS-4X Commando"],
    ["faf-14", "support_weapons", ["down", "down", "up", "down", "down"], 0, "FAF-14 Spear", "FAF-14 Spear"],
    ["rs-422", "support_weapons", ["down", "right", "down", "up", "left", "right"], 0, "RS-422 Railgun", "RS-422 рейлган"],
    ["sta-x3", "support_weapons", ["down", "down", "up", "down", "right"], 0, "StA-X3 W.A.S.P. Launcher", "StA-X3 W.A.S.P."],
    ["cqc-20", "support_weapons", ["down", "left", "right", "left", "up"], U, "CQC-20 Breaching Hammer", "CQC-20 штурмовой молот"],
    ["plas-45", "support_weapons", [], U, "PLAS-45 Epoch", "PLAS-45 Epoch"],
    ["s-11", "support_weapons", [], U, "S-11 Speargun", "S-11 копьёмёт"],
    ["eat-700", "support_weapons", [], U, "EAT-700 Expendable Napalm", "EAT-700 напалм"],
    ["eat-411", "support_weapons", [], U, "EAT-411 Leveller", "EAT-411 Leveller"],
    ["gl-52", "support_weapons", ["down", "right", "up", "left", "right"], 0, "GL-52 De-Escalator", "GL-52 De-Escalator"],
    ["cqc-9", "support_weapons", [], U, "CQC-9 Defoliation Tool", "CQC-9 Defoliation Tool"],
    ["tx-41", "support_weapons", ["down", "left", "up", "down", "left"], 0, "TX-41 Sterilizer", "TX-41 Sterilizer"],
    ["gl-28", "support_weapons", [], U, "GL-28 Belt-Fed Grenade Launcher", "GL-28 ленточный гранатомёт"],
    ["ms-11", "support_weapons", [], U, "MS-11 Solo Silo", "MS-11 Solo Silo"],
    ["b-flam-80", "support_weapons", [], U, "B/FLAM-80 Cremator", "B/FLAM-80 Cremator"],
    ["m-1000", "support_weapons", [], U, "M-1000 Maxigun", "M-1000 Maxigun"],
    ["b-md-c4", "support_weapons", [], U, "B/MD C4 Pack", "B/MD C4 Pack"],
    ["cqc-1", "support_weapons", ["down", "left", "right", "right", "up"], 0, "CQC-1 One True Flag", "CQC-1 One True Flag"],

    // ——— Orbital ———
    ["orbital-precision", "orbital", ["right", "right", "up"], 0, "Orbital Precision Strike", "Орбитальный точечный удар"],
    ["orbital-gatling", "orbital", ["right", "down", "left", "up", "up"], 0, "Orbital Gatling Barrage", "Орбитальный миниган"],
    ["orbital-gas", "orbital", ["right", "right", "down", "right"], 0, "Orbital Gas Strike", "Орбитальный газовый удар"],
    ["orbital-120mm", "orbital", ["right", "right", "down", "left", "right", "down"], 0, "Orbital 120mm HE Barrage", "Орбитальный залп 120 мм"],
    ["orbital-airburst", "orbital", ["right", "right", "right"], 0, "Orbital Airburst Strike", "Орбитальный осколочный удар"],
    ["orbital-smoke", "orbital", ["right", "right", "down", "up"], 0, "Orbital Smoke Strike", "Орбитальный дымовой удар"],
    ["orbital-ems", "orbital", ["right", "right", "left", "down"], 0, "Orbital EMS Strike", "Орбитальный EMS-удар"],
    ["orbital-380mm", "orbital", ["right", "down", "up", "up", "left", "down", "down"], 0, "Orbital 380mm HE Barrage", "Орбитальный залп 380 мм"],
    ["orbital-walking", "orbital", ["right", "down", "right", "down", "right", "down"], 0, "Orbital Walking Barrage", "Орбитальный «шагающий» залп"],
    ["orbital-laser", "orbital", ["right", "down", "up", "right", "down"], 0, "Orbital Laser", "Орбитальный лазер"],
    ["orbital-napalm", "orbital", ["right", "right", "down", "left", "right", "up"], 0, "Orbital Napalm Barrage", "Орбитальный напалм"],
    ["orbital-railcannon", "orbital", ["right", "up", "down", "down", "right"], 0, "Orbital Railcannon Strike", "Орбитальный рейлган"],

    // ——— Eagle / Hangar ———
    ["eagle-strafe", "eagle", ["up", "right", "right"], 0, "Eagle Strafing Run", "Орёл: бронебойный заход"],
    ["eagle-airstrike", "eagle", ["up", "right", "down", "right"], 0, "Eagle Airstrike", "Орёл: авиаудар"],
    ["eagle-cluster", "eagle", ["up", "right", "down", "down", "right"], 0, "Eagle Cluster Bomb", "Орёл: кассетные бомбы"],
    ["eagle-napalm", "eagle", ["up", "right", "down", "up"], 0, "Eagle Napalm Airstrike", "Орёл: напалм"],
    ["eagle-smoke", "eagle", ["up", "right", "up", "down"], 0, "Eagle Smoke Strike", "Орёл: дым"],
    ["eagle-rockets", "eagle", ["up", "right", "up", "left"], 0, "Eagle 110mm Rocket Pods", "Орёл: НУРС 110 мм"],
    ["eagle-500kg", "eagle", ["up", "right", "down", "down", "down"], 0, "Eagle 500kg Bomb", "Орёл: бомба 500 кг"],
    ["jump-pack", "eagle", ["down", "up", "up", "down", "up"], 0, "LIFT-850 Jump Pack", "LIFT-850 прыжковый ранец"],

    // ——— Emplacements ———
    ["md-6", "emplacements", ["down", "left", "up", "right"], 0, "MD-6 Anti-Personnel Minefield", "MD-6 противопехотные мины"],
    ["md-i4", "emplacements", ["down", "left", "left", "down"], 0, "MD-I4 Incendiary Mines", "MD-I4 зажигательные мины"],
    ["md-17", "emplacements", ["down", "left", "up", "up"], 0, "MD-17 Anti-Tank Mines", "MD-17 противотанковые мины"],
    ["fx-12", "emplacements", ["down", "down", "left", "right", "left", "right"], 0, "FX-12 Shield Generator Relay", "FX-12 ретранслятор щита"],
    ["e-mg-101", "emplacements", ["down", "up", "left", "right", "right", "left"], 0, "E/MG-101 HMG Emplacement", "E/MG-101 пулемётное укрепление"],
    ["e-gl-21", "emplacements", ["down", "right", "down", "left", "right"], 0, "E/GL-21 Grenadier Battlement", "E/GL-21 гранатомётный бастион"],
    ["md-8", "emplacements", ["down", "left", "left", "right"], 0, "MD-8 Gas Mines", "MD-8 газовые мины"],
    ["e-at-12", "emplacements", ["down", "up", "left", "right", "right", "right"], 0, "E/AT-12 Anti-Tank Emplacement", "E/AT-12 ПТ укрепление"],

    // ——— Sentries ———
    ["a-mg-43", "sentries", ["down", "up", "right", "right", "up"], 0, "A/MG-43 Machine Gun Sentry", "A/MG-43 пулемётная турель"],
    ["a-g-16", "sentries", ["down", "up", "right", "left"], 0, "A/G-16 Gatling Sentry", "A/G-16 миниган-турель"],
    ["a-ac-8", "sentries", ["down", "up", "right", "up", "left", "up"], 0, "A/AC-8 Autocannon Sentry", "A/AC-8 автопушка-турель"],
    ["a-m-12", "sentries", ["down", "up", "right", "right", "down"], 0, "A/M-12 Mortar Sentry", "A/M-12 миномёт"],
    ["a-mls-4x", "sentries", ["down", "up", "right", "right", "left"], 0, "A/MLS-4X Rocket Sentry", "A/MLS-4X ракетная турель"],
    ["a-arc-3", "sentries", ["down", "up", "right", "up", "left", "right"], 0, "A/ARC-3 Tesla Tower", "A/ARC-3 тесла-башня"],
    ["a-m-23", "sentries", ["down", "up", "right", "down", "right"], 0, "A/M-23 EMS Mortar Sentry", "A/M-23 EMS-миномёт"],
    ["a-las-98", "sentries", [], U, "A/LAS-98 Laser Sentry", "A/LAS-98 лазерная турель"],
    ["a-flam-40", "sentries", ["down", "up", "right", "down", "up", "up"], 0, "A/FLAM-40 Flame Sentry", "A/FLAM-40 огнемётная турель"],
    ["a-gm-17", "sentries", [], U, "A/GM-17 Gas Mortar Sentry", "A/GM-17 газовый миномёт"],

    // ——— Backpacks ———
    ["b-1-supply", "backpacks", ["down", "left", "down", "up", "up", "down"], 0, "B-1 Supply Pack", "B-1 ранец снабжения"],
    ["sh-20", "backpacks", ["down", "left", "down", "down", "up", "left"], 0, "SH-20 Ballistic Shield Backpack", "SH-20 баллистический щит"],
    ["ax-ar-23", "backpacks", ["down", "up", "left", "up", "right", "down"], 0, 'AX/AR-23 "Guard Dog"', 'AX/AR-23 «Guard Dog»'],
    ["ax-las-5", "backpacks", ["down", "up", "left", "up", "right", "right"], 0, 'AX/LAS-5 "Guard Dog" Rover', 'AX/LAS-5 «Rover»'],
    ["sh-32", "backpacks", ["down", "up", "left", "right", "left", "right"], 0, "SH-32 Shield Generator Pack", "SH-32 генератор щита"],
    ["sh-51", "backpacks", ["down", "up", "left", "right", "up", "up"], 0, "SH-51 Directional Shield", "SH-51 направленный щит"],
    ["ax-flam-75", "backpacks", [], U, 'AX/FLAM-75 "Hot Dog"', 'AX/FLAM-75 «Hot Dog»'],
    ["b-100", "backpacks", ["down", "right", "up", "up", "up"], 0, "B-100 Portable Hellbomb", "B-100 переносная адская бомба"],
    ["ax-arc-3", "backpacks", ["down", "up", "left", "up", "right", "left"], 0, 'AX/ARC-3 "Guard Dog" K-9', 'AX/ARC-3 K-9'],
    ["lift-860", "backpacks", ["down", "up", "up", "down", "left", "right"], 0, "LIFT-860 Hover Pack", "LIFT-860 ранец-левитатор"],
    ["ax-tx-13", "backpacks", ["down", "up", "left", "up", "right", "up"], 0, 'AX/TX-13 "Dog Breath"', 'AX/TX-13 «Dog Breath»'],
    ["lift-182", "backpacks", [], U, "LIFT-182 Warp Pack", "LIFT-182 варп-ранец"],

    // ——— Vehicles ———
    ["exo-45", "vehicles", ["left", "down", "right", "up", "left", "down", "down"], 0, "EXO-45 Patriot Exosuit", "EXO-45 Patriot"],
    ["exo-49", "vehicles", ["left", "down", "right", "up", "left", "down", "up"], 0, "EXO-49 Emancipator Exosuit", "EXO-49 Emancipator"],
    ["m-102", "vehicles", ["left", "down", "right", "down", "right", "down", "up"], 0, "M-102 Fast Recon Vehicle", "M-102 FRV"],
    ["td-220", "vehicles", ["left", "down", "right", "down", "left", "down", "up", "down", "up"], U, "TD-220 Bastion MK XVI", "TD-220 Bastion"],

    // ——— Mission / general ———
    ["reinforce", "mission", ["up", "down", "right", "left", "up"], 0, "Reinforce", "Подкрепление"],
    ["resupply", "mission", ["down", "down", "up", "right"], 0, "Resupply", "Снабжение"],
    ["sos", "mission", ["up", "down", "right", "up"], 0, "SOS Beacon", "Маяк SOS"],
    ["eagle-rearm", "mission", ["up", "up", "left", "up", "right"], 0, "Eagle Rearm", "Перезарядка Орла"],
    ["call-super-destroyer", "mission", [], U, "Call In Super Destroyer", "Вызов суперразрушителя"],
    ["illumination-flare", "mission", ["right", "right", "left", "left"], U, "Orbital Illumination Flare", "Орбитальная освет. ракета"],
    ["hellbomb", "mission", ["down", "up", "left", "down", "up", "right", "down", "up"], 0, "NUX-223 Hellbomb (objective)", "Адская бомба (объектив)"],
    ["seismic-probe", "mission", ["up", "up", "left", "right", "down", "down"], 0, "Seismic Probe", "Сейсмический зонд"],
    ["upload-data", "mission", ["left", "right", "up", "up", "up"], 0, "Upload Data (objective)", "Загрузка данных"],
    ["sssd", "mission", ["down", "down", "down", "up", "up"], U, "SSSD Delivery", "Доставка SSSD"],
    ["super-flag", "mission", ["down", "up", "down", "up"], U, "Super Earth Flag", "Флаг Супер-Земли"],
    ["seaf", "mission", ["right", "up", "up", "down"], U, "SEAF Artillery", "Артиллерия SEAF"],
  ];

  // Russian locale uses English strings from https://helldivers.wiki.gg/wiki/Stratagems (no official RU wiki).
  window.HD2_STRATAGEMS = RAW.map(([id, category, code, unverified, en]) => ({
    id,
    category,
    code,
    unverified: !!unverified,
    names: { en, ru: en },
  }));

})();
