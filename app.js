/* global HD2_STRATAGEMS, SH2_I18N, HD2_ASSETS, QRCode, HD2_LOADING_LINES */
(function () {
  const STORAGE_KEY = "stratagem-hero-config-v5";
  const LEGACY_STORAGE_KEYS = ["stratagem-hero-config-v4", "stratagem-hero-config-v3"];
  const COOKIE_PREFIX = "sh5";
  const COOKIE_CHUNK = 2800;
  const COOKIE_MAX_CHUNKS = 28;
  const COOKIE_MAX_AGE_SEC = 365 * 24 * 3600;
  const DEFAULT_LEVELS = 10;
  /** drizzer14/stratagem-hero timer: ~60 Hz tick, constant drain, refill per stratagem. */
  const DRIZZER_TICK_MS = 1000 / 60;
  const DRIZZER_PRESSURE_DEC = 0.2;
  const DRIZZER_PRESSURE_BONUS = 20.664;
  const NORMAL_TICK_MS = 120;
  /** Local Helldivers-style direction arrows (see assets/THIRD_PARTY.txt). */
  const ARROW_IMG = {
    up: "assets/images/arrows/arrow-up.svg",
    down: "assets/images/arrows/arrow-down.svg",
    left: "assets/images/arrows/arrow-left.svg",
    right: "assets/images/arrows/arrow-right.svg",
  };
  /** Lives HUD skull uses local favicon asset (see assets/images/branding/). */
  const HUD_SKULL_IMG_URL = "assets/images/branding/favicon-192.png";

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
      endScreenDefeat: {
        title: "",
        message: "",
        linkUrl: "",
        linkText: "",
        qrUrl: "",
        imageDataUrl: "",
      },
      endScreenVictory: {
        title: "",
        message: "",
        linkUrl: "",
        linkText: "",
        qrUrl: "",
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
    };
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

  /** After settings writes: show toast when Settings panel is open (see init). */
  let afterSaveSettingsToast = () => {};

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
    afterSaveSettingsToast();
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    const bin = atob(b64.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function parseYoutubeEmbed(url, youtubeMuted) {
    if (!url || typeof url !== "string") return null;
    let videoId = null;
    let listId = null;
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        videoId = u.pathname.slice(1).split("/")[0];
      } else if (u.searchParams.get("v")) {
        videoId = u.searchParams.get("v");
      }
      listId = u.searchParams.get("list") || null;
    } catch {
      return null;
    }
    if (!videoId && !listId) return null;
    /** Browsers allow muted autoplay reliably; unmuted often blocked until a user gesture. */
    const baseMute = youtubeMuted ? "1" : "0";
    let pageOrigin = "";
    try {
      pageOrigin = window.location.origin || "";
    } catch {
      pageOrigin = "";
    }
    const common = {
      autoplay: "1",
      mute: baseMute,
      controls: "0",
      rel: "0",
      playsinline: "1",
      ...(pageOrigin ? { origin: pageOrigin } : {}),
    };
    if (listId && !videoId) {
      const q = new URLSearchParams({
        ...common,
        list: listId,
      });
      return `https://www.youtube-nocookie.com/embed/videoseries?${q.toString()}`;
    }
    const params = new URLSearchParams({
      ...common,
      loop: "1",
      playlist: videoId,
    });
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
  }

  function mergedStratagem(base, ov) {
    const o = ov || {};
    const code = Array.isArray(o.code) ? [...o.code] : [...base.code];
    const userVerified = !!o.verified;
    return {
      ...base,
      code,
      cardBackground: o.cardBackground ?? "",
      playfieldBackground: o.playfieldBackground ?? "",
      musicUrl: o.musicUrl ?? "",
      iconFile: o.iconFile != null ? String(o.iconFile) : "",
      levelSpeedMul: o.levelSpeedMul || {},
      unverified: base.unverified && !userVerified,
    };
  }

  function getStratagemList(cfg) {
    return HD2_STRATAGEMS.map((b) => mergedStratagem(b, cfg.stratagemOverrides[b.id]));
  }

  function eligiblePool(cfg, list) {
    return list.filter((s) => cfg.includeIncomplete || (s.code && s.code.length > 0));
  }

  const cfg = loadConfig();
  let run = null;
  /** Kiosk: delayed restart after closing the final modal. */
  let kioskAutoRestartTimer = null;
  let bindTarget = null;
  let editorSeq = [];
  let touchStart = null;
  /** Last festival / kiosk mode used for «Start over». */
  let lastKioskPreset = "easy";

  const el = (id) => document.getElementById(id);

  let stratagemKeyAudioCtx = null;
  const STRATAGEM_DIR_FREQ_HZ = { up: 523.25, down: 196, left: 392, right: 659.25 };

  function playStratagemDirectionSound(dir) {
    if (cfg.directionSoundsMuted) return;
    const freq = STRATAGEM_DIR_FREQ_HZ[dir];
    if (!freq) return;
    try {
      if (!stratagemKeyAudioCtx) {
        stratagemKeyAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = stratagemKeyAudioCtx;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch {
      /* ignore */
    }
  }

  function isKioskMode() {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.has("kiosk") || p.get("kiosk") === "1" || p.get("kiosk") === "true";
    } catch {
      return false;
    }
  }

  function setKioskQueryParam(on) {
    try {
      const url = new URL(window.location.href);
      if (on) url.searchParams.set("kiosk", "1");
      else url.searchParams.delete("kiosk");
      const next = url.pathname + url.search + url.hash;
      history.replaceState(null, "", next);
    } catch {
      /* ignore */
    }
    syncKioskLayout();
  }

  function syncKioskLayout() {
    const on = isKioskMode();
    const km = el("kioskMenu");
    const pd = el("playControlsDefault");
    const btnKiosk = el("btnKiosk");
    const btnExit = el("btnExitKiosk");

    if (on) {
      document.documentElement.classList.add("kiosk-mode");
      document.body.classList.add("kiosk-mode");
      if (km) km.hidden = false;
      if (pd) pd.style.display = "none";
      ["btnSettings", "btnEditor", "btnPlay", "btnKiosk"].forEach((id) => {
        const n = el(id);
        if (n) n.style.display = "none";
      });
      if (btnExit) {
        btnExit.hidden = false;
        btnExit.style.display = "";
      }
    } else {
      cancelKioskAutoRestart();
      document.documentElement.classList.remove("kiosk-mode");
      document.body.classList.remove("kiosk-mode");
      if (km) km.hidden = true;
      if (pd) pd.style.display = "";
      ["btnSettings", "btnEditor", "btnPlay"].forEach((id) => {
        const n = el(id);
        if (n) n.style.display = "";
      });
      if (btnKiosk) btnKiosk.style.display = "";
      if (btnExit) {
        btnExit.hidden = true;
        btnExit.style.display = "none";
      }
    }
    updateKioskArcadeSplash();
    if (on) autoMarathonIfKiosk();
  }

  function updateKioskArcadeSplash() {
    const splash = el("kioskArcadeSplash");
    const pf = el("playfield");
    if (pf) pf.classList.toggle("playfield--arcade", isKioskMode());
    if (!splash) return;
    const classicOn = typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive();
    const legacyRun = run && run.active;
    splash.hidden = !(isKioskMode() && !classicOn && !legacyRun);
  }

  /** Kiosk: start 5‑min marathon automatically; any stratagem key also starts if idle. */
  function autoMarathonIfKiosk() {
    if (!isKioskMode()) return;
    const panelPlay = el("panelPlay");
    if (!panelPlay || !panelPlay.classList.contains("active")) return;
    if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive()) return;
    if (run && run.active) return;
    if (bindTarget) return;
    const modal = el("gameOverModal");
    if (modal && !modal.hidden) return;
    const list = getStratagemList(cfg);
    if (!eligiblePool(cfg, list).length) return;
    startKioskRun("marathon5");
  }

  function usesKioskPressureTimer() {
    return isKioskMode() && run && run.active && run.kioskPreset;
  }

  function randomAutomatonStratThreshold() {
    return 10 + Math.floor(Math.random() * 3);
  }

  function initRunAutomatonState(runObj) {
    if (!runObj) return;
    runObj.automatonStratCount = 0;
    runObj.automatonNextAt = randomAutomatonStratThreshold();
    runObj.automatonUntil = null;
  }

  function isAutomatonTakeoverActive() {
    return !!(run && run.active && run.automatonUntil && Date.now() < run.automatonUntil);
  }

  function syncAutomatonTakeoverUi() {
    const on = isAutomatonTakeoverActive();
    document.documentElement.classList.toggle("automaton-takeover", on);
    const cw = el("cyberstanWatermark");
    if (cw) cw.hidden = !on;
  }

  function maybeEndAutomatonTakeover() {
    if (!run || !run.active || !run.automatonUntil || Date.now() < run.automatonUntil) return;
    run.automatonUntil = null;
    syncAutomatonTakeoverUi();
    applyPlayfieldForStratagem(run.current && run.current.strat ? run.current.strat : null);
  }

  function tryAutomatonTakeoverAfterSuccess() {
    if (!run || !run.active || isAutomatonTakeoverActive()) return;
    if (run.automatonNextAt == null) run.automatonNextAt = randomAutomatonStratThreshold();
    run.automatonStratCount = (run.automatonStratCount || 0) + 1;
    if (run.automatonStratCount < run.automatonNextAt) return;
    run.automatonStratCount = 0;
    run.automatonNextAt = randomAutomatonStratThreshold();
    run.automatonUntil = Date.now() + 20000 + Math.random() * 20000;
    syncAutomatonTakeoverUi();
  }

  function clearAutomatonTakeoverForRunEnd() {
    if (run) run.automatonUntil = null;
    syncAutomatonTakeoverUi();
  }

  function formatSessionLeft(ms) {
    const x = Math.max(0, ms);
    if (x >= 60000) {
      const s = Math.ceil(x / 1000);
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${String(r).padStart(2, "0")}`;
    }
    return `${Math.ceil(x / 1000)}s`;
  }

  function updateSessionHud() {
    const node = el("hudSession");
    if (!node) return;
    if (!run || !run.active || run.sessionDeadline == null) {
      node.textContent = "";
      node.hidden = true;
      return;
    }
    node.hidden = false;
    node.textContent = `${t("kioskSession")} ${formatSessionLeft(run.sessionDeadline - Date.now())}`;
  }

  function applyFinalScreenQr(qrUrl) {
    const wrap = el("gameOverQrWrap");
    const img = el("gameOverQr");
    const url = (qrUrl || "").trim();
    if (!wrap || !img) return;
    img.removeAttribute("src");
    img.alt = "";
    if (!url) {
      wrap.hidden = true;
      return;
    }
    if (typeof QRCode === "undefined" || typeof QRCode.toDataURL !== "function") {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    QRCode.toDataURL(url, { margin: 2, width: 220 }, (err, dataUrl) => {
      if (err || !dataUrl) {
        wrap.hidden = true;
        return;
      }
      img.src = dataUrl;
      img.alt = url;
    });
  }

  /**
   * @param {"defeat"|"victory"} kind
   * @param {number} score
   * @param {{ title?: string, message?: string } | null} fallbacks — i18n strings; message may contain {score}
   */
  function showFinalScreenModal(kind, score, fallbacks) {
    const modal = el("gameOverModal");
    if (!modal) return;
    const cfgKey = kind === "victory" ? "endScreenVictory" : "endScreenDefeat";
    const es = deepMerge(emptyFinalScreen(), cfg[cfgKey] || {});
    const defaultTitleKey = kind === "victory" ? "finalScreenVictoryDefaultTitle" : "finalScreenDefeatDefaultTitle";
    const defaultScoreKey = kind === "victory" ? "finalScreenVictoryScoreLine" : "finalScreenDefeatScoreLine";
    const scoreLine = t(defaultScoreKey).replace("{score}", String(score));

    let title = (es.title || "").trim();
    if (!title) title = (fallbacks && fallbacks.title) || t(defaultTitleKey);

    let msg = (es.message || "").trim();
    if (msg) {
      msg = msg.replace(/\{score\}/g, String(score));
    } else if (fallbacks && fallbacks.message) {
      msg = String(fallbacks.message).replace(/\{score\}/g, String(score));
    } else {
      msg = scoreLine;
    }

    el("gameOverTitleText").textContent = title;
    el("gameOverMessageText").textContent = msg;

    const imgEl = el("gameOverImage");
    const data = (es.imageDataUrl || "").trim();
    if (imgEl) {
      if (data) {
        imgEl.src = data;
        imgEl.hidden = false;
        imgEl.alt = "";
      } else {
        imgEl.removeAttribute("src");
        imgEl.hidden = true;
      }
    }

    const link = el("gameOverLink");
    const url = (es.linkUrl || "").trim();
    const linkText = (es.linkText || "").trim() || url;
    if (link) {
      if (url) {
        link.href = url;
        link.textContent = linkText;
        link.hidden = false;
      } else {
        link.hidden = true;
        link.removeAttribute("href");
        link.textContent = "";
      }
    }

    applyFinalScreenQr(es.qrUrl);
    modal.hidden = false;
    const closeBtn = el("gameOverClose");
    if (closeBtn) {
      requestAnimationFrame(() => {
        try {
          closeBtn.focus({ preventScroll: true });
        } catch {
          closeBtn.focus();
        }
      });
    }
    updateKioskArcadeSplash();
  }

  function kioskEndReason(kind) {
    stopLoadingLineTicker();
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    const score = run ? run.score : 0;
    if (run) run.active = false;
    clearAutomatonTakeoverForRunEnd();
    touchStart = null;
    setPlayfieldTouchMode(false);
    el("stratAudio").pause();
    updateTimerHud();
    updateSessionHud();
    updateErrorsHud();
    setStratagemIcon(null);
    applyGlobalBackgrounds();
    el("playHint").textContent = t("kioskPickMode");
    if (kind === "lottery") {
      showFinalScreenModal("defeat", score, {
        title: t("kioskLotteryEndTitle"),
        message: t("kioskLotteryEndMsg"),
      });
    } else if (kind === "marathon") {
      showFinalScreenModal("victory", score, {
        title: t("kioskMarathonEndTitle"),
        message: t("kioskTimedEndMsg"),
      });
    } else {
      showFinalScreenModal("victory", score, {
        title: t("kioskSprintEndTitle"),
        message: t("kioskTimedEndMsg"),
      });
    }
  }

  function kioskPressureDepleted() {
    stopLoadingLineTicker();
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    const score = run ? run.score : 0;
    if (run) run.active = false;
    clearAutomatonTakeoverForRunEnd();
    touchStart = null;
    setPlayfieldTouchMode(false);
    el("stratAudio").pause();
    updateTimerHud();
    updateSessionHud();
    updateErrorsHud();
    setStratagemIcon(null);
    applyGlobalBackgrounds();
    el("playHint").textContent = t("kioskPickMode");
    showFinalScreenModal("defeat", score, {
      title: t("kioskPressureEndTitle"),
      message: t("kioskPressureEndMsg"),
    });
  }

  function kioskPresetHint(preset) {
    const map = {
      easy: "kioskHintEasy",
      sprint30: "kioskHintSprint",
      lottery: "kioskHintLottery",
      marathon5: "kioskHintMarathon",
    };
    const k = map[preset];
    return k ? t(k) : "";
  }

  function startKioskRun(preset) {
    const list = getStratagemList(cfg);
    const pool = eligiblePool(cfg, list);
    if (!pool.length) {
      const ph = el("playHint");
      if (ph) {
        ph.textContent = t("noCodeWarning");
        ph.hidden = false;
      }
      setPlayfieldTouchMode(false);
      return;
    }
    const ph = el("playHint");
    if (ph) ph.hidden = true;
    lastKioskPreset = preset;
    hideGameOverModal();
    stopLegacyRunOnly();
    if (typeof ClassicStratagemHero === "undefined") return;
    if (ClassicStratagemHero.isActive()) ClassicStratagemHero.stop();
    ClassicStratagemHero.start(getClassicKioskOpts(preset));
    ClassicStratagemHero.beginFromButton();
    updateKioskArcadeSplash();
  }

  function t(key) {
    return SH2_I18N.t(cfg.locale, key);
  }

  let settingsSavedToastTimer = null;
  function showSettingsSavedToast() {
    const node = el("settingsSavedToast");
    if (!node) return;
    node.textContent = t("settingsSaved");
    node.hidden = false;
    node.classList.add("settings-saved-toast--show");
    clearTimeout(settingsSavedToastTimer);
    settingsSavedToastTimer = setTimeout(() => {
      node.classList.remove("settings-saved-toast--show");
      node.hidden = true;
    }, 2200);
  }

  function syncDirectionSoundsMuteUi() {
    const muted = !!cfg.directionSoundsMuted;
    const btn = el("btnDirectionSoundsMute");
    if (btn) {
      btn.setAttribute("aria-pressed", muted ? "true" : "false");
      btn.textContent = muted ? t("directionSoundsUnmute") : t("directionSoundsMute");
    }
    const cb = el("directionSoundsMutedCheck");
    if (cb) cb.checked = muted;
  }

  function applyI18nDom() {
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const k = node.getAttribute("data-i18n");
      if (k) node.textContent = t(k);
    });
    const sel = el("localeSelect");
    if (sel) sel.value = cfg.locale;
    syncDirectionSoundsMuteUi();
    updateKioskArcadeSplash();
  }

  function showPanel(name) {
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    const map = { play: "panelPlay", settings: "panelSettings", editor: "panelEditor" };
    const id = map[name] || "panelPlay";
    const panel = el(id);
    if (panel) panel.classList.add("active");
    if (name !== "play") {
      stopLoadingLineTicker();
      if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive()) {
        ClassicStratagemHero.stop();
      }
    } else {
      ensureClassicAttractMode();
    }
  }

  function applyTerminalBackground() {
    const extra = (cfg.terminalBackground || "").trim();
    const data = (cfg.terminalBackgroundDataUrl || "").trim();
    if (!extra && !data) {
      document.body.style.background = "";
      document.body.style.backgroundAttachment = "";
      return;
    }
    const layers = [];
    if (extra) layers.push(extra);
    if (data) layers.push(`url("${data}") center center / cover no-repeat fixed`);
    document.body.style.background = layers.join(", ");
    document.body.style.backgroundAttachment = "";
  }

  function setPlayfieldTouchMode(active) {
    const pf = el("playfield");
    if (pf) pf.classList.toggle("playfield--touch-game", !!active);
  }

  function applyTheme() {
    const backdrop = el("youtubeBackdrop");
    const audio = el("bgAudio");
    backdrop.innerHTML = "";
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    if (cfg.theme.type === "youtube" && cfg.theme.youtubeUrl) {
      const src = parseYoutubeEmbed(cfg.theme.youtubeUrl, cfg.theme.youtubeMuted);
      if (src) {
        const iframe = document.createElement("iframe");
        iframe.src = src;
        iframe.title = "YouTube background";
        /* Do not use loading="lazy" — delayed load breaks autoplay policy / player start. */
        iframe.allow =
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        backdrop.appendChild(iframe);
      }
    } else if (cfg.theme.type === "mp3") {
      const url = cfg.theme.mp3DataUrl || cfg.theme.mp3Url;
      if (url) {
        audio.src = url;
        audio.volume = 0.6;
        audio.play().catch(() => {});
      }
    }
  }

  function makeChevronChip(dir, cls) {
    const wrap = document.createElement("span");
    wrap.className = `hd-arrow-chip ${cls || ""}`.trim();
    wrap.dataset.dir = dir;
    const img = document.createElement("img");
    img.className = "hd-chevron-svg";
    img.src = ARROW_IMG[dir] || ARROW_IMG.up;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    img.loading = "eager";
    wrap.appendChild(img);
    return wrap;
  }

  function applyPlayfieldForStratagem(strat) {
    const pf = document.querySelector(".playfield");
    if (!pf) return;
    if (isAutomatonTakeoverActive()) {
      pf.style.backgroundColor = "#0c0608";
      pf.style.backgroundImage = [
        "radial-gradient(ellipse 120% 85% at 50% 18%, rgba(130, 28, 22, 0.55) 0%, transparent 52%)",
        "radial-gradient(ellipse 85% 65% at 85% 95%, rgba(35, 48, 68, 0.5) 0%, transparent 48%)",
        "linear-gradient(168deg, rgba(28, 14, 16, 0.98) 0%, rgba(6, 4, 8, 0.99) 55%, rgba(10, 8, 14, 1) 100%)",
        "repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(255, 45, 35, 0.045) 4px, rgba(255, 45, 35, 0.045) 8px)",
        "repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(200, 210, 220, 0.025) 40px, rgba(200, 210, 220, 0.025) 41px)",
      ].join(", ");
      pf.style.backgroundSize = "cover, cover, cover, auto, auto";
      pf.style.backgroundPosition = "center, center, center, center, center";
      pf.style.backgroundRepeat = "no-repeat, no-repeat, no-repeat, repeat, repeat";
      return;
    }
    if (strat && strat.playfieldBackground && strat.playfieldBackground.trim()) {
      pf.style.background = strat.playfieldBackground;
      pf.style.backgroundSize = "";
      pf.style.backgroundPosition = "";
      pf.style.backgroundRepeat = "";
      return;
    }
    if (!strat && cfg.globalPlayfieldBg && cfg.globalPlayfieldBg.trim()) {
      pf.style.background = cfg.globalPlayfieldBg;
      pf.style.backgroundSize = "";
      pf.style.backgroundPosition = "";
      pf.style.backgroundRepeat = "";
      return;
    }
    const layers = [];
    if (cfg.superEarthWatermark !== false) {
      layers.push({ u: HD2_ASSETS.superEarthSvg, size: "min(480px, 32vw)", pos: "center center" });
    }
    if (cfg.usePatchBackgrounds !== false) {
      const patchUrl = strat ? HD2_ASSETS.resolvePatchUrl(strat.id) : HD2_ASSETS.patchFiles.base;
      layers.push({ u: patchUrl, size: "cover", pos: "center center" });
    }
    pf.style.backgroundColor = "#020203";
    if (!layers.length) {
      pf.style.backgroundImage = "none";
      pf.style.backgroundSize = "";
      pf.style.backgroundPosition = "";
      pf.style.backgroundRepeat = "";
      return;
    }
    pf.style.backgroundImage = layers.map((l) => `url("${l.u}")`).join(", ");
    pf.style.backgroundSize = layers.map((l) => l.size).join(", ");
    pf.style.backgroundPosition = layers.map((l) => l.pos).join(", ");
    pf.style.backgroundRepeat = layers.map(() => "no-repeat").join(", ");
  }

  function applyGlobalBackgrounds() {
    applyPlayfieldForStratagem(null);
  }

  function setStratagemIcon(strat) {
    const img = el("stratagemIcon");
    if (!img) return;
    if (!strat) {
      img.removeAttribute("src");
      img.alt = "";
      img.classList.add("stratagem-icon--hidden");
      return;
    }
    img.classList.remove("stratagem-icon--hidden");
    const url = HD2_ASSETS.resolveStratagemIconUrl(strat.id, strat.iconFile);
    img.onerror = () => {
      img.onerror = null;
      img.src = HD2_ASSETS.stratagemIconDir + HD2_ASSETS.placeholderIcon;
    };
    img.src = url;
    img.alt = stratName(strat);
  }

  function stratName(s) {
    return s.names[cfg.locale] || s.names.en;
  }

  function stratCategoryLabel(cat) {
    return t(`category_${cat}`);
  }

  function getNormalClassicOpts() {
    return {
      timeTotal: 10000,
      renewTimeEachRound: true,
      freezeTimer: false,
      failOnWrong: false,
      sessionDeadline: null,
    };
  }

  function getClassicKioskOpts(preset) {
    if (preset === "easy") {
      return {
        timeTotal: 999999999,
        renewTimeEachRound: true,
        freezeTimer: true,
        failOnWrong: false,
        sessionDeadline: null,
      };
    }
    if (preset === "sprint30") {
      return {
        timeTotal: 30000,
        renewTimeEachRound: false,
        freezeTimer: false,
        failOnWrong: false,
        sessionDeadline: Date.now() + 30000,
      };
    }
    if (preset === "lottery") {
      return {
        timeTotal: 10000,
        renewTimeEachRound: true,
        freezeTimer: false,
        failOnWrong: true,
        sessionDeadline: null,
      };
    }
    return {
      timeTotal: 120000,
      renewTimeEachRound: false,
      freezeTimer: false,
      failOnWrong: false,
      sessionDeadline: Date.now() + 300000,
    };
  }

  function handleClassicGameOver(finalScore, reason) {
    stopLoadingLineTicker();
    if (!isKioskMode()) return;
    const preset = lastKioskPreset;
    if (preset === "lottery" && (reason === "wrong" || reason === "time")) {
      ClassicStratagemHero.stop();
      showFinalScreenModal("defeat", finalScore, {
        title: t("kioskLotteryEndTitle"),
        message: t("kioskLotteryEndMsg"),
      });
      updateKioskArcadeSplash();
      return;
    }
    if (preset === "sprint30" && (reason === "time" || reason === "session")) {
      ClassicStratagemHero.stop();
      showFinalScreenModal("victory", finalScore, {
        title: t("kioskSprintEndTitle"),
        message: t("kioskTimedEndMsg"),
      });
      updateKioskArcadeSplash();
      return;
    }
    if (preset === "marathon5" && (reason === "session" || reason === "time")) {
      ClassicStratagemHero.stop();
      showFinalScreenModal("victory", finalScore, {
        title: t("kioskMarathonEndTitle"),
        message: t("kioskTimedEndMsg"),
      });
      updateKioskArcadeSplash();
    }
  }

  function initClassicStratagemHero() {
    const root = el("classicGameRoot");
    if (!root || typeof ClassicStratagemHero === "undefined") return;
    const vol = Number(cfg.sfxVolume);
    ClassicStratagemHero.init({
      root,
      getPool: () => eligiblePool(cfg, getStratagemList(cfg)),
      stratName: (s) => stratName(s),
      stratIconUrl: (s) => HD2_ASSETS.resolveStratagemIconUrl(s.id, s.iconFile),
      fallbackIcon: HD2_ASSETS.stratagemIconDir + HD2_ASSETS.placeholderIcon,
      arrowUrls: ARROW_IMG,
      readyLines: typeof HD2_LOADING_LINES !== "undefined" ? HD2_LOADING_LINES : [],
      initialVolume: Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 0.82,
      t,
      onStart: () => {
        startLoadingLineTicker();
      },
      onStop: () => {
        stopLoadingLineTicker();
      },
      onGameOver: (finalScore, gameOverReason) => {
        handleClassicGameOver(finalScore, gameOverReason);
      },
      onVolumeChange: (v) => {
        cfg.sfxVolume = v;
        saveConfig(cfg, { suppressSettingsToast: true });
      },
      onScreenChange: () => {
        updatePlayfieldTouchCapture();
      },
    });
  }

  function ensureClassicAttractMode() {
    if (typeof ClassicStratagemHero === "undefined") return;
    const pool = eligiblePool(cfg, getStratagemList(cfg));
    const ph = el("playHint");
    if (!pool.length) {
      if (ph) {
        ph.textContent = t("noCodeWarning");
        ph.hidden = false;
      }
      return;
    }
    if (ph) ph.hidden = true;
    if (!ClassicStratagemHero.isActive()) {
      const opts = isKioskMode() ? getClassicKioskOpts(lastKioskPreset || "marathon5") : getNormalClassicOpts();
      ClassicStratagemHero.start(opts);
    }
  }

  function stopLegacyRunOnly() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    if (run) run.active = false;
    run = null;
    clearAutomatonTakeoverForRunEnd();
    touchStart = null;
    setPlayfieldTouchMode(false);
    el("stratAudio").pause();
  }

  function currentLevelSpec() {
    const lv = run ? run.level : 1;
    const row = cfg.levels.find((l) => l.level === lv) || cfg.levels[0];
    return row || generatedLevelRow(1);
  }

  function timeForStratagem(strat) {
    const base = currentLevelSpec().timeMs;
    const lv = run ? run.level : 1;
    const mul = strat.levelSpeedMul[String(lv)] ?? strat.levelSpeedMul[lv] ?? 1;
    return Math.max(800, base * mul);
  }

  function gameRules() {
    const d = defaultConfig().gameRules;
    return { ...d, ...(cfg.gameRules || {}) };
  }

  function updateTimerHud() {
    const timerEl = el("hudTimer");
    const fill = el("timerBarFill");
    const bar = el("timerBar");
    if (!timerEl || !fill) return;

    if (usesKioskPressureTimer()) {
      const p = Math.max(0, Math.min(100, Number(run.pressureProgress) || 0));
      timerEl.textContent = "";
      fill.style.width = `${p}%`;
      if (bar) {
        bar.setAttribute("aria-hidden", "false");
        bar.setAttribute("aria-valuenow", String(Math.round(p)));
        bar.setAttribute("aria-label", t("kioskTimerAria"));
      }
      return;
    }

    if (bar) {
      bar.setAttribute("aria-hidden", "true");
      bar.setAttribute("aria-valuenow", "0");
      bar.removeAttribute("aria-label");
    }

    if (!run || !run.active || !run.current || run.current.empty) {
      timerEl.textContent = "—";
      fill.style.width = "0%";
      return;
    }
    const left = Math.max(0, run.current.deadline - Date.now());
    const total = Math.max(1, run.current.totalMs || 1);
    timerEl.textContent = `${(left / 1000).toFixed(1)}s`;
    fill.style.width = `${Math.min(100, (left / total) * 100)}%`;
  }

  function makeHudSkullEl(spent) {
    const wrap = document.createElement("span");
    wrap.className = spent ? "hud-skull hud-skull--spent" : "hud-skull hud-skull--left";
    wrap.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    img.className = "hud-skull__img";
    img.src = HUD_SKULL_IMG_URL;
    img.alt = "";
    img.decoding = "async";
    wrap.appendChild(img);
    return wrap;
  }

  function updateErrorsHud() {
    const row = el("hudSkullsRow");
    const node = el("hudErrors");
    if (!node) return;
    const gr = gameRules();
    const maxE = Math.max(0, Number(gr.maxErrors) || 0);
    if (!run || !run.active || maxE <= 0) {
      node.innerHTML = "";
      if (row) {
        row.hidden = true;
        row.classList.remove("hud-skulls-row--many");
        row.setAttribute("aria-label", "");
      }
      return;
    }
    if (row) {
      row.hidden = false;
      row.classList.toggle("hud-skulls-row--many", maxE > 8);
    }
    const err = Math.min(Math.max(0, run.errors || 0), maxE);
    const left = maxE - err;
    node.innerHTML = "";
    for (let i = 0; i < maxE; i++) {
      node.appendChild(makeHudSkullEl(i < err));
    }
    if (row) {
      row.setAttribute(
        "aria-label",
        t("failsSkullsAria").replace("{spent}", String(err)).replace("{left}", String(left)).replace("{max}", String(maxE))
      );
    }
  }

  function renderArrowPreview(strat, progressIndex, wrong) {
    const box = el("arrowPreview");
    if (!box) return;
    box.innerHTML = "";
    strat.code.forEach((dir, i) => {
      let cls = "";
      if (i < progressIndex) cls = "done";
      if (wrong && i === progressIndex) cls = "wrong";
      box.appendChild(makeChevronChip(dir, cls));
    });
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function startNewChallenge() {
    if (!run || !run.active) return;
    if (!el("stratagemCard")) return;
    const list = getStratagemList(cfg);
    const pool = eligiblePool(cfg, list);
    if (!pool.length) {
      el("playHint").textContent = t("noCodeWarning");
      setPlayfieldTouchMode(false);
      return;
    }
    const strat = pickRandom(pool);
    if (!strat.code.length) {
      run.current = {
        strat,
        index: 0,
        deadline: Date.now() + 2500,
        totalMs: 2500,
        empty: true,
      };
      el("stratagemCategory").textContent = stratCategoryLabel(strat.category);
      el("stratagemName").textContent = stratName(strat);
      const card = el("stratagemCard");
      card.style.background = strat.cardBackground || cfg.globalCardBg || "";
      applyPlayfieldForStratagem(strat);
      setStratagemIcon(strat);
      const sa = el("stratAudio");
      sa.pause();
      if (strat.musicUrl) {
        sa.src = strat.musicUrl;
        sa.play().catch(() => {});
      }
      el("playHint").textContent = t("noCodeWarning");
      renderArrowPreview({ code: [] }, 0, false);
      updatePlayfieldTouchCapture();
      updateTimerHud();
      updateSessionHud();
      return;
    }
    const baseTime = timeForStratagem(strat);
    const debt = Math.max(0, run.penaltyDebtMs || 0);
    const budget = Math.max(800, baseTime - debt);
    run.penaltyDebtMs = 0;
    run.current = {
      strat,
      index: 0,
      deadline: Date.now() + budget,
      totalMs: budget,
      startedAt: Date.now(),
    };
    if (usesKioskPressureTimer()) {
      const far = Date.now() + 86400000 * 7;
      run.current.deadline = far;
      run.current.totalMs = far - Date.now();
    }
    el("stratagemCategory").textContent = stratCategoryLabel(strat.category);
    el("stratagemName").textContent = stratName(strat);
    const card = el("stratagemCard");
    card.style.background = strat.cardBackground || cfg.globalCardBg || "";
    applyPlayfieldForStratagem(strat);
    setStratagemIcon(strat);
    const sa = el("stratAudio");
    sa.pause();
    if (strat.musicUrl) {
      sa.src = strat.musicUrl;
      sa.play().catch(() => {});
    }
    renderArrowPreview(strat, 0, false);
    let hint = strat.unverified && !cfg.stratagemOverrides[strat.id]?.verified ? `⚠ ${t("unverified")}` : "";
    if (!hint && run.kioskPreset) hint = kioskPresetHint(run.kioskPreset);
    el("playHint").textContent = hint;
    updatePlayfieldTouchCapture();
    updateTimerHud();
    updateSessionHud();
  }

  let loadingLineRotateTimer = null;

  function pickLoadingLine() {
    const lines = typeof HD2_LOADING_LINES !== "undefined" && Array.isArray(HD2_LOADING_LINES) ? HD2_LOADING_LINES : [];
    if (!lines.length) return "";
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function startLoadingLineTicker() {
    const node = el("helldiversLoadingTicker");
    if (!node) return;
    node.hidden = false;
    const cycle = () => {
      node.textContent = pickLoadingLine();
    };
    cycle();
    if (loadingLineRotateTimer) clearInterval(loadingLineRotateTimer);
    loadingLineRotateTimer = setInterval(cycle, 11000);
  }

  function stopLoadingLineTicker() {
    if (loadingLineRotateTimer) {
      clearInterval(loadingLineRotateTimer);
      loadingLineRotateTimer = null;
    }
    const node = el("helldiversLoadingTicker");
    if (node) {
      node.hidden = true;
      node.textContent = "";
    }
  }

  function endRun(msg) {
    if (run) run.active = false;
    stopLoadingLineTicker();
    clearAutomatonTakeoverForRunEnd();
    touchStart = null;
    setPlayfieldTouchMode(false);
    el("playHint").textContent = msg || t("runOver");
    el("stratAudio").pause();
    updateTimerHud();
    updateSessionHud();
    updateErrorsHud();
    updateKioskArcadeSplash();
  }

  function showGameOverModal() {
    showFinalScreenModal("defeat", run ? run.score : 0, null);
  }

  function cancelKioskAutoRestart() {
    if (kioskAutoRestartTimer) {
      clearTimeout(kioskAutoRestartTimer);
      kioskAutoRestartTimer = null;
    }
  }

  function scheduleKioskAutoRestartAfterModalClose() {
    cancelKioskAutoRestart();
    if (!isKioskMode()) return;
    if (cfg.kioskAutoRestart) {
      const d = Math.max(800, Math.min(120000, Number(cfg.kioskAutoRestartDelayMs) || 4000));
      kioskAutoRestartTimer = setTimeout(() => {
        kioskAutoRestartTimer = null;
        if (!document.hidden) startKioskRun(lastKioskPreset || "marathon5");
      }, d);
      return;
    }
    autoMarathonIfKiosk();
  }

  /**
   * @param {{ userClosedModal?: boolean } | undefined} opts - Pass userClosedModal when the player dismisses the final screen (enables kiosk auto-restart).
   */
  function hideGameOverModal(opts) {
    const modal = el("gameOverModal");
    if (modal) modal.hidden = true;
    const qw = el("gameOverQrWrap");
    const qi = el("gameOverQr");
    if (qw) qw.hidden = true;
    if (qi) {
      qi.removeAttribute("src");
      qi.alt = "";
    }
    updateKioskArcadeSplash();
    if (opts && opts.userClosedModal) {
      scheduleKioskAutoRestartAfterModalClose();
    }
  }

  function gameOverFromErrors() {
    stopLoadingLineTicker();
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    if (run) run.active = false;
    clearAutomatonTakeoverForRunEnd();
    touchStart = null;
    setPlayfieldTouchMode(false);
    el("stratAudio").pause();
    el("playHint").textContent = t("defeatMaxErrors");
    updateTimerHud();
    updateSessionHud();
    updateErrorsHud();
    showGameOverModal();
    setStratagemIcon(null);
    applyGlobalBackgrounds();
    updateKioskArcadeSplash();
  }

  function registerFailError(reason) {
    if (!run || run.noPenalties) return false;
    const gr = gameRules();
    const maxE = Math.max(0, Number(gr.maxErrors) || 0);
    if (maxE <= 0) return false;
    let count = false;
    if (reason === "timeout" && gr.countTimeoutAsError !== false) count = true;
    if (reason === "wrong" && gr.countWrongAsError !== false) count = true;
    if (!count) return false;
    run.errors = (run.errors || 0) + 1;
    updateErrorsHud();
    if (run.errors >= maxE) {
      gameOverFromErrors();
      return true;
    }
    return false;
  }

  function applyFailPenalties(reason) {
    if (!run || run.noPenalties) return;
    const spec = currentLevelSpec();
    const pts = Math.max(0, Number(spec.failPenaltyPoints) || 0);
    if (pts > 0) {
      run.score = Math.max(0, (run.score || 0) - pts);
      el("hudScore").textContent = String(run.score);
    }
    const debt = Math.max(0, Number(spec.wrongTimeDebtMs) || 0);
    if (debt > 0) {
      run.penaltyDebtMs = (run.penaltyDebtMs || 0) + debt;
    }
  }

  function onSuccess() {
    if (usesKioskPressureTimer()) {
      run.pressureProgress = Math.min(100, (Number(run.pressureProgress) || 0) + DRIZZER_PRESSURE_BONUS);
    }
    const spec = currentLevelSpec();
    const add = Number(spec.successPoints);
    run.score += Number.isFinite(add) && add >= 0 ? add : 1;
    run.penaltyDebtMs = 0;
    run.combo += 1;
    const every = 5;
    if (run.combo % every === 0 && run.level < cfg.levels.length) {
      run.level += 1;
    }
    el("hudScore").textContent = String(run.score);
    el("hudCombo").textContent = `×${run.combo}`;
    el("hudLevel").textContent = `${t("level")} ${run.level}`;
    tryAutomatonTakeoverAfterSuccess();
    updateTimerHud();
    updateSessionHud();
    startNewChallenge();
  }

  function onFail(reason) {
    if (!run || !run.active) return;
    if (run.lotteryOneShot) {
      if (!run.noPenalties) applyFailPenalties(reason);
      kioskEndReason("lottery");
      return;
    }
    applyFailPenalties(reason);
    if (registerFailError(reason)) return;
    run.combo = 0;
    el("hudCombo").textContent = `×0`;
    el("playHint").textContent = reason === "timeout" ? t("timeout") : t("fail");
    setTimeout(() => {
      if (run && run.active) startNewChallenge();
    }, 650);
  }

  function processDirectionInput(pressed) {
    if (!run || !run.active || !run.current || run.current.empty) return;
    const { strat, index } = run.current;
    const want = strat.code[index];
    if (!want || !pressed) return;

    if (pressed === want) {
      const next = index + 1;
      if (next >= strat.code.length) {
        onSuccess();
      } else {
        run.current.index = next;
        if (!usesKioskPressureTimer()) {
          const slice = timeForStratagem(strat);
          run.current.deadline = Date.now() + slice;
          run.current.totalMs = slice;
        }
        renderArrowPreview(strat, next, false);
        updateTimerHud();
      }
    } else {
      renderArrowPreview(strat, index, true);
      onFail("wrong");
    }
  }

  function updatePlayfieldTouchCapture() {
    const classicSwipe =
      typeof ClassicStratagemHero !== "undefined" &&
      ClassicStratagemHero.isActive() &&
      ClassicStratagemHero.getScreen() === "in_game";
    const on =
      cfg.enableSwipes !== false &&
      (classicSwipe ||
        (run &&
          run.active &&
          run.current &&
          !run.current.empty &&
          run.current.strat &&
          run.current.strat.code &&
          run.current.strat.code.length > 0));
    setPlayfieldTouchMode(on);
  }

  function onPlayfieldTouchStart(e) {
    if (cfg.enableSwipes === false || bindTarget) return;
    const classicInGame =
      typeof ClassicStratagemHero !== "undefined" &&
      ClassicStratagemHero.isActive() &&
      ClassicStratagemHero.getScreen() === "in_game";
    if (classicInGame) {
      const tch = e.changedTouches[0];
      touchStart = { x: tch.clientX, y: tch.clientY, id: tch.identifier, time: Date.now() };
      return;
    }
    if (!run || !run.active || !run.current || run.current.empty) return;
    const tch = e.changedTouches[0];
    touchStart = { x: tch.clientX, y: tch.clientY, id: tch.identifier, time: Date.now() };
  }

  function onPlayfieldTouchMove(e) {
    if (!touchStart || cfg.enableSwipes === false || bindTarget) return;
    const classicInGame =
      typeof ClassicStratagemHero !== "undefined" &&
      ClassicStratagemHero.isActive() &&
      ClassicStratagemHero.getScreen() === "in_game";
    if (classicInGame) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchStart.id) {
          e.preventDefault();
          return;
        }
      }
      return;
    }
    if (!run || !run.active || !run.current || run.current.empty) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchStart.id) {
        e.preventDefault();
        return;
      }
    }
  }

  function onPlayfieldTouchEnd(e) {
    if (!touchStart) return;
    const classicInGame =
      typeof ClassicStratagemHero !== "undefined" &&
      ClassicStratagemHero.isActive() &&
      ClassicStratagemHero.getScreen() === "in_game";
    if (classicInGame) {
      if (cfg.enableSwipes === false) {
        touchStart = null;
        return;
      }
      let tch = null;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchStart.id) {
          tch = e.changedTouches[i];
          break;
        }
      }
      if (!tch) return;
      const dx = tch.clientX - touchStart.x;
      const dy = tch.clientY - touchStart.y;
      touchStart = null;
      const min = Math.max(24, Number(cfg.swipeMinDistance) || 48);
      if (Math.abs(dx) < min && Math.abs(dy) < min) return;
      let dir = null;
      if (Math.abs(dx) >= Math.abs(dy)) dir = dx > 0 ? "right" : "left";
      else dir = dy > 0 ? "down" : "up";
      e.preventDefault();
      const map = { up: "U", down: "D", left: "L", right: "R" };
      ClassicStratagemHero.applyTouchLetter(map[dir]);
      return;
    }
    if (cfg.enableSwipes === false || !run || !run.active || !run.current || run.current.empty) {
      touchStart = null;
      return;
    }
    let tch = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchStart.id) {
        tch = e.changedTouches[i];
        break;
      }
    }
    if (!tch) return;
    const dx = tch.clientX - touchStart.x;
    const dy = tch.clientY - touchStart.y;
    touchStart = null;
    const min = Math.max(24, Number(cfg.swipeMinDistance) || 48);
    if (Math.abs(dx) < min && Math.abs(dy) < min) return;
    let dir = null;
    if (Math.abs(dx) >= Math.abs(dy)) {
      dir = dx > 0 ? "right" : "left";
    } else {
      dir = dy > 0 ? "down" : "up";
    }
    e.preventDefault();
    processDirectionInput(dir);
  }

  function onPlayfieldTouchCancel() {
    touchStart = null;
  }

  function handleKeyDown(e) {
    const modal = el("gameOverModal");
    if (bindTarget) {
      e.preventDefault();
      const dir = bindTarget;
      const code = e.code;
      if (!code || code === "Escape") {
        bindTarget = null;
        renderBindings();
        return;
      }
      const set = new Set(cfg.bindings[dir]);
      set.add(code);
      cfg.bindings[dir] = [...set];
      bindTarget = null;
      renderBindings();
      saveConfig(cfg);
      return;
    }

    if (modal && !modal.hidden && (e.code === "Enter" || e.code === "Space")) {
      const ae = document.activeElement;
      const tag = ae && ae.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || ae?.isContentEditable) {
        return;
      }
      if (tag === "BUTTON" && modal.contains(ae)) {
        return;
      }
      if (tag === "A" && modal.contains(ae) && ae.getAttribute("href") && ae.getAttribute("href") !== "#") {
        return;
      }
      e.preventDefault();
      hideGameOverModal({ userClosedModal: true });
      return;
    }

    if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive()) {
      if (ClassicStratagemHero.onKeyDown(e)) return;
    }

    const playPanel = el("panelPlay");
    if (e.code === "Space" && cfg.restartOnSpace && playPanel && playPanel.classList.contains("active")) {
      const ae = document.activeElement;
      const tag = ae && ae.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !ae?.isContentEditable) {
        const modalOpen = modal && !modal.hidden;
        const classicOn = typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive();
        const activeRun = (run && run.active) || classicOn;
        if (modalOpen || activeRun) {
          e.preventDefault();
          cancelKioskAutoRestart();
          hideGameOverModal();
          if (isKioskMode()) {
            startKioskRun(lastKioskPreset || "marathon5");
          } else {
            startRunClick();
          }
          return;
        }
      }
    }

    if (isKioskMode() && (!run || !run.active)) {
      const classicOn = typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive();
      if (!classicOn && (!modal || modal.hidden)) {
        let pressed = null;
        for (const d of ["up", "down", "left", "right"]) {
          if (cfg.bindings[d].includes(e.code)) {
            pressed = d;
            break;
          }
        }
        if (pressed) {
          e.preventDefault();
          startKioskRun(lastKioskPreset || "marathon5");
          playStratagemDirectionSound(pressed);
          return;
        }
      }
    }

    if (!run || !run.active || !run.current) return;
    if (run.current.empty) return;
    const want = run.current.strat.code[run.current.index];
    if (!want) return;

    let pressed = null;
    for (const d of ["up", "down", "left", "right"]) {
      if (cfg.bindings[d].includes(e.code)) {
        pressed = d;
        break;
      }
    }
    if (!pressed) return;
    e.preventDefault();
    playStratagemDirectionSound(pressed);
    processDirectionInput(pressed);
  }

  let tickHandle = null;
  function tick() {
    updateSessionHud();
    if (run && run.active) maybeEndAutomatonTakeover();
    if (!run || !run.active) {
      updateTimerHud();
      return;
    }
    if (usesKioskPressureTimer()) {
      if (run.sessionDeadline != null && Date.now() >= run.sessionDeadline) {
        kioskEndReason(run.kioskPreset === "marathon5" ? "marathon" : "sprint");
        return;
      }
      if (!run.current) {
        updateTimerHud();
        return;
      }
      run.pressureProgress = Math.max(0, (Number(run.pressureProgress) || 0) - DRIZZER_PRESSURE_DEC);
      updateTimerHud();
      if (run.pressureProgress <= 0) {
        kioskPressureDepleted();
      }
      return;
    }
    if (run.sessionDeadline != null && Date.now() >= run.sessionDeadline) {
      kioskEndReason(run.kioskPreset === "marathon5" ? "marathon" : "sprint");
      return;
    }
    if (!run.current) {
      updateTimerHud();
      return;
    }
    updateTimerHud();
    if (Date.now() > run.current.deadline) {
      if (run.current.empty) {
        startNewChallenge();
        return;
      }
      onFail("timeout");
    }
  }

  function startRunClick() {
    const list = getStratagemList(cfg);
    const pool = eligiblePool(cfg, list);
    if (!pool.length) {
      const ph = el("playHint");
      if (ph) {
        ph.textContent = t("noCodeWarning");
        ph.hidden = false;
      }
      setPlayfieldTouchMode(false);
      return;
    }
    const ph = el("playHint");
    if (ph) ph.hidden = true;
    hideGameOverModal();
    stopLegacyRunOnly();
    if (typeof ClassicStratagemHero === "undefined") return;
    if (ClassicStratagemHero.isActive()) ClassicStratagemHero.stop();
    ClassicStratagemHero.start(getNormalClassicOpts());
    ClassicStratagemHero.beginFromButton();
    updateKioskArcadeSplash();
  }

  function endRunClick() {
    if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive()) {
      ClassicStratagemHero.stop();
    }
    stopLegacyRunOnly();
    stopLoadingLineTicker();
    hideGameOverModal();
    endRun();
    setStratagemIcon(null);
    applyGlobalBackgrounds();
    updateSessionHud();
    updateKioskArcadeSplash();
    ensureClassicAttractMode();
  }

  function renderBindings() {
    const grid = el("bindGrid");
    grid.innerHTML = "";
    ["up", "down", "left", "right"].forEach((dir) => {
      const cell = document.createElement("div");
      cell.className = "bind-cell";
      const strong = document.createElement("strong");
      strong.className = "bind-chevron-wrap";
      strong.appendChild(makeChevronChip(dir, "hd-arrow-chip--bind"));
      const keys = document.createElement("div");
      keys.className = "bind-keys";
      keys.textContent = cfg.bindings[dir].join(", ") || "—";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "+";
      btn.addEventListener("click", () => {
        bindTarget = dir;
        keys.textContent = "…";
      });
      cell.appendChild(strong);
      cell.appendChild(keys);
      cell.appendChild(btn);
      grid.appendChild(cell);
    });
  }

  function renderLevelRows() {
    const wrap = el("levelRows");
    wrap.innerHTML = "";
    cfg.levels.forEach((row, idx) => {
      const div = document.createElement("div");
      div.className = "level-row level-row--game";
      const head = document.createElement("div");
      head.className = "level-row__head";
      head.textContent = `${t("level")} ${row.level}`;
      div.appendChild(head);
      const grid = document.createElement("div");
      grid.className = "level-row__grid";

      function addField(labelText, key, opts) {
        const lab = document.createElement("label");
        lab.className = "level-field";
        const span = document.createElement("span");
        span.textContent = labelText;
        const input = document.createElement("input");
        input.type = "number";
        if (opts) {
          if (opts.min != null) input.min = String(opts.min);
          if (opts.step != null) input.step = String(opts.step);
          if (opts.max != null) input.max = String(opts.max);
        }
        input.value = String(row[key] ?? "");
        input.addEventListener("change", () => {
          let v = Number(input.value);
          if (Number.isNaN(v)) v = row[key];
          if (key === "timeMs") v = Math.max(500, v);
          else if (key === "successPoints") v = Math.max(0, v);
          else v = Math.max(0, v);
          cfg.levels[idx][key] = v;
          input.value = String(cfg.levels[idx][key]);
          saveConfig(cfg);
        });
        lab.appendChild(span);
        lab.appendChild(input);
        grid.appendChild(lab);
      }

      addField(t("levelTimeMs"), "timeMs", { min: 500, step: 100 });
      addField(t("levelSuccessPoints"), "successPoints", { min: 0, step: 1 });
      addField(t("levelFailPenaltyPts"), "failPenaltyPoints", { min: 0, step: 1 });
      addField(t("levelWrongTimeDebt"), "wrongTimeDebtMs", { min: 0, step: 100 });

      div.appendChild(grid);
      wrap.appendChild(div);
    });
  }

  function syncSettingsForm() {
    const gr = gameRules();
    el("maxErrors").value = String(gr.maxErrors ?? 0);
    el("countTimeoutAsError").checked = gr.countTimeoutAsError !== false;
    el("countWrongAsError").checked = gr.countWrongAsError !== false;

    function syncFinalScreenForm(key, prefix) {
      const es = deepMerge(emptyFinalScreen(), cfg[key] || {});
      el(`${prefix}TitleField`).value = es.title || "";
      el(`${prefix}MessageField`).value = es.message || "";
      el(`${prefix}LinkUrl`).value = es.linkUrl || "";
      el(`${prefix}LinkText`).value = es.linkText || "";
      el(`${prefix}QrUrl`).value = es.qrUrl || "";
    }
    syncFinalScreenForm("endScreenDefeat", "endScreenDefeat");
    syncFinalScreenForm("endScreenVictory", "endScreenVictory");

    el("themeType").value = cfg.theme.type;
    el("mp3Url").value = cfg.theme.mp3Url || "";
    el("youtubeUrl").value = cfg.theme.youtubeUrl || "";
    el("youtubeMute").checked = !!cfg.theme.youtubeMuted;
    el("globalPlayfieldBg").value = cfg.globalPlayfieldBg || "";
    el("globalCardBg").value = cfg.globalCardBg || "";
    el("includeIncomplete").checked = !!cfg.includeIncomplete;
    el("usePatchBackgrounds").checked = cfg.usePatchBackgrounds !== false;
    el("superEarthWatermark").checked = cfg.superEarthWatermark !== false;
    el("terminalBackground").value = cfg.terminalBackground || "";
    el("enableSwipes").checked = cfg.enableSwipes !== false;
    el("swipeMinDistance").value = String(cfg.swipeMinDistance ?? 48);
    const dsc = el("directionSoundsMutedCheck");
    if (dsc) dsc.checked = !!cfg.directionSoundsMuted;
    const rosEl = el("restartOnSpace");
    if (rosEl) rosEl.checked = !!cfg.restartOnSpace;
    const karEl = el("kioskAutoRestart");
    if (karEl) karEl.checked = !!cfg.kioskAutoRestart;
    const kardEl = el("kioskAutoRestartDelayMs");
    if (kardEl) kardEl.value = String(Math.max(800, Number(cfg.kioskAutoRestartDelayMs) || 4000));
    renderBindings();
    renderLevelRows();
    syncDirectionSoundsMuteUi();
  }

  function syncEditorStratSelect() {
    const sel = el("editorStratSelect");
    sel.innerHTML = "";
    getStratagemList(cfg).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      const tag = s.unverified ? " *" : "";
      opt.textContent = `${stratName(s)}${tag}`;
      sel.appendChild(opt);
    });
  }

  function loadEditorStrat() {
    const id = el("editorStratSelect").value;
    const base = HD2_STRATAGEMS.find((x) => x.id === id);
    if (!base) return;
    const m = mergedStratagem(base, cfg.stratagemOverrides[id]);
    editorSeq = [...m.code];
    renderEditorSeq();
    el("editorCardBg").value = m.cardBackground || "";
    el("editorPlayBg").value = m.playfieldBackground || "";
    el("editorMusic").value = m.musicUrl || "";
    el("editorIconFile").value = m.iconFile || "";
    el("editorVerified").checked = !m.unverified;
    renderEditorLevelSpeeds(id);
  }

  function renderEditorSeq() {
    const box = el("editorSeqDisplay");
    box.innerHTML = "";
    editorSeq.forEach((dir) => {
      box.appendChild(makeChevronChip(dir, ""));
    });
  }

  function renderEditorLevelSpeeds(id) {
    const wrap = el("editorLevelSpeeds");
    wrap.innerHTML = `<p class="small">${t("levelsTitle")} — ${t("editorHelp")}</p>`;
    const ov = cfg.stratagemOverrides[id]?.levelSpeedMul || {};
    cfg.levels.forEach((L) => {
      const row = document.createElement("div");
      row.className = "level-row";
      const lab = document.createElement("label");
      lab.textContent = `${t("level")} ${L.level} ×`;
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.05";
      input.min = "0.25";
      input.max = "3";
      input.value = String(ov[String(L.level)] ?? 1);
      input.dataset.level = String(L.level);
      row.appendChild(lab);
      row.appendChild(input);
      wrap.appendChild(row);
    });
  }

  function applyEditorOverride() {
    const id = el("editorStratSelect").value;
    const levelSpeedMul = {};
    el("editorLevelSpeeds").querySelectorAll("input[type=number]").forEach((inp) => {
      const lv = inp.dataset.level;
      const v = Number(inp.value);
      if (lv && !Number.isNaN(v) && v !== 1) levelSpeedMul[lv] = v;
    });
    cfg.stratagemOverrides[id] = {
      code: [...editorSeq],
      cardBackground: el("editorCardBg").value.trim(),
      playfieldBackground: el("editorPlayBg").value.trim(),
      musicUrl: el("editorMusic").value.trim(),
      iconFile: el("editorIconFile").value.trim(),
      levelSpeedMul,
      verified: el("editorVerified").checked,
    };
    saveConfig(cfg);
    syncEditorStratSelect();
  }

  function resetEditorOverride() {
    const id = el("editorStratSelect").value;
    delete cfg.stratagemOverrides[id];
    saveConfig(cfg);
    loadEditorStrat();
    syncEditorStratSelect();
  }

  function wireUi() {
    const loc = el("localeSelect");
    SH2_I18N.locales.forEach((lc) => {
      const o = document.createElement("option");
      o.value = lc;
      o.textContent = lc.toUpperCase();
      loc.appendChild(o);
    });
    loc.value = cfg.locale;
    loc.addEventListener("change", () => {
      cfg.locale = loc.value;
      saveConfig(cfg);
      applyI18nDom();
      syncEditorStratSelect();
      if (run && run.current) {
        const s = run.current.strat;
        const nm = el("stratagemName");
        const cat = el("stratagemCategory");
        if (nm) nm.textContent = stratName(s);
        if (cat) cat.textContent = stratCategoryLabel(s.category);
        setStratagemIcon(s);
      }
    });

    el("btnPlay").addEventListener("click", () => {
      showPanel("play");
      applyGlobalBackgrounds();
    });
    el("btnSettings").addEventListener("click", () => {
      showPanel("settings");
      syncSettingsForm();
    });
    el("btnEditor").addEventListener("click", () => {
      showPanel("editor");
      syncEditorStratSelect();
      loadEditorStrat();
    });

    const btnStartRun = el("btnStartRun");
    const btnEndRun = el("btnEndRun");
    if (btnStartRun) btnStartRun.addEventListener("click", startRunClick);
    if (btnEndRun) btnEndRun.addEventListener("click", endRunClick);

    el("gameOverClose").addEventListener("click", () => {
      hideGameOverModal({ userClosedModal: true });
    });
    const goBd = el("gameOverBackdrop");
    if (goBd)
      goBd.addEventListener("click", () => {
        hideGameOverModal({ userClosedModal: true });
      });

    const btnSfx = el("btnDirectionSoundsMute");
    if (btnSfx) {
      btnSfx.addEventListener("click", () => {
        cfg.directionSoundsMuted = !cfg.directionSoundsMuted;
        saveConfig(cfg, { suppressSettingsToast: true });
        syncDirectionSoundsMuteUi();
        showSettingsSavedToast();
      });
    }
    const dsc = el("directionSoundsMutedCheck");
    if (dsc) {
      dsc.addEventListener("change", () => {
        cfg.directionSoundsMuted = dsc.checked;
        saveConfig(cfg);
        syncDirectionSoundsMuteUi();
      });
    }

    const ros = el("restartOnSpace");
    if (ros) {
      ros.addEventListener("change", () => {
        cfg.restartOnSpace = ros.checked;
        saveConfig(cfg);
      });
    }
    const kar = el("kioskAutoRestart");
    if (kar) {
      kar.addEventListener("change", () => {
        cfg.kioskAutoRestart = kar.checked;
        saveConfig(cfg);
      });
    }
    const kard = el("kioskAutoRestartDelayMs");
    if (kard) {
      kard.addEventListener("change", () => {
        cfg.kioskAutoRestartDelayMs = Math.max(800, Math.min(120000, Math.floor(Number(kard.value) || 4000)));
        kard.value = String(cfg.kioskAutoRestartDelayMs);
        saveConfig(cfg);
      });
    }

    el("maxErrors").addEventListener("change", () => {
      cfg.gameRules = cfg.gameRules || { ...defaultConfig().gameRules };
      cfg.gameRules.maxErrors = Math.max(0, Math.floor(Number(el("maxErrors").value) || 0));
      el("maxErrors").value = String(cfg.gameRules.maxErrors);
      saveConfig(cfg);
      updateErrorsHud();
    });
    el("countTimeoutAsError").addEventListener("change", () => {
      cfg.gameRules = cfg.gameRules || { ...defaultConfig().gameRules };
      cfg.gameRules.countTimeoutAsError = el("countTimeoutAsError").checked;
      saveConfig(cfg);
    });
    el("countWrongAsError").addEventListener("change", () => {
      cfg.gameRules = cfg.gameRules || { ...defaultConfig().gameRules };
      cfg.gameRules.countWrongAsError = el("countWrongAsError").checked;
      saveConfig(cfg);
    });
    function wireFinalScreenPanel(cfgKey, prefix) {
      const base = () => {
        cfg[cfgKey] = deepMerge(emptyFinalScreen(), cfg[cfgKey] || {});
        return cfg[cfgKey];
      };
      el(`${prefix}TitleField`).addEventListener("change", () => {
        base().title = el(`${prefix}TitleField`).value;
        saveConfig(cfg);
      });
      el(`${prefix}MessageField`).addEventListener("change", () => {
        base().message = el(`${prefix}MessageField`).value;
        saveConfig(cfg);
      });
      el(`${prefix}LinkUrl`).addEventListener("change", () => {
        base().linkUrl = el(`${prefix}LinkUrl`).value.trim();
        saveConfig(cfg);
      });
      el(`${prefix}LinkText`).addEventListener("change", () => {
        base().linkText = el(`${prefix}LinkText`).value;
        saveConfig(cfg);
      });
      el(`${prefix}QrUrl`).addEventListener("change", () => {
        base().qrUrl = el(`${prefix}QrUrl`).value.trim();
        saveConfig(cfg);
      });
      el(`${prefix}ImageFile`).addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          base().imageDataUrl = String(r.result || "");
          saveConfig(cfg);
        };
        r.readAsDataURL(f);
      });
      el(`btnClear${prefix.charAt(0).toUpperCase() + prefix.slice(1)}Image`).addEventListener("click", () => {
        base().imageDataUrl = "";
        el(`${prefix}ImageFile`).value = "";
        saveConfig(cfg);
      });
    }
    wireFinalScreenPanel("endScreenDefeat", "endScreenDefeat");
    wireFinalScreenPanel("endScreenVictory", "endScreenVictory");

    el("themeType").addEventListener("change", () => {
      cfg.theme.type = el("themeType").value;
      saveConfig(cfg);
      applyTheme();
    });
    el("mp3File").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        cfg.theme.mp3DataUrl = r.result;
        cfg.theme.type = "mp3";
        el("themeType").value = "mp3";
        saveConfig(cfg);
        applyTheme();
      };
      r.readAsDataURL(f);
    });
    el("mp3Url").addEventListener("change", () => {
      cfg.theme.mp3Url = el("mp3Url").value.trim();
      cfg.theme.type = "mp3";
      el("themeType").value = "mp3";
      saveConfig(cfg);
      applyTheme();
    });
    el("youtubeUrl").addEventListener("change", () => {
      cfg.theme.youtubeUrl = el("youtubeUrl").value.trim();
      cfg.theme.type = "youtube";
      el("themeType").value = "youtube";
      saveConfig(cfg);
      applyTheme();
    });
    el("youtubeMute").addEventListener("change", () => {
      cfg.theme.youtubeMuted = el("youtubeMute").checked;
      saveConfig(cfg);
      applyTheme();
    });

    el("globalPlayfieldBg").addEventListener("change", () => {
      cfg.globalPlayfieldBg = el("globalPlayfieldBg").value.trim();
      saveConfig(cfg);
      applyGlobalBackgrounds();
    });
    el("globalCardBg").addEventListener("change", () => {
      cfg.globalCardBg = el("globalCardBg").value.trim();
      saveConfig(cfg);
    });
    el("includeIncomplete").addEventListener("change", () => {
      cfg.includeIncomplete = el("includeIncomplete").checked;
      saveConfig(cfg);
    });
    el("usePatchBackgrounds").addEventListener("change", () => {
      cfg.usePatchBackgrounds = el("usePatchBackgrounds").checked;
      saveConfig(cfg);
      applyGlobalBackgrounds();
    });
    el("superEarthWatermark").addEventListener("change", () => {
      cfg.superEarthWatermark = el("superEarthWatermark").checked;
      saveConfig(cfg);
      applyGlobalBackgrounds();
    });

    el("terminalBackground").addEventListener("change", () => {
      cfg.terminalBackground = el("terminalBackground").value.trim();
      saveConfig(cfg);
      applyTerminalBackground();
    });
    el("terminalBgFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        cfg.terminalBackgroundDataUrl = String(r.result || "");
        saveConfig(cfg);
        applyTerminalBackground();
      };
      r.readAsDataURL(f);
    });
    el("btnClearTerminalImg").addEventListener("click", () => {
      cfg.terminalBackgroundDataUrl = "";
      el("terminalBgFile").value = "";
      saveConfig(cfg);
      applyTerminalBackground();
    });
    el("enableSwipes").addEventListener("change", () => {
      cfg.enableSwipes = el("enableSwipes").checked;
      saveConfig(cfg);
      updatePlayfieldTouchCapture();
    });
    el("swipeMinDistance").addEventListener("change", () => {
      cfg.swipeMinDistance = Math.max(24, Number(el("swipeMinDistance").value) || 48);
      el("swipeMinDistance").value = String(cfg.swipeMinDistance);
      saveConfig(cfg);
    });

    el("btnResetLevelCurve").addEventListener("click", () => {
      cfg.levels = buildDefaultLevels().map((row) => ({ ...row }));
      saveConfig(cfg);
      renderLevelRows();
      const sid = el("editorStratSelect")?.value;
      if (sid) renderEditorLevelSpeeds(sid);
    });

    const playfieldEl = el("playfield");
    if (playfieldEl) {
      playfieldEl.addEventListener("touchstart", onPlayfieldTouchStart, { passive: true });
      playfieldEl.addEventListener("touchmove", onPlayfieldTouchMove, { passive: false });
      playfieldEl.addEventListener("touchend", onPlayfieldTouchEnd, { passive: false });
      playfieldEl.addEventListener("touchcancel", onPlayfieldTouchCancel, { passive: true });
    }

    el("btnSaveLocal").addEventListener("click", () => {
      saveConfig(cfg);
      el("playHint").textContent = "Saved.";
    });

    el("btnExportB64").addEventListener("click", () => {
      const b64 = utf8ToBase64(JSON.stringify(cfg));
      el("b64Area").value = b64;
      navigator.clipboard.writeText(b64).catch(() => {});
    });

    el("btnImportB64").addEventListener("click", () => {
      const raw = el("b64Area").value.trim();
      if (!raw) return;
      try {
        const next = JSON.parse(base64ToUtf8(raw));
        Object.assign(cfg, deepMerge(defaultConfig(), next));
        migrateFinalScreens(cfg);
        saveConfig(cfg);
        syncSettingsForm();
        syncEditorStratSelect();
        applyTheme();
        applyGlobalBackgrounds();
        applyTerminalBackground();
        applyI18nDom();
      } catch {
        el("b64Area").value = "Invalid Base64 JSON";
      }
    });

    el("importFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const next = JSON.parse(String(r.result));
          Object.assign(cfg, deepMerge(defaultConfig(), next));
          migrateFinalScreens(cfg);
          saveConfig(cfg);
          syncSettingsForm();
          syncEditorStratSelect();
          applyTheme();
          applyGlobalBackgrounds();
          applyTerminalBackground();
          applyI18nDom();
        } catch {
          /* ignore */
        }
      };
      r.readAsText(f);
    });

    el("btnImportUrl").addEventListener("click", async () => {
      const url = el("importUrl").value.trim();
      if (!url) return;
      try {
        const res = await fetch(url);
        const next = await res.json();
        Object.assign(cfg, deepMerge(defaultConfig(), next));
        migrateFinalScreens(cfg);
        saveConfig(cfg);
        syncSettingsForm();
        syncEditorStratSelect();
        applyTheme();
        applyGlobalBackgrounds();
        applyTerminalBackground();
        applyI18nDom();
      } catch {
        el("importUrl").placeholder = "Fetch failed (CORS?)";
      }
    });

    el("btnImportClip").addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        let next;
        try {
          next = JSON.parse(text);
        } catch {
          next = JSON.parse(base64ToUtf8(text));
        }
        Object.assign(cfg, deepMerge(defaultConfig(), next));
        migrateFinalScreens(cfg);
        saveConfig(cfg);
        syncSettingsForm();
        syncEditorStratSelect();
        applyTheme();
        applyGlobalBackgrounds();
        applyTerminalBackground();
        applyI18nDom();
      } catch {
        /* ignore */
      }
    });

    document.querySelectorAll(".seq-btns .dir-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        editorSeq.push(btn.getAttribute("data-dir"));
        renderEditorSeq();
      });
    });
    el("editorSeqPop").addEventListener("click", () => {
      editorSeq.pop();
      renderEditorSeq();
    });
    el("editorSeqClear").addEventListener("click", () => {
      editorSeq = [];
      renderEditorSeq();
    });
    el("editorStratSelect").addEventListener("change", loadEditorStrat);
    el("editorApply").addEventListener("click", applyEditorOverride);
    el("editorReset").addEventListener("click", resetEditorOverride);

    el("kioskBtnRestart").addEventListener("click", () => startKioskRun(lastKioskPreset));
    el("kioskBtnEasy").addEventListener("click", () => startKioskRun("easy"));
    el("kioskBtnSprint").addEventListener("click", () => startKioskRun("sprint30"));
    el("kioskBtnLottery").addEventListener("click", () => startKioskRun("lottery"));
    el("kioskBtnMarathon").addEventListener("click", () => startKioskRun("marathon5"));

    const btnKiosk = el("btnKiosk");
    if (btnKiosk) {
      btnKiosk.addEventListener("click", () => {
        setKioskQueryParam(true);
        showPanel("play");
      });
    }
    const btnExitKiosk = el("btnExitKiosk");
    if (btnExitKiosk) {
      btnExitKiosk.addEventListener("click", () => {
        setKioskQueryParam(false);
      });
    }
    window.addEventListener("popstate", syncKioskLayout);

    window.addEventListener("keydown", handleKeyDown);
  }

  function initDirButtons() {
    document.querySelectorAll(".dir-btn[data-dir]").forEach((btn) => {
      const d = btn.getAttribute("data-dir");
      if (!d) return;
      btn.textContent = "";
      btn.appendChild(makeChevronChip(d, "hd-arrow-chip--tiny"));
    });
  }

  function init() {
    afterSaveSettingsToast = () => {
      const ps = el("panelSettings");
      if (!ps || !ps.classList.contains("active")) return;
      showSettingsSavedToast();
    };
    initClassicStratagemHero();
    syncKioskLayout();
    wireUi();
    initDirButtons();
    hideGameOverModal();
    applyI18nDom();
    syncSettingsForm();
    syncEditorStratSelect();
    applyTheme();
    applyGlobalBackgrounds();
    applyTerminalBackground();
    if (!isKioskMode()) ensureClassicAttractMode();
  }

  init();
})();
