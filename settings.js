/* Stratagem Hero — default config, load/save, merge helpers (localStorage + cookie shards). */
(function (global) {
  "use strict";

  const STORAGE_KEY = "stratagem-hero-config-v5";
  const LEGACY_STORAGE_KEYS = ["stratagem-hero-config-v4", "stratagem-hero-config-v3"];
  const COOKIE_PREFIX = "sh5";
  const COOKIE_CHUNK = 2800;
  const COOKIE_MAX_CHUNKS = 28;
  const COOKIE_MAX_AGE_SEC = 365 * 24 * 3600;
  const DEFAULT_LEVELS = 10;

  /** Default General Brasch anthem (local file; spaces OK — classic-game encodes URI). */
  const DEFAULT_BRASCH_ANTHEM_PATH = "assets/audio/helldivers_2_12. Super Earth National Anthem.mp3";
  /** Placeholder portrait; replace with your own asset (e.g. from wiki) if desired. */
  const DEFAULT_BRASCH_PORTRAIT_PATH = "assets/images/general-brasch.svg";

  let saveNotifier = function () {};

  function setSaveNotifier(fn) {
    saveNotifier = typeof fn === "function" ? fn : function () {};
  }

  /** Progressive defaults: shorter time, higher rewards and harsher penalties on later levels. */
  function generatedLevelRow(i) {
    const n = DEFAULT_LEVELS;
    const t = n <= 1 ? 0 : (i - 1) / (n - 1);
    const timeMs = Math.round(Math.max(3200, 14600 - t * (14600 - 3400)));
    const successPoints = Math.max(1, Math.round(1 + t * 7));
    const failPenaltyPoints = Math.min(6, Math.ceil(t * 5) || 0);
    const wrongTimeDebtMs = Math.round(120 + t * t * 880);
    return {
      level: i,
      timeMs,
      successPoints,
      failPenaltyPoints,
      wrongTimeDebtMs,
    };
  }

  function buildDefaultLevels() {
    const out = [];
    for (let j = 1; j <= DEFAULT_LEVELS; j++) {
      out.push(generatedLevelRow(j));
    }
    return out;
  }

  function defaultConfig() {
    const levels = buildDefaultLevels();
    return {
      version: 5,
      locale: "en",
      usePatchBackgrounds: true,
      superEarthWatermark: true,
      theme: {
        type: "none",
        mp3DataUrl: "",
        mp3Url: "",
        youtubeUrl: "",
        youtubeMuted: false,
      },
      bindings: {
        up: ["KeyW", "ArrowUp"],
        down: ["KeyS", "ArrowDown"],
        left: ["KeyA", "ArrowLeft"],
        right: ["KeyD", "ArrowRight"],
      },
      levels,
      globalPlayfieldBg: "",
      globalCardBg: "",
      terminalBackground: "",
      terminalBackgroundDataUrl: "",
      enableSwipes: true,
      swipeMinDistance: 48,
      includeIncomplete: false,
      stratagemOverrides: {},
      gameRules: {
        maxErrors: 3,
        countTimeoutAsError: true,
        countWrongAsError: true,
      },
      /** Cyberstan / Automaton overlay during classic play (success streak → timed tint). */
      classicInvasion: {
        enabled: true,
        successesMin: 10,
        successesMax: 12,
        durationMinMs: 20000,
        durationMaxMs: 40000,
        warnLeadMs: 4000,
      },
      /** Illuminate / Illuminati-style overlay (same mechanic, separate streak). */
      classicIlluminatiInvasion: {
        enabled: true,
        successesMin: 10,
        successesMax: 12,
        durationMinMs: 20000,
        durationMaxMs: 40000,
        /** Blinking banner this many ms before the purple/RTL phase starts. */
        warnLeadMs: 5000,
      },
      /** Terminid spore fog overlay (same streak mechanic as other classic invasions). */
      classicTerminidInvasion: {
        enabled: true,
        successesMin: 10,
        successesMax: 12,
        durationMinMs: 20000,
        durationMaxMs: 40000,
        warnLeadMs: 4000,
        /** Layer opacity oscillates between these (0–1). */
        fogOpacityMin: 0.4,
        fogOpacityMax: 0.8,
        /** One full min→max→min cycle (ms). */
        fogPulsePeriodMs: 4500,
        /** Optional image URL/path; empty = built-in myst.png */
        fogImageUrl: "",
      },
      /** Order in which invasions are attempted each success; first eligible trigger wins (others skip that frame). */
      classicInvasionPriority: "automaton",
      /** Add ?kiosk=1 on load when the URL has no kiosk flag (disable in Settings). */
      defaultKiosk: true,
      /** In kiosk mode, do not auto-start a run; keep the normal Start game screen. */
      kioskDisableAutoStart: false,
      kioskModes: [
        {
          id: "easy",
          name: "Easy",
          enabled: true,
          lives: 0,
          timerEnabled: false,
          timerMs: 0,
          invasions: { automaton: true, illuminate: true, terminid: true, brasch: true },
        },
        {
          id: "sprint30",
          name: "Sprint (30s)",
          enabled: true,
          lives: 3,
          timerEnabled: true,
          timerMs: 30000,
          invasions: { automaton: true, illuminate: true, terminid: true, brasch: true },
        },
        {
          id: "lottery",
          name: "Lottery",
          enabled: true,
          lives: 1,
          timerEnabled: false,
          timerMs: 0,
          invasions: { automaton: true, illuminate: true, terminid: true, brasch: true },
        },
        {
          id: "marathon5",
          name: "Marathon (5 min)",
          enabled: true,
          lives: 3,
          timerEnabled: true,
          timerMs: 300000,
          invasions: { automaton: true, illuminate: true, terminid: true, brasch: true },
        },
      ],
      endScreenDefeat: {
        title: "",
        message: "",
        linkUrl: "",
        linkText: "",
        qrUrl: "",
        showQr: true,
        imageDataUrl: "",
      },
      endScreenVictory: {
        title: "",
        message: "",
        linkUrl: "",
        linkText: "",
        qrUrl: "",
        showQr: true,
        imageDataUrl: "",
      },
      /** Short feedback when pressing direction keys (Web Audio beeps). */
      directionSoundsMuted: false,
      /** Space restarts the run (play panel; not while typing in inputs). */
      restartOnSpace: false,
      /** After a final screen in kiosk, auto-start the same festival preset. */
      kioskAutoRestart: false,
      /** Delay before kiosk auto-restart (ms). */
      kioskAutoRestartDelayMs: 4000,
      /** Bumped on every save; used to pick newer data between localStorage and cookies. */
      savedAt: 0,
      /** Howler master volume (0–1); classic StratagemHero.com-style SFX + music. */
      sfxVolume: 0.82,
      /** Classic mode: every N completed stratagems → “General Brasch” (bigger UI, anthem, round timer paused). */
      generalBrasch: {
        enabled: true,
        everyNStratagems: 50,
        durationMs: 10000,
        warnLeadMs: 4000,
        anthemUrl: DEFAULT_BRASCH_ANTHEM_PATH,
        anthemVolume: 0.75,
        portraitUrl: DEFAULT_BRASCH_PORTRAIT_PATH,
      },
    };
  }

  function deepMerge(a, b) {
    if (!b || typeof b !== "object") return a;
    const out = Array.isArray(a) ? [...a] : { ...a };
    for (const k of Object.keys(b)) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && typeof out[k] === "object" && !Array.isArray(out[k])) {
        out[k] = deepMerge(out[k] || {}, b[k]);
      } else {
        out[k] = b[k];
      }
    }
    return out;
  }

  function readCookieMap() {
    const out = {};
    if (!document.cookie) return out;
    document.cookie.split(";").forEach((part) => {
      const trimmed = part.trim();
      const eq = trimmed.indexOf("=");
      if (eq < 0) return;
      const k = trimmed.slice(0, eq);
      const v = trimmed.slice(eq + 1);
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    });
    return out;
  }

  function clearCookieShards(prefix) {
    for (let i = 0; i < COOKIE_MAX_CHUNKS + 2; i++) {
      document.cookie = `${prefix}_${i}=; path=/; max-age=0; SameSite=Lax`;
    }
    document.cookie = `${prefix}_n=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${prefix}_os=; path=/; max-age=0; SameSite=Lax`;
  }

  function readConfigFromCookies() {
    const m = readCookieMap();
    if (m[`${COOKIE_PREFIX}_os`] === "1") return null;
    const n = parseInt(m[`${COOKIE_PREFIX}_n`], 10);
    if (!Number.isFinite(n) || n < 1 || n > COOKIE_MAX_CHUNKS) return null;
    let s = "";
    for (let i = 0; i < n; i++) {
      const part = m[`${COOKIE_PREFIX}_${i}`];
      if (part === undefined) return null;
      s += part;
    }
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function writeConfigCookies(jsonStr) {
    clearCookieShards(COOKIE_PREFIX);
    const n = Math.ceil(jsonStr.length / COOKIE_CHUNK);
    if (n > COOKIE_MAX_CHUNKS) {
      document.cookie = `${COOKIE_PREFIX}_os=1; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
      document.cookie = `${COOKIE_PREFIX}_n=; path=/; max-age=0; SameSite=Lax`;
      return;
    }
    document.cookie = `${COOKIE_PREFIX}_os=0; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
    document.cookie = `${COOKIE_PREFIX}_n=${n}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
    for (let i = 0; i < n; i++) {
      const slice = jsonStr.slice(i * COOKIE_CHUNK, (i + 1) * COOKIE_CHUNK);
      document.cookie = `${COOKIE_PREFIX}_${i}=${encodeURIComponent(slice)}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
    }
  }

  function emptyFinalScreen() {
    return {
      title: "",
      message: "",
      linkUrl: "",
      linkText: "",
      qrUrl: "",
      /** When false, QR block is hidden even if qrUrl is set. */
      showQr: true,
      imageDataUrl: "",
    };
  }

  /** Old saves used a single `endScreen`; merge into defeat and normalize both blocks. */
  function migrateFinalScreens(cfg) {
    let dirty = false;
    if (cfg.endScreen && typeof cfg.endScreen === "object") {
      cfg.endScreenDefeat = deepMerge(deepMerge(emptyFinalScreen(), cfg.endScreenDefeat || {}), cfg.endScreen);
      delete cfg.endScreen;
      dirty = true;
    }
    cfg.endScreenDefeat = deepMerge(emptyFinalScreen(), cfg.endScreenDefeat || {});
    cfg.endScreenVictory = deepMerge(emptyFinalScreen(), cfg.endScreenVictory || {});
    return dirty;
  }

  function pickNum(row, key, fallback, minVal) {
    if (row[key] == null || row[key] === "") return fallback;
    const n = Number(row[key]);
    if (Number.isNaN(n)) return fallback;
    return Math.max(minVal, n);
  }

  function normalizeLevels(levels) {
    const def = buildDefaultLevels();
    if (!Array.isArray(levels) || !levels.length) return def;
    return levels.map((row, idx) => {
      const d = def[idx] || def[def.length - 1] || generatedLevelRow(idx + 1);
      const lv = row.level != null ? row.level : idx + 1;
      return {
        level: lv,
        timeMs: pickNum(row, "timeMs", d.timeMs, 500),
        successPoints: pickNum(row, "successPoints", d.successPoints, 0),
        failPenaltyPoints: pickNum(row, "failPenaltyPoints", d.failPenaltyPoints, 0),
        wrongTimeDebtMs: pickNum(row, "wrongTimeDebtMs", d.wrongTimeDebtMs, 0),
      };
    });
  }

  /** Old saves had penalty/debt forced to 0 by wrong normalize fallbacks — restore from template curve. */
  function repairAllZeroPenalties(levels) {
    const def = buildDefaultLevels();
    if (!Array.isArray(levels) || levels.length === 0) return false;
    const allZero = levels.every((row) => (Number(row.failPenaltyPoints) || 0) === 0 && (Number(row.wrongTimeDebtMs) || 0) === 0);
    if (!allZero) return false;
    const templateHasPressure = def.some((d) => d.failPenaltyPoints > 0 || d.wrongTimeDebtMs > 200);
    if (!templateHasPressure) return false;
    levels.forEach((row, idx) => {
      const d = def[idx] || def[def.length - 1];
      row.failPenaltyPoints = d.failPenaltyPoints;
      row.wrongTimeDebtMs = d.wrongTimeDebtMs;
    });
    return true;
  }

  function saveConfig(cfg, opts) {
    cfg.savedAt = Date.now();
    const jsonStr = JSON.stringify(cfg);
    try {
      localStorage.setItem(STORAGE_KEY, jsonStr);
    } catch {
      /* quota */
    }
    try {
      writeConfigCookies(jsonStr);
    } catch {
      /* cookie size / privacy mode */
    }
    if (opts && opts.suppressSettingsToast) return;
    saveNotifier();
  }

  function loadConfig() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      let legacyKey = null;
      if (!raw) {
        for (const k of LEGACY_STORAGE_KEYS) {
          raw = localStorage.getItem(k);
          if (raw) {
            legacyKey = k;
            break;
          }
        }
      }
      const cookieParsed = readConfigFromCookies();
      if (raw && cookieParsed) {
        try {
          const lsP = JSON.parse(raw);
          const ca = Number(cookieParsed.savedAt) || 0;
          const lb = Number(lsP.savedAt) || 0;
          if (ca > lb) raw = JSON.stringify(cookieParsed);
        } catch {
          /* keep raw */
        }
      } else if (!raw && cookieParsed) {
        raw = JSON.stringify(cookieParsed);
      }
      if (!raw) return defaultConfig();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.levels)) {
        parsed.levels = normalizeLevels(parsed.levels);
      }
      const merged = deepMerge(defaultConfig(), parsed);
      const migratedScreens = migrateFinalScreens(merged);
      merged.version = 5;
      const repaired = repairAllZeroPenalties(merged.levels);
      if (repaired || legacyKey || migratedScreens) saveConfig(merged, { suppressSettingsToast: true });
      return merged;
    } catch {
      return defaultConfig();
    }
  }

  global.SH2_SETTINGS = {
    STORAGE_KEY,
    DEFAULT_LEVELS,
    setSaveNotifier,
    generatedLevelRow,
    buildDefaultLevels,
    defaultConfig,
    deepMerge,
    emptyFinalScreen,
    migrateFinalScreens,
    loadConfig,
    saveConfig,
  };
})(typeof window !== "undefined" ? window : globalThis);
