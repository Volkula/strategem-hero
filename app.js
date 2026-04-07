/* global HD2_STRATAGEMS, SH2_I18N, HD2_ASSETS, QRCode, HD2_LOADING_LINES, SH2_SETTINGS */
(function () {
  const {
    defaultConfig,
    loadConfig,
    saveConfig,
    deepMerge,
    emptyFinalScreen,
    migrateFinalScreens,
    buildDefaultLevels,
    generatedLevelRow,
    setSaveNotifier,
  } = window.SH2_SETTINGS;

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
    /** Background embed must stay muted for autoplay; unmuted streams are blocked by browsers. */
    const baseMute = "1";
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
      fs: "0",
      modestbranding: "1",
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

  let cfg = loadConfig();

  function refreshAfterConfigSave() {
    applyI18nDom();
    syncSettingsForm();
    applyTheme();
    applyGlobalBackgrounds();
    applyTerminalBackground();
    renderBindings();
    renderLevelRows();
    syncDirectionSoundsMuteUi();
    syncEditorStratSelect();
    loadEditorStrat();
    updateErrorsHud();
    if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.setVolume01) {
      const v = Number(cfg.sfxVolume);
      ClassicStratagemHero.setVolume01(Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.82);
      const gb = deepMerge(defaultConfig().generalBrasch, cfg.generalBrasch || {});
      if (ClassicStratagemHero.setBraschAnthemVolume01) {
        ClassicStratagemHero.setBraschAnthemVolume01(
          Number.isFinite(Number(gb.anthemVolume)) ? Math.max(0, Math.min(1, Number(gb.anthemVolume))) : 1
        );
      }
    }
    if (!isKioskMode()) ensureClassicAttractMode();
  }

  function resetAllSettingsToDefault() {
    if (!confirm(t("confirmResetAllSettings"))) return;
    cfg = JSON.parse(JSON.stringify(defaultConfig()));
    cfg.savedAt = Date.now();
    saveConfig(cfg, { suppressSettingsToast: true });
    refreshAfterConfigSave();
    notifySettingsSavedUi();
  }

  function resetSettingsSection(section) {
    if (!confirm(t("confirmResetSection"))) return;
    const d = defaultConfig();
    switch (section) {
      case "theme": {
        cfg.theme = JSON.parse(JSON.stringify(d.theme));
        const mf = el("mp3File");
        if (mf) mf.value = "";
        break;
      }
      case "bindings":
        cfg.bindings = JSON.parse(JSON.stringify(d.bindings));
        cfg.directionSoundsMuted = d.directionSoundsMuted;
        break;
      case "levels":
        cfg.levels = JSON.parse(JSON.stringify(d.levels));
        break;
      case "gameRules":
        cfg.gameRules = JSON.parse(JSON.stringify(d.gameRules));
        break;
      case "classicInvasionsOverview":
        cfg.classicInvasionPriority = d.classicInvasionPriority;
        cfg.classicInvasion = cfg.classicInvasion || { ...d.classicInvasion };
        cfg.classicInvasion.enabled = d.classicInvasion.enabled;
        cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d.classicIlluminatiInvasion };
        cfg.classicIlluminatiInvasion.enabled = d.classicIlluminatiInvasion.enabled;
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.enabled = d.classicTerminidInvasion.enabled;
        break;
      case "classicInvasion": {
        const src = d.classicInvasion;
        cfg.classicInvasion = cfg.classicInvasion || { ...src };
        cfg.classicInvasion.successesMin = src.successesMin;
        cfg.classicInvasion.successesMax = src.successesMax;
        cfg.classicInvasion.durationMinMs = src.durationMinMs;
        cfg.classicInvasion.durationMaxMs = src.durationMaxMs;
        break;
      }
      case "illuminati": {
        const src = d.classicIlluminatiInvasion;
        cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...src };
        cfg.classicIlluminatiInvasion.successesMin = src.successesMin;
        cfg.classicIlluminatiInvasion.successesMax = src.successesMax;
        cfg.classicIlluminatiInvasion.durationMinMs = src.durationMinMs;
        cfg.classicIlluminatiInvasion.durationMaxMs = src.durationMaxMs;
        cfg.classicIlluminatiInvasion.warnLeadMs = src.warnLeadMs;
        break;
      }
      case "terminid": {
        const src = d.classicTerminidInvasion;
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...src };
        cfg.classicTerminidInvasion.successesMin = src.successesMin;
        cfg.classicTerminidInvasion.successesMax = src.successesMax;
        cfg.classicTerminidInvasion.durationMinMs = src.durationMinMs;
        cfg.classicTerminidInvasion.durationMaxMs = src.durationMaxMs;
        cfg.classicTerminidInvasion.fogOpacityMin = src.fogOpacityMin;
        cfg.classicTerminidInvasion.fogOpacityMax = src.fogOpacityMax;
        cfg.classicTerminidInvasion.fogPulsePeriodMs = src.fogPulsePeriodMs;
        cfg.classicTerminidInvasion.fogImageUrl = src.fogImageUrl;
        break;
      }
      case "generalBrasch":
        cfg.generalBrasch = JSON.parse(JSON.stringify(d.generalBrasch));
        break;
      case "playKiosk":
        cfg.defaultKiosk = d.defaultKiosk;
        cfg.restartOnSpace = d.restartOnSpace;
        cfg.kioskAutoRestart = d.kioskAutoRestart;
        cfg.kioskAutoRestartDelayMs = d.kioskAutoRestartDelayMs;
        break;
      case "defeat": {
        cfg.endScreenDefeat = JSON.parse(JSON.stringify(d.endScreenDefeat));
        const df = el("endScreenDefeatImageFile");
        if (df) df.value = "";
        break;
      }
      case "victory": {
        cfg.endScreenVictory = JSON.parse(JSON.stringify(d.endScreenVictory));
        const vf = el("endScreenVictoryImageFile");
        if (vf) vf.value = "";
        break;
      }
      case "appearance":
        cfg.terminalBackground = d.terminalBackground;
        cfg.terminalBackgroundDataUrl = "";
        cfg.globalPlayfieldBg = d.globalPlayfieldBg;
        cfg.globalCardBg = d.globalCardBg;
        cfg.includeIncomplete = d.includeIncomplete;
        cfg.usePatchBackgrounds = d.usePatchBackgrounds;
        cfg.superEarthWatermark = d.superEarthWatermark;
        cfg.enableSwipes = d.enableSwipes;
        cfg.swipeMinDistance = d.swipeMinDistance;
        {
          const tf = el("terminalBgFile");
          if (tf) tf.value = "";
        }
        break;
      default:
        return;
    }
    saveConfig(cfg);
    refreshAfterConfigSave();
  }

  function resetSingleSettingsControl(id) {
    const d = defaultConfig();
    switch (id) {
      case "themeType":
        cfg.theme.type = d.theme.type;
        break;
      case "mp3Url":
        cfg.theme.mp3Url = d.theme.mp3Url;
        break;
      case "youtubeUrl":
        cfg.theme.youtubeUrl = d.theme.youtubeUrl;
        break;
      case "youtubeMute":
        cfg.theme.youtubeMuted = d.theme.youtubeMuted;
        break;
      case "maxErrors":
        cfg.gameRules = { ...(cfg.gameRules || {}), maxErrors: d.gameRules.maxErrors };
        break;
      case "countTimeoutAsError":
        cfg.gameRules = { ...(cfg.gameRules || {}), countTimeoutAsError: d.gameRules.countTimeoutAsError };
        break;
      case "countWrongAsError":
        cfg.gameRules = { ...(cfg.gameRules || {}), countWrongAsError: d.gameRules.countWrongAsError };
        break;
      case "invasionEnabled":
        cfg.classicInvasion = cfg.classicInvasion || { ...d.classicInvasion };
        cfg.classicInvasion.enabled = d.classicInvasion.enabled;
        break;
      case "invasionSuccessesMin":
        cfg.classicInvasion = cfg.classicInvasion || { ...d.classicInvasion };
        cfg.classicInvasion.successesMin = d.classicInvasion.successesMin;
        break;
      case "invasionSuccessesMax":
        cfg.classicInvasion = cfg.classicInvasion || { ...d.classicInvasion };
        cfg.classicInvasion.successesMax = d.classicInvasion.successesMax;
        break;
      case "invasionDurationMinMs":
        cfg.classicInvasion = cfg.classicInvasion || { ...d.classicInvasion };
        cfg.classicInvasion.durationMinMs = d.classicInvasion.durationMinMs;
        break;
      case "invasionDurationMaxMs":
        cfg.classicInvasion = cfg.classicInvasion || { ...d.classicInvasion };
        cfg.classicInvasion.durationMaxMs = d.classicInvasion.durationMaxMs;
        break;
      case "invasionPriority":
        cfg.classicInvasionPriority = d.classicInvasionPriority;
        break;
      case "terminidInvasionEnabled":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.enabled = d.classicTerminidInvasion.enabled;
        break;
      case "terminidInvasionSuccessesMin":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.successesMin = d.classicTerminidInvasion.successesMin;
        break;
      case "terminidInvasionSuccessesMax":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.successesMax = d.classicTerminidInvasion.successesMax;
        break;
      case "terminidInvasionDurationMinMs":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.durationMinMs = d.classicTerminidInvasion.durationMinMs;
        break;
      case "terminidInvasionDurationMaxMs":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.durationMaxMs = d.classicTerminidInvasion.durationMaxMs;
        break;
      case "terminidInvasionFogOpacityMin":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.fogOpacityMin = d.classicTerminidInvasion.fogOpacityMin;
        break;
      case "terminidInvasionFogOpacityMax":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.fogOpacityMax = d.classicTerminidInvasion.fogOpacityMax;
        break;
      case "terminidInvasionFogPulsePeriodMs":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.fogPulsePeriodMs = d.classicTerminidInvasion.fogPulsePeriodMs;
        break;
      case "terminidInvasionFogImageUrl":
        cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
        cfg.classicTerminidInvasion.fogImageUrl = d.classicTerminidInvasion.fogImageUrl;
        break;
      case "illuminatiInvasionEnabled":
        cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d.classicIlluminatiInvasion };
        cfg.classicIlluminatiInvasion.enabled = d.classicIlluminatiInvasion.enabled;
        break;
      case "illuminatiInvasionSuccessesMin":
        cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d.classicIlluminatiInvasion };
        cfg.classicIlluminatiInvasion.successesMin = d.classicIlluminatiInvasion.successesMin;
        break;
      case "illuminatiInvasionSuccessesMax":
        cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d.classicIlluminatiInvasion };
        cfg.classicIlluminatiInvasion.successesMax = d.classicIlluminatiInvasion.successesMax;
        break;
      case "illuminatiInvasionDurationMinMs":
        cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d.classicIlluminatiInvasion };
        cfg.classicIlluminatiInvasion.durationMinMs = d.classicIlluminatiInvasion.durationMinMs;
        break;
      case "illuminatiInvasionDurationMaxMs":
        cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d.classicIlluminatiInvasion };
        cfg.classicIlluminatiInvasion.durationMaxMs = d.classicIlluminatiInvasion.durationMaxMs;
        break;
      case "illuminatiInvasionWarnLeadMs":
        cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d.classicIlluminatiInvasion };
        cfg.classicIlluminatiInvasion.warnLeadMs = d.classicIlluminatiInvasion.warnLeadMs;
        break;
      case "generalBraschEnabled":
        cfg.generalBrasch = cfg.generalBrasch || { ...d.generalBrasch };
        cfg.generalBrasch.enabled = d.generalBrasch.enabled;
        break;
      case "generalBraschEveryN":
        cfg.generalBrasch = cfg.generalBrasch || { ...d.generalBrasch };
        cfg.generalBrasch.everyNStratagems = d.generalBrasch.everyNStratagems;
        break;
      case "generalBraschDurationMs":
        cfg.generalBrasch = cfg.generalBrasch || { ...d.generalBrasch };
        cfg.generalBrasch.durationMs = d.generalBrasch.durationMs;
        break;
      case "generalBraschAnthemUrl":
        cfg.generalBrasch = cfg.generalBrasch || { ...d.generalBrasch };
        cfg.generalBrasch.anthemUrl = d.generalBrasch.anthemUrl;
        break;
      case "generalBraschAnthemVolume":
        cfg.generalBrasch = cfg.generalBrasch || { ...d.generalBrasch };
        cfg.generalBrasch.anthemVolume = d.generalBrasch.anthemVolume;
        break;
      case "generalBraschPortraitUrl":
        cfg.generalBrasch = cfg.generalBrasch || { ...d.generalBrasch };
        cfg.generalBrasch.portraitUrl = d.generalBrasch.portraitUrl;
        break;
      case "defaultKiosk":
        cfg.defaultKiosk = d.defaultKiosk;
        break;
      case "restartOnSpace":
        cfg.restartOnSpace = d.restartOnSpace;
        break;
      case "kioskAutoRestart":
        cfg.kioskAutoRestart = d.kioskAutoRestart;
        break;
      case "kioskAutoRestartDelayMs":
        cfg.kioskAutoRestartDelayMs = d.kioskAutoRestartDelayMs;
        break;
      case "endScreenDefeatTitleField":
        cfg.endScreenDefeat = cfg.endScreenDefeat || {};
        cfg.endScreenDefeat.title = d.endScreenDefeat.title;
        break;
      case "endScreenDefeatMessageField":
        cfg.endScreenDefeat = cfg.endScreenDefeat || {};
        cfg.endScreenDefeat.message = d.endScreenDefeat.message;
        break;
      case "endScreenDefeatLinkUrl":
        cfg.endScreenDefeat = cfg.endScreenDefeat || {};
        cfg.endScreenDefeat.linkUrl = d.endScreenDefeat.linkUrl;
        break;
      case "endScreenDefeatLinkText":
        cfg.endScreenDefeat = cfg.endScreenDefeat || {};
        cfg.endScreenDefeat.linkText = d.endScreenDefeat.linkText;
        break;
      case "endScreenDefeatShowQr":
        cfg.endScreenDefeat = cfg.endScreenDefeat || {};
        cfg.endScreenDefeat.showQr = d.endScreenDefeat.showQr;
        break;
      case "endScreenDefeatQrUrl":
        cfg.endScreenDefeat = cfg.endScreenDefeat || {};
        cfg.endScreenDefeat.qrUrl = d.endScreenDefeat.qrUrl;
        break;
      case "endScreenVictoryTitleField":
        cfg.endScreenVictory = cfg.endScreenVictory || {};
        cfg.endScreenVictory.title = d.endScreenVictory.title;
        break;
      case "endScreenVictoryMessageField":
        cfg.endScreenVictory = cfg.endScreenVictory || {};
        cfg.endScreenVictory.message = d.endScreenVictory.message;
        break;
      case "endScreenVictoryLinkUrl":
        cfg.endScreenVictory = cfg.endScreenVictory || {};
        cfg.endScreenVictory.linkUrl = d.endScreenVictory.linkUrl;
        break;
      case "endScreenVictoryLinkText":
        cfg.endScreenVictory = cfg.endScreenVictory || {};
        cfg.endScreenVictory.linkText = d.endScreenVictory.linkText;
        break;
      case "endScreenVictoryShowQr":
        cfg.endScreenVictory = cfg.endScreenVictory || {};
        cfg.endScreenVictory.showQr = d.endScreenVictory.showQr;
        break;
      case "endScreenVictoryQrUrl":
        cfg.endScreenVictory = cfg.endScreenVictory || {};
        cfg.endScreenVictory.qrUrl = d.endScreenVictory.qrUrl;
        break;
      case "terminalBackground":
        cfg.terminalBackground = d.terminalBackground;
        break;
      case "globalPlayfieldBg":
        cfg.globalPlayfieldBg = d.globalPlayfieldBg;
        break;
      case "globalCardBg":
        cfg.globalCardBg = d.globalCardBg;
        break;
      case "includeIncomplete":
        cfg.includeIncomplete = d.includeIncomplete;
        break;
      case "usePatchBackgrounds":
        cfg.usePatchBackgrounds = d.usePatchBackgrounds;
        break;
      case "superEarthWatermark":
        cfg.superEarthWatermark = d.superEarthWatermark;
        break;
      case "enableSwipes":
        cfg.enableSwipes = d.enableSwipes;
        break;
      case "swipeMinDistance":
        cfg.swipeMinDistance = d.swipeMinDistance;
        break;
      case "directionSoundsMutedCheck":
        cfg.directionSoundsMuted = d.directionSoundsMuted;
        break;
      default:
        return;
    }
    saveConfig(cfg);
    syncSettingsForm();
    if (
      ["themeType", "mp3Url", "youtubeUrl", "youtubeMute"].includes(id)
    ) {
      applyTheme();
    }
    if (
      [
        "terminalBackground",
        "globalPlayfieldBg",
        "globalCardBg",
        "includeIncomplete",
        "usePatchBackgrounds",
        "superEarthWatermark",
        "enableSwipes",
        "swipeMinDistance",
      ].includes(id)
    ) {
      applyGlobalBackgrounds();
      applyTerminalBackground();
    }
    if (id === "maxErrors") updateErrorsHud();
  }

  function wireSettingsResetChrome() {
    const panel = el("panelSettings");
    if (!panel) return;
    panel.querySelectorAll("label.block, label.inline").forEach((lab) => {
      const inp = lab.querySelector("input[id], select[id], textarea[id]");
      if (!inp || !inp.id) return;
      if (inp.type === "file") return;
      if (lab.querySelector(".btn-reset-one-field")) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-reset-one-field";
      b.dataset.resetField = inp.id;
      b.setAttribute("aria-label", t("resetFieldToDefault"));
      b.title = t("resetFieldToDefault");
      b.textContent = "↺";
      lab.appendChild(b);
    });
    panel.addEventListener("click", (ev) => {
      const tBtn = ev.target.closest(".btn-reset-one-field");
      if (!tBtn || !panel.contains(tBtn)) return;
      ev.preventDefault();
      resetSingleSettingsControl(tBtn.dataset.resetField);
    });
    el("btnResetAllSettings")?.addEventListener("click", resetAllSettingsToDefault);
    panel.querySelectorAll(".btn-reset-section").forEach((btn) => {
      btn.addEventListener("click", () => resetSettingsSection(btn.getAttribute("data-reset-section")));
    });
  }

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
    const inv = cfg.classicInvasion || {};
    if (inv.enabled === false) return 999999;
    const mn = Math.max(1, Math.floor(Number(inv.successesMin) || 10));
    const mx = Math.max(mn, Math.floor(Number(inv.successesMax) || 12));
    return mn + Math.floor(Math.random() * (mx - mn + 1));
  }

  function randomIlluminatiStratThreshold() {
    const inv = cfg.classicIlluminatiInvasion || {};
    if (inv.enabled === false) return 999999;
    const mn = Math.max(1, Math.floor(Number(inv.successesMin) || 10));
    const mx = Math.max(mn, Math.floor(Number(inv.successesMax) || 12));
    return mn + Math.floor(Math.random() * (mx - mn + 1));
  }

  function randomTerminidStratThreshold() {
    const inv = cfg.classicTerminidInvasion || {};
    if (inv.enabled === false) return 999999;
    const mn = Math.max(1, Math.floor(Number(inv.successesMin) || 10));
    const mx = Math.max(mn, Math.floor(Number(inv.successesMax) || 12));
    return mn + Math.floor(Math.random() * (mx - mn + 1));
  }

  function initRunAutomatonState(runObj) {
    if (!runObj) return;
    runObj.automatonStratCount = 0;
    runObj.automatonNextAt = randomAutomatonStratThreshold();
    runObj.automatonUntil = null;
    runObj.illuminatiStratCount = 0;
    runObj.illuminatiNextAt = randomIlluminatiStratThreshold();
    runObj.illuminatiWarnUntil = null;
    runObj.illuminatiUntil = null;
    runObj.terminidStratCount = 0;
    runObj.terminidNextAt = randomTerminidStratThreshold();
    runObj.terminidUntil = null;
    runObj.automatonPlayfieldTransform = "";
  }

  function isAutomatonTakeoverActive() {
    return !!(run && run.active && run.automatonUntil && Date.now() < run.automatonUntil);
  }

  function isTerminidTakeoverActive() {
    return !!(run && run.active && run.terminidUntil && Date.now() < run.terminidUntil);
  }

  /** Warning strip + scheduled window (before / during effect). */
  function isIlluminatiInvasionScheduled() {
    return !!(run && run.active && run.illuminatiUntil && Date.now() < run.illuminatiUntil);
  }

  function isIlluminatiInvasionWarningPhase() {
    return !!(
      run &&
      run.active &&
      run.illuminatiWarnUntil &&
      Date.now() < run.illuminatiWarnUntil
    );
  }

  /** Purple/blue UI, RTL input, watermark — after warn lead, until end. */
  function isIlluminatiInvasionEffectActive() {
    return !!(
      run &&
      run.active &&
      run.illuminatiWarnUntil != null &&
      run.illuminatiUntil &&
      Date.now() >= run.illuminatiWarnUntil &&
      Date.now() < run.illuminatiUntil
    );
  }

  function syncAutomatonTakeoverUi() {
    const on = isAutomatonTakeoverActive();
    document.documentElement.classList.toggle("automaton-takeover", on);
    const cw = el("cyberstanWatermark");
    if (cw) cw.hidden = !on;
    if (!on) clearAutomatonPlayfieldTransform();
  }

  function clampTerminidFogOpacity(v, fallback) {
    const x = Number(v);
    if (!Number.isFinite(x)) return fallback;
    return Math.max(0, Math.min(1, x));
  }

  function syncTerminidTakeoverUi() {
    const on = isTerminidTakeoverActive();
    document.documentElement.classList.toggle("terminid-takeover", on);
    const layer = el("terminidFogLayer");
    const tDef = defaultConfig().classicTerminidInvasion;
    const inv = deepMerge(tDef, cfg.classicTerminidInvasion || {});
    let omin = clampTerminidFogOpacity(inv.fogOpacityMin, tDef.fogOpacityMin);
    let omax = clampTerminidFogOpacity(inv.fogOpacityMax, tDef.fogOpacityMax);
    if (omax < omin) [omin, omax] = [omax, omin];
    const periodMs = Math.max(400, Math.floor(Number(inv.fogPulsePeriodMs) || tDef.fogPulsePeriodMs));
    const root = document.documentElement;
    if (on) {
      root.style.setProperty("--terminid-fog-opacity-min", String(omin));
      root.style.setProperty("--terminid-fog-opacity-max", String(omax));
      root.style.setProperty("--terminid-fog-pulse-ms", `${periodMs}ms`);
    } else {
      root.style.removeProperty("--terminid-fog-opacity-min");
      root.style.removeProperty("--terminid-fog-opacity-max");
      root.style.removeProperty("--terminid-fog-pulse-ms");
    }
    if (layer) {
      layer.hidden = !on;
      const url = String(inv.fogImageUrl || "").trim();
      if (url) {
        const safe = url.replace(/\\/g, "/").replace(/'/g, "%27");
        layer.style.backgroundImage = `url('${safe}')`;
      } else {
        layer.style.removeProperty("background-image");
      }
    }
  }

  const AUTOMATON_PLAYFIELD_TRANSFORMS = [
    "rotate(0deg)",
    "rotate(90deg)",
    "rotate(180deg)",
    "rotate(270deg)",
    "scaleX(-1)",
    "scaleY(-1)",
  ];

  function clearAutomatonPlayfieldTransform() {
    const pf = el("playfield");
    if (!pf) return;
    pf.style.removeProperty("transform");
    pf.style.removeProperty("transition");
    pf.style.removeProperty("transform-origin");
    if (run) run.automatonPlayfieldTransform = "";
  }

  /** Random orientation during Automaton invasion (classic in-game only). */
  function bumpAutomatonPlayfieldRandomOrientation() {
    if (!run || !run.classicRun || !isAutomatonTakeoverActive()) return;
    if (typeof ClassicStratagemHero === "undefined" || !ClassicStratagemHero.isActive()) return;
    if (ClassicStratagemHero.getScreen && ClassicStratagemHero.getScreen() !== "in_game") return;
    const pf = el("playfield");
    if (!pf) return;
    const modes = AUTOMATON_PLAYFIELD_TRANSFORMS;
    let next;
    for (let i = 0; i < 8; i++) {
      next = modes[Math.floor(Math.random() * modes.length)];
      if (next !== run.automatonPlayfieldTransform || modes.length < 2) break;
    }
    run.automatonPlayfieldTransform = next;
    pf.style.transformOrigin = "center center";
    pf.style.transition = "transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)";
    pf.style.transform = next;
  }

  function syncIlluminatiTakeoverUi() {
    const on = isIlluminatiInvasionEffectActive();
    document.documentElement.classList.toggle("illuminati-takeover", on);
    const iw = el("illuminateWatermark");
    if (iw) iw.hidden = !on;
    updateIlluminateInvasionHud();
  }

  function updateIlluminateInvasionHud() {
    const host = el("illuminateInvasionHud");
    const banner = el("illuminateInvasionBanner");
    const timer = el("illuminateInvasionTimer");
    if (!host || !banner || !timer) return;
    const classicOn =
      typeof ClassicStratagemHero !== "undefined" &&
      ClassicStratagemHero.isActive() &&
      ClassicStratagemHero.getScreen &&
      ClassicStratagemHero.getScreen() === "in_game";
    if (!classicOn || !run || !run.classicRun || !isIlluminatiInvasionScheduled()) {
      host.hidden = true;
      banner.hidden = true;
      timer.hidden = true;
      banner.classList.remove("illuminate-invasion-banner--blink");
      return;
    }
    host.hidden = false;
    if (isIlluminatiInvasionWarningPhase()) {
      banner.hidden = false;
      timer.hidden = true;
      banner.classList.add("illuminate-invasion-banner--blink");
      const sec = Math.max(1, Math.ceil((run.illuminatiWarnUntil - Date.now()) / 1000));
      banner.textContent = t("illuminateInvasionBannerText").replace("{seconds}", String(sec));
    } else {
      banner.hidden = true;
      banner.classList.remove("illuminate-invasion-banner--blink");
      timer.hidden = false;
      const left = Math.max(0, run.illuminatiUntil - Date.now());
      timer.textContent = t("illuminateInvasionTimerLeft").replace("{time}", formatSessionLeft(left));
    }
  }

  function maybeEndAutomatonTakeover() {
    if (!run || !run.active || !run.automatonUntil || Date.now() < run.automatonUntil) return;
    run.automatonUntil = null;
    syncAutomatonTakeoverUi();
    if (run.classicRun) applyGlobalBackgrounds();
    else applyPlayfieldForStratagem(run.current && run.current.strat ? run.current.strat : null);
  }

  function maybeEndTerminidTakeover() {
    if (!run || !run.active || !run.terminidUntil || Date.now() < run.terminidUntil) return;
    run.terminidUntil = null;
    syncTerminidTakeoverUi();
    if (run.classicRun) applyGlobalBackgrounds();
    else applyPlayfieldForStratagem(run.current && run.current.strat ? run.current.strat : null);
  }

  function maybeEndIlluminatiTakeover() {
    if (!run || !run.active || !run.illuminatiUntil || Date.now() < run.illuminatiUntil) return;
    run.illuminatiUntil = null;
    run.illuminatiWarnUntil = null;
    syncIlluminatiTakeoverUi();
    if (run.classicRun) applyGlobalBackgrounds();
    else applyPlayfieldForStratagem(run.current && run.current.strat ? run.current.strat : null);
  }

  function tryAutomatonTakeoverAfterSuccess() {
    if (!run || !run.active || isAutomatonTakeoverActive()) return;
    if (isIlluminatiInvasionScheduled()) return;
    const inv = cfg.classicInvasion || {};
    if (inv.enabled === false) return;
    if (run.automatonNextAt == null) run.automatonNextAt = randomAutomatonStratThreshold();
    run.automatonStratCount = (run.automatonStratCount || 0) + 1;
    if (run.automatonStratCount < run.automatonNextAt) return;
    run.automatonStratCount = 0;
    run.automatonNextAt = randomAutomatonStratThreshold();
    const dMin = Math.max(1000, Number(inv.durationMinMs) || 20000);
    const dMax = Math.max(dMin, Number(inv.durationMaxMs) || 40000);
    run.automatonUntil = Date.now() + dMin + Math.random() * (dMax - dMin);
    run.illuminatiUntil = null;
    run.illuminatiWarnUntil = null;
    run.terminidUntil = null;
    syncIlluminatiTakeoverUi();
    syncTerminidTakeoverUi();
    syncAutomatonTakeoverUi();
    bumpAutomatonPlayfieldRandomOrientation();
  }

  function invasionTryOrderAfterSuccess() {
    const pri = cfg.classicInvasionPriority;
    const a = "automaton";
    const i = "illuminate";
    const t = "terminid";
    if (pri === "illuminate") return [i, a, t];
    if (pri === "terminid") return [t, a, i];
    return [a, i, t];
  }

  function tryInvasionsAfterSuccess() {
    if (!run || !run.active) return;
    for (const kind of invasionTryOrderAfterSuccess()) {
      if (kind === "illuminate") tryIlluminatiTakeoverAfterSuccess();
      else if (kind === "terminid") tryTerminidTakeoverAfterSuccess();
      else tryAutomatonTakeoverAfterSuccess();
    }
  }

  function tryIlluminatiTakeoverAfterSuccess() {
    if (!run || !run.active || isIlluminatiInvasionScheduled()) return;
    const inv = cfg.classicIlluminatiInvasion || {};
    if (inv.enabled === false) return;
    if (run.illuminatiNextAt == null) run.illuminatiNextAt = randomIlluminatiStratThreshold();
    run.illuminatiStratCount = (run.illuminatiStratCount || 0) + 1;
    if (run.illuminatiStratCount < run.illuminatiNextAt) return;
    run.illuminatiStratCount = 0;
    run.illuminatiNextAt = randomIlluminatiStratThreshold();
    const dMin = Math.max(1000, Number(inv.durationMinMs) || 20000);
    const dMax = Math.max(dMin, Number(inv.durationMaxMs) || 40000);
    const duration = dMin + Math.random() * (dMax - dMin);
    const warnLead = Math.max(0, Math.floor(Number(inv.warnLeadMs) || 5000));
    const t0 = Date.now();
    run.illuminatiWarnUntil = t0 + warnLead;
    run.illuminatiUntil = run.illuminatiWarnUntil + duration;
    run.automatonUntil = null;
    run.terminidUntil = null;
    syncAutomatonTakeoverUi();
    syncTerminidTakeoverUi();
    syncIlluminatiTakeoverUi();
  }

  function tryTerminidTakeoverAfterSuccess() {
    if (!run || !run.active || isTerminidTakeoverActive()) return;
    const inv = cfg.classicTerminidInvasion || {};
    if (inv.enabled === false) return;
    if (run.terminidNextAt == null) run.terminidNextAt = randomTerminidStratThreshold();
    if (run.terminidStratCount < run.terminidNextAt) {
      run.terminidStratCount = (run.terminidStratCount || 0) + 1;
    }
    if (run.terminidStratCount < run.terminidNextAt) return;
    if (isAutomatonTakeoverActive() || isIlluminatiInvasionScheduled()) return;
    run.terminidStratCount = 0;
    run.terminidNextAt = randomTerminidStratThreshold();
    const dMin = Math.max(1000, Number(inv.durationMinMs) || 20000);
    const dMax = Math.max(dMin, Number(inv.durationMaxMs) || 40000);
    run.terminidUntil = Date.now() + dMin + Math.random() * (dMax - dMin);
    run.automatonUntil = null;
    run.illuminatiUntil = null;
    run.illuminatiWarnUntil = null;
    syncAutomatonTakeoverUi();
    syncIlluminatiTakeoverUi();
    syncTerminidTakeoverUi();
  }

  function clearAutomatonTakeoverForRunEnd() {
    if (run) {
      run.automatonUntil = null;
      run.illuminatiUntil = null;
      run.illuminatiWarnUntil = null;
      run.terminidUntil = null;
    }
    syncAutomatonTakeoverUi();
    syncIlluminatiTakeoverUi();
    syncTerminidTakeoverUi();
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
    if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive()) return;
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

  function getSolvedStratagemCount() {
    if (
      typeof ClassicStratagemHero !== "undefined" &&
      ClassicStratagemHero.isActive &&
      ClassicStratagemHero.isActive() &&
      ClassicStratagemHero.getCompletedStratagemCount
    ) {
      return Math.max(0, Math.floor(Number(ClassicStratagemHero.getCompletedStratagemCount()) || 0));
    }
    return Math.max(0, Math.floor(Number(run && run.solvedStratagems) || 0));
  }

  /**
   * @param {"defeat"|"victory"} kind
   * @param {number} score
   * @param {number} solvedStratagems
   * @param {{ title?: string, message?: string } | null} fallbacks — i18n strings; message may contain {score}
   */
  function showFinalScreenModal(kind, score, solvedStratagems, fallbacks) {
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
    const solvedLine = t("finalScreenSolvedLine").replace(
      "{count}",
      String(Math.max(0, Math.floor(Number(solvedStratagems) || 0)))
    );
    el("gameOverMessageText").textContent = `${msg} ${solvedLine}`;

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

    applyFinalScreenQr(es.showQr !== false ? es.qrUrl : "");
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
      showFinalScreenModal("defeat", score, getSolvedStratagemCount(), {
        title: t("kioskLotteryEndTitle"),
        message: t("kioskLotteryEndMsg"),
      });
    } else if (kind === "marathon") {
      showFinalScreenModal("victory", score, getSolvedStratagemCount(), {
        title: t("kioskMarathonEndTitle"),
        message: t("kioskTimedEndMsg"),
      });
    } else {
      showFinalScreenModal("victory", score, getSolvedStratagemCount(), {
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
    showFinalScreenModal("defeat", score, getSolvedStratagemCount(), {
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

  function notifySettingsSavedUi() {
    const ps = el("panelSettings");
    if (!ps || !ps.classList.contains("active")) return;
    showSettingsSavedToast();
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
    if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.setDirectionSfxMuted) {
      ClassicStratagemHero.setDirectionSfxMuted(muted);
    }
  }

  function syncCreditsModalLocale() {
    document.querySelectorAll("[data-credits-lang]").forEach((node) => {
      const lang = node.getAttribute("data-credits-lang");
      const loc = cfg.locale === "ru" ? "ru" : "en";
      node.hidden = lang !== loc;
    });
  }

  function hideHelpRulesModal() {
    const m = el("helpRulesModal");
    if (m) m.hidden = true;
  }

  function showHelpRulesModal() {
    hideCreditsModal();
    const m = el("helpRulesModal");
    if (!m) return;
    m.hidden = false;
    const btn = el("helpRulesModalClose");
    requestAnimationFrame(() => {
      if (!btn) return;
      try {
        btn.focus({ preventScroll: true });
      } catch {
        btn.focus();
      }
    });
  }

  function showCreditsModal() {
    hideHelpRulesModal();
    syncCreditsModalLocale();
    const m = el("creditsModal");
    if (!m) return;
    m.hidden = false;
    const btn = el("creditsModalClose");
    requestAnimationFrame(() => {
      if (!btn) return;
      try {
        btn.focus({ preventScroll: true });
      } catch {
        btn.focus();
      }
    });
  }

  function hideCreditsModal() {
    const m = el("creditsModal");
    if (m) m.hidden = true;
  }

  function applyI18nDom() {
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const k = node.getAttribute("data-i18n");
      if (k) node.textContent = t(k);
    });
    const sel = el("localeSelect");
    if (sel) sel.value = cfg.locale;
    syncDirectionSoundsMuteUi();
    syncCreditsModalLocale();
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
    const pf = el("playfield");
    if (backdrop) backdrop.innerHTML = "";
    if (pf) pf.classList.remove("playfield--youtube-bg");
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    if (cfg.theme.type === "youtube" && cfg.theme.youtubeUrl) {
      const src = parseYoutubeEmbed(cfg.theme.youtubeUrl, cfg.theme.youtubeMuted);
      if (src && backdrop) {
        if (pf) pf.classList.add("playfield--youtube-bg");
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
    if (isIlluminatiInvasionEffectActive()) {
      pf.style.backgroundColor = "#07051a";
      pf.style.backgroundImage = [
        "radial-gradient(ellipse 120% 85% at 50% 10%, rgba(120, 80, 220, 0.42) 0%, transparent 55%)",
        "radial-gradient(ellipse 75% 60% at 85% 90%, rgba(40, 90, 200, 0.45) 0%, transparent 48%)",
        "radial-gradient(ellipse 55% 45% at 12% 75%, rgba(160, 60, 220, 0.22) 0%, transparent 50%)",
        "linear-gradient(168deg, rgba(18, 12, 42, 0.98) 0%, rgba(8, 14, 38, 0.99) 52%, rgba(6, 8, 28, 1) 100%)",
        "repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(140, 100, 255, 0.055) 5px, rgba(140, 100, 255, 0.055) 10px)",
        "repeating-linear-gradient(0deg, transparent, transparent 44px, rgba(80, 140, 255, 0.04) 44px, rgba(80, 140, 255, 0.04) 45px)",
      ].join(", ");
      pf.style.backgroundSize = "cover, cover, cover, cover, auto, auto";
      pf.style.backgroundPosition = "center, center, center, center, center, center";
      pf.style.backgroundRepeat = "no-repeat, no-repeat, no-repeat, no-repeat, repeat, repeat";
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
      showFinalScreenModal("defeat", finalScore, getSolvedStratagemCount(), {
        title: t("kioskLotteryEndTitle"),
        message: t("kioskLotteryEndMsg"),
      });
      updateKioskArcadeSplash();
      return;
    }
    if (preset === "sprint30" && (reason === "time" || reason === "session")) {
      ClassicStratagemHero.stop();
      showFinalScreenModal("victory", finalScore, getSolvedStratagemCount(), {
        title: t("kioskSprintEndTitle"),
        message: t("kioskTimedEndMsg"),
      });
      updateKioskArcadeSplash();
      return;
    }
    if (preset === "marathon5" && (reason === "session" || reason === "time")) {
      ClassicStratagemHero.stop();
      showFinalScreenModal("victory", finalScore, getSolvedStratagemCount(), {
        title: t("kioskMarathonEndTitle"),
        message: t("kioskTimedEndMsg"),
      });
      updateKioskArcadeSplash();
    }
  }

  function initClassicRunStateForNewGame() {
    const preset = isKioskMode() ? lastKioskPreset : null;
    run = {
      active: true,
      errors: 0,
      classicRun: true,
      score: 0,
      noPenalties: preset === "easy",
      lotteryOneShot: preset === "lottery",
      kioskPreset: preset,
      sessionDeadline: null,
      level: 1,
      solvedStratagems: 0,
    };
    initRunAutomatonState(run);
    updateErrorsHud();
    updateSessionHud();
  }

  function classicOnRoundTimerZero() {
    if (!run || !run.classicRun) return false;
    if (run.lotteryOneShot) return false;
    const gr = gameRules();
    const maxE = Math.max(0, Number(gr.maxErrors) || 0);
    if (maxE <= 0) return false;
    if (gr.countTimeoutAsError === false) return false;
    if (registerFailError("timeout")) return true;
    ClassicStratagemHero.refillRoundTimerAfterLifeLost();
    applyGlobalBackgrounds();
    return true;
  }

  function classicOnClassicWrong() {
    if (!run || !run.classicRun) return;
    if (run.lotteryOneShot) return;
    registerFailError("wrong");
  }

  function classicOnStratCompleted() {
    if (!run || !run.classicRun) return;
    run.solvedStratagems = (run.solvedStratagems || 0) + 1;
    tryInvasionsAfterSuccess();
    applyGlobalBackgrounds();
  }

  function classicOnAfterTick() {
    if (!run || !run.classicRun) return;
    if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive()) {
      run.sessionDeadline = ClassicStratagemHero.getSessionDeadline();
      run.score = ClassicStratagemHero.getScore();
    }
    maybeEndAutomatonTakeover();
    maybeEndIlluminatiTakeover();
    maybeEndTerminidTakeover();
    updateIlluminateInvasionHud();
    updateSessionHud();
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
        initClassicRunStateForNewGame();
        startLoadingLineTicker();
      },
      onStop: () => {
        if (run && run.classicRun) {
          clearAutomatonTakeoverForRunEnd();
          run = null;
        }
        stopLoadingLineTicker();
        updateErrorsHud();
        updateSessionHud();
      },
      onGameOver: (finalScore, gameOverReason) => {
        if (run && run.classicRun) {
          clearAutomatonTakeoverForRunEnd();
          run = null;
        }
        handleClassicGameOver(finalScore, gameOverReason);
      },
      onVolumeChange: (v) => {
        cfg.sfxVolume = v;
        saveConfig(cfg, { suppressSettingsToast: true });
      },
      onScreenChange: (screenName) => {
        updatePlayfieldTouchCapture();
        if (screenName !== "in_game") clearAutomatonPlayfieldTransform();
      },
      onRoundTimerZero: classicOnRoundTimerZero,
      onClassicWrong: classicOnClassicWrong,
      onClassicStratCompleted: classicOnStratCompleted,
      onAfterTick: classicOnAfterTick,
      getGeneralBraschConfig: () => deepMerge(defaultConfig().generalBrasch, cfg.generalBrasch || {}),
      getIlluminateRtlInput: () => !!(run && run.classicRun && isIlluminatiInvasionEffectActive()),
      onClassicActiveStratagemChanged: () => bumpAutomatonPlayfieldRandomOrientation(),
    });
    const gb = deepMerge(defaultConfig().generalBrasch, cfg.generalBrasch || {});
    if (ClassicStratagemHero.setBraschAnthemVolume01) {
      ClassicStratagemHero.setBraschAnthemVolume01(
        Number.isFinite(Number(gb.anthemVolume)) ? Math.max(0, Math.min(1, Number(gb.anthemVolume))) : 1
      );
    }
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
    showFinalScreenModal("defeat", run ? run.score : 0, getSolvedStratagemCount(), null);
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
      if (!isKioskMode()) {
        ensureClassicAttractMode();
      }
    }
  }

  function gameOverFromErrors() {
    stopLoadingLineTicker();
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    let defeatScore = 0;
    if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.isActive()) {
      defeatScore = ClassicStratagemHero.getScore();
      ClassicStratagemHero.stop();
    } else if (run) {
      defeatScore = run.score || 0;
      clearAutomatonTakeoverForRunEnd();
    }
    if (run) run.active = false;
    run = null;
    touchStart = null;
    setPlayfieldTouchMode(false);
    el("stratAudio").pause();
    el("playHint").textContent = t("defeatMaxErrors");
    updateTimerHud();
    updateSessionHud();
    updateErrorsHud();
    showFinalScreenModal("defeat", defeatScore, getSolvedStratagemCount(), {
      title: t("gameOverTitle"),
      message: t("defeatMaxErrors"),
    });
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
    tryInvasionsAfterSuccess();
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
    const helpRulesModal = el("helpRulesModal");
    if (helpRulesModal && !helpRulesModal.hidden && e.code === "Escape") {
      e.preventDefault();
      hideHelpRulesModal();
      return;
    }
    const creditsModal = el("creditsModal");
    if (creditsModal && !creditsModal.hidden && e.code === "Escape") {
      e.preventDefault();
      hideCreditsModal();
      return;
    }
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
    if (run && run.active) {
      maybeEndAutomatonTakeover();
      maybeEndIlluminatiTakeover();
      maybeEndTerminidTakeover();
    }
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

    const invDef = defaultConfig().classicInvasion;
    const inv = deepMerge(invDef, cfg.classicInvasion || {});
    const invEn = el("invasionEnabled");
    if (invEn) invEn.checked = inv.enabled !== false;
    const invMinS = el("invasionSuccessesMin");
    if (invMinS) invMinS.value = String(Math.max(1, Math.floor(Number(inv.successesMin) || invDef.successesMin)));
    const invMaxS = el("invasionSuccessesMax");
    if (invMaxS) invMaxS.value = String(Math.max(1, Math.floor(Number(inv.successesMax) || invDef.successesMax)));
    const invDmin = el("invasionDurationMinMs");
    if (invDmin) invDmin.value = String(Math.max(1000, Math.floor(Number(inv.durationMinMs) || invDef.durationMinMs)));
    const invDmax = el("invasionDurationMaxMs");
    if (invDmax) invDmax.value = String(Math.max(1000, Math.floor(Number(inv.durationMaxMs) || invDef.durationMaxMs)));
    const invPri = el("invasionPriority");
    if (invPri) {
      const p = cfg.classicInvasionPriority;
      invPri.value = p === "illuminate" || p === "terminid" ? p : "automaton";
    }

    const terDef = defaultConfig().classicTerminidInvasion;
    const ter = deepMerge(terDef, cfg.classicTerminidInvasion || {});
    const terEn = el("terminidInvasionEnabled");
    if (terEn) terEn.checked = ter.enabled !== false;
    const terMinS = el("terminidInvasionSuccessesMin");
    if (terMinS) terMinS.value = String(Math.max(1, Math.floor(Number(ter.successesMin) || terDef.successesMin)));
    const terMaxS = el("terminidInvasionSuccessesMax");
    if (terMaxS) terMaxS.value = String(Math.max(1, Math.floor(Number(ter.successesMax) || terDef.successesMax)));
    const terDmin = el("terminidInvasionDurationMinMs");
    if (terDmin) terDmin.value = String(Math.max(1000, Math.floor(Number(ter.durationMinMs) || terDef.durationMinMs)));
    const terDmax = el("terminidInvasionDurationMaxMs");
    if (terDmax) terDmax.value = String(Math.max(1000, Math.floor(Number(ter.durationMaxMs) || terDef.durationMaxMs)));
    const terFogMin = el("terminidInvasionFogOpacityMin");
    if (terFogMin) terFogMin.value = String(clampTerminidFogOpacity(ter.fogOpacityMin, terDef.fogOpacityMin));
    const terFogMax = el("terminidInvasionFogOpacityMax");
    if (terFogMax) terFogMax.value = String(clampTerminidFogOpacity(ter.fogOpacityMax, terDef.fogOpacityMax));
    const terPulse = el("terminidInvasionFogPulsePeriodMs");
    if (terPulse) terPulse.value = String(Math.max(400, Math.floor(Number(ter.fogPulsePeriodMs) || terDef.fogPulsePeriodMs)));
    const terImg = el("terminidInvasionFogImageUrl");
    if (terImg) terImg.value = ter.fogImageUrl || "";

    const illDef = defaultConfig().classicIlluminatiInvasion;
    const ill = deepMerge(illDef, cfg.classicIlluminatiInvasion || {});
    const illEn = el("illuminatiInvasionEnabled");
    if (illEn) illEn.checked = ill.enabled !== false;
    const illMinS = el("illuminatiInvasionSuccessesMin");
    if (illMinS) illMinS.value = String(Math.max(1, Math.floor(Number(ill.successesMin) || illDef.successesMin)));
    const illMaxS = el("illuminatiInvasionSuccessesMax");
    if (illMaxS) illMaxS.value = String(Math.max(1, Math.floor(Number(ill.successesMax) || illDef.successesMax)));
    const illDmin = el("illuminatiInvasionDurationMinMs");
    if (illDmin) illDmin.value = String(Math.max(1000, Math.floor(Number(ill.durationMinMs) || illDef.durationMinMs)));
    const illDmax = el("illuminatiInvasionDurationMaxMs");
    if (illDmax) illDmax.value = String(Math.max(1000, Math.floor(Number(ill.durationMaxMs) || illDef.durationMaxMs)));
    const illWarn = el("illuminatiInvasionWarnLeadMs");
    if (illWarn)
      illWarn.value = String(Math.max(0, Math.floor(Number(ill.warnLeadMs) ?? illDef.warnLeadMs)));

    const gbDef = defaultConfig().generalBrasch;
    const gb = deepMerge(gbDef, cfg.generalBrasch || {});
    const gbEn = el("generalBraschEnabled");
    if (gbEn) gbEn.checked = gb.enabled !== false;
    const gbN = el("generalBraschEveryN");
    if (gbN) gbN.value = String(Math.max(1, Math.floor(Number(gb.everyNStratagems) || gbDef.everyNStratagems)));
    const gbDur = el("generalBraschDurationMs");
    if (gbDur) gbDur.value = String(Math.max(1000, Math.floor(Number(gb.durationMs) || gbDef.durationMs)));
    const gbUrl = el("generalBraschAnthemUrl");
    if (gbUrl) gbUrl.value = gb.anthemUrl || "";
    const gbVol = el("generalBraschAnthemVolume");
    if (gbVol)
      gbVol.value = String(
        Math.max(0, Math.min(1, Number.isFinite(Number(gb.anthemVolume)) ? Number(gb.anthemVolume) : gbDef.anthemVolume))
      );
    const gbPortrait = el("generalBraschPortraitUrl");
    if (gbPortrait) gbPortrait.value = gb.portraitUrl || "";

    function syncFinalScreenForm(key, prefix) {
      const es = deepMerge(emptyFinalScreen(), cfg[key] || {});
      el(`${prefix}TitleField`).value = es.title || "";
      el(`${prefix}MessageField`).value = es.message || "";
      el(`${prefix}LinkUrl`).value = es.linkUrl || "";
      el(`${prefix}LinkText`).value = es.linkText || "";
      el(`${prefix}QrUrl`).value = es.qrUrl || "";
      const showQr = el(`${prefix}ShowQr`);
      if (showQr) showQr.checked = es.showQr !== false;
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
    const defKiosk = el("defaultKiosk");
    if (defKiosk) defKiosk.checked = cfg.defaultKiosk !== false;
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

    const btnHelpRules = el("btnHelpRules");
    if (btnHelpRules) btnHelpRules.addEventListener("click", () => showHelpRulesModal());
    el("helpRulesModalClose")?.addEventListener("click", () => hideHelpRulesModal());
    const hrBd = el("helpRulesModalBackdrop");
    if (hrBd) hrBd.addEventListener("click", () => hideHelpRulesModal());

    const btnCredits = el("btnCredits");
    if (btnCredits) btnCredits.addEventListener("click", () => showCreditsModal());
    el("creditsModalClose")?.addEventListener("click", () => hideCreditsModal());
    const crBd = el("creditsModalBackdrop");
    if (crBd) crBd.addEventListener("click", () => hideCreditsModal());

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
    const defKioskCb = el("defaultKiosk");
    if (defKioskCb) {
      defKioskCb.addEventListener("change", () => {
        cfg.defaultKiosk = defKioskCb.checked;
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

    function persistClassicInvasionsOverviewFromForm() {
      const d = defaultConfig();
      const invPriEl = el("invasionPriority");
      if (invPriEl) {
        const v = invPriEl.value;
        cfg.classicInvasionPriority = v === "illuminate" || v === "terminid" ? v : "automaton";
      }
      cfg.classicInvasion = cfg.classicInvasion || { ...d.classicInvasion };
      const invEn = el("invasionEnabled");
      if (invEn) cfg.classicInvasion.enabled = invEn.checked;
      cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d.classicIlluminatiInvasion };
      const illEn = el("illuminatiInvasionEnabled");
      if (illEn) cfg.classicIlluminatiInvasion.enabled = illEn.checked;
      cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d.classicTerminidInvasion };
      const terEn = el("terminidInvasionEnabled");
      if (terEn) cfg.classicTerminidInvasion.enabled = terEn.checked;
      saveConfig(cfg);
      syncTerminidTakeoverUi();
    }

    function persistClassicInvasionFromForm() {
      const d = defaultConfig().classicInvasion;
      cfg.classicInvasion = cfg.classicInvasion || { ...d };
      const mn = Math.max(1, Math.floor(Number(el("invasionSuccessesMin")?.value) || d.successesMin));
      let mx = Math.max(1, Math.floor(Number(el("invasionSuccessesMax")?.value) || d.successesMax));
      if (mx < mn) mx = mn;
      cfg.classicInvasion.successesMin = mn;
      cfg.classicInvasion.successesMax = mx;
      let dmin = Math.max(1000, Math.floor(Number(el("invasionDurationMinMs")?.value) || d.durationMinMs));
      let dmax = Math.max(1000, Math.floor(Number(el("invasionDurationMaxMs")?.value) || d.durationMaxMs));
      if (dmax < dmin) dmax = dmin;
      cfg.classicInvasion.durationMinMs = dmin;
      cfg.classicInvasion.durationMaxMs = dmax;
      const iMin = el("invasionSuccessesMin");
      const iMax = el("invasionSuccessesMax");
      const dm = el("invasionDurationMinMs");
      const dx = el("invasionDurationMaxMs");
      if (iMin) iMin.value = String(mn);
      if (iMax) iMax.value = String(mx);
      if (dm) dm.value = String(dmin);
      if (dx) dx.value = String(dmax);
      saveConfig(cfg);
    }
    ["invasionSuccessesMin", "invasionSuccessesMax", "invasionDurationMinMs", "invasionDurationMaxMs"].forEach((id) => {
      const node = el(id);
      if (!node) return;
      node.addEventListener("change", persistClassicInvasionFromForm);
    });
    ["invasionPriority", "invasionEnabled", "illuminatiInvasionEnabled", "terminidInvasionEnabled"].forEach((id) => {
      const node = el(id);
      if (!node) return;
      node.addEventListener("change", persistClassicInvasionsOverviewFromForm);
    });

    function persistClassicIlluminatiInvasionFromForm() {
      const d = defaultConfig().classicIlluminatiInvasion;
      cfg.classicIlluminatiInvasion = cfg.classicIlluminatiInvasion || { ...d };
      const mn = Math.max(1, Math.floor(Number(el("illuminatiInvasionSuccessesMin")?.value) || d.successesMin));
      let mx = Math.max(1, Math.floor(Number(el("illuminatiInvasionSuccessesMax")?.value) || d.successesMax));
      if (mx < mn) mx = mn;
      cfg.classicIlluminatiInvasion.successesMin = mn;
      cfg.classicIlluminatiInvasion.successesMax = mx;
      let dmin = Math.max(1000, Math.floor(Number(el("illuminatiInvasionDurationMinMs")?.value) || d.durationMinMs));
      let dmax = Math.max(1000, Math.floor(Number(el("illuminatiInvasionDurationMaxMs")?.value) || d.durationMaxMs));
      if (dmax < dmin) dmax = dmin;
      cfg.classicIlluminatiInvasion.durationMinMs = dmin;
      cfg.classicIlluminatiInvasion.durationMaxMs = dmax;
      let wlead = Math.max(0, Math.floor(Number(el("illuminatiInvasionWarnLeadMs")?.value)));
      if (Number.isNaN(wlead)) wlead = Math.max(0, Math.floor(Number(d.warnLeadMs) || 5000));
      cfg.classicIlluminatiInvasion.warnLeadMs = wlead;
      const iMin = el("illuminatiInvasionSuccessesMin");
      const iMax = el("illuminatiInvasionSuccessesMax");
      const dm = el("illuminatiInvasionDurationMinMs");
      const dx = el("illuminatiInvasionDurationMaxMs");
      const wEl = el("illuminatiInvasionWarnLeadMs");
      if (iMin) iMin.value = String(mn);
      if (iMax) iMax.value = String(mx);
      if (dm) dm.value = String(dmin);
      if (dx) dx.value = String(dmax);
      if (wEl) wEl.value = String(wlead);
      saveConfig(cfg);
    }
    [
      "illuminatiInvasionSuccessesMin",
      "illuminatiInvasionSuccessesMax",
      "illuminatiInvasionDurationMinMs",
      "illuminatiInvasionDurationMaxMs",
      "illuminatiInvasionWarnLeadMs",
    ].forEach((id) => {
      const node = el(id);
      if (!node) return;
      node.addEventListener("change", persistClassicIlluminatiInvasionFromForm);
    });

    function persistClassicTerminidInvasionFromForm() {
      const d = defaultConfig().classicTerminidInvasion;
      cfg.classicTerminidInvasion = cfg.classicTerminidInvasion || { ...d };
      const mn = Math.max(1, Math.floor(Number(el("terminidInvasionSuccessesMin")?.value) || d.successesMin));
      let mx = Math.max(1, Math.floor(Number(el("terminidInvasionSuccessesMax")?.value) || d.successesMax));
      if (mx < mn) mx = mn;
      cfg.classicTerminidInvasion.successesMin = mn;
      cfg.classicTerminidInvasion.successesMax = mx;
      let dmin = Math.max(1000, Math.floor(Number(el("terminidInvasionDurationMinMs")?.value) || d.durationMinMs));
      let dmax = Math.max(1000, Math.floor(Number(el("terminidInvasionDurationMaxMs")?.value) || d.durationMaxMs));
      if (dmax < dmin) dmax = dmin;
      cfg.classicTerminidInvasion.durationMinMs = dmin;
      cfg.classicTerminidInvasion.durationMaxMs = dmax;
      let fmin = clampTerminidFogOpacity(el("terminidInvasionFogOpacityMin")?.value, d.fogOpacityMin);
      let fmax = clampTerminidFogOpacity(el("terminidInvasionFogOpacityMax")?.value, d.fogOpacityMax);
      if (fmax < fmin) [fmin, fmax] = [fmax, fmin];
      cfg.classicTerminidInvasion.fogOpacityMin = fmin;
      cfg.classicTerminidInvasion.fogOpacityMax = fmax;
      let pulse = Math.max(400, Math.floor(Number(el("terminidInvasionFogPulsePeriodMs")?.value) || d.fogPulsePeriodMs));
      if (Number.isNaN(pulse)) pulse = Math.max(400, Math.floor(Number(d.fogPulsePeriodMs) || 4500));
      cfg.classicTerminidInvasion.fogPulsePeriodMs = pulse;
      cfg.classicTerminidInvasion.fogImageUrl = (el("terminidInvasionFogImageUrl")?.value || "").trim();
      const iMin = el("terminidInvasionSuccessesMin");
      const iMax = el("terminidInvasionSuccessesMax");
      const dm = el("terminidInvasionDurationMinMs");
      const dx = el("terminidInvasionDurationMaxMs");
      const fm = el("terminidInvasionFogOpacityMin");
      const fx = el("terminidInvasionFogOpacityMax");
      const pEl = el("terminidInvasionFogPulsePeriodMs");
      if (iMin) iMin.value = String(mn);
      if (iMax) iMax.value = String(mx);
      if (dm) dm.value = String(dmin);
      if (dx) dx.value = String(dmax);
      if (fm) fm.value = String(fmin);
      if (fx) fx.value = String(fmax);
      if (pEl) pEl.value = String(pulse);
      saveConfig(cfg);
      syncTerminidTakeoverUi();
    }
    [
      "terminidInvasionSuccessesMin",
      "terminidInvasionSuccessesMax",
      "terminidInvasionDurationMinMs",
      "terminidInvasionDurationMaxMs",
      "terminidInvasionFogOpacityMin",
      "terminidInvasionFogOpacityMax",
      "terminidInvasionFogPulsePeriodMs",
      "terminidInvasionFogImageUrl",
    ].forEach((id) => {
      const node = el(id);
      if (!node) return;
      node.addEventListener("change", persistClassicTerminidInvasionFromForm);
    });

    function persistGeneralBraschFromForm() {
      const d = defaultConfig().generalBrasch;
      cfg.generalBrasch = cfg.generalBrasch || { ...d };
      const en = el("generalBraschEnabled");
      if (en) cfg.generalBrasch.enabled = en.checked;
      const n = Math.max(1, Math.floor(Number(el("generalBraschEveryN")?.value) || d.everyNStratagems));
      const dur = Math.max(1000, Math.floor(Number(el("generalBraschDurationMs")?.value) || d.durationMs));
      const anthemVolRaw = Number(el("generalBraschAnthemVolume")?.value);
      const anthemVol = Number.isFinite(anthemVolRaw) ? Math.max(0, Math.min(1, anthemVolRaw)) : d.anthemVolume;
      cfg.generalBrasch.everyNStratagems = n;
      cfg.generalBrasch.durationMs = dur;
      cfg.generalBrasch.anthemUrl = (el("generalBraschAnthemUrl")?.value || "").trim();
      cfg.generalBrasch.anthemVolume = anthemVol;
      cfg.generalBrasch.portraitUrl = (el("generalBraschPortraitUrl")?.value || "").trim();
      const gbN = el("generalBraschEveryN");
      const gbDur = el("generalBraschDurationMs");
      const gbVol = el("generalBraschAnthemVolume");
      if (gbN) gbN.value = String(n);
      if (gbDur) gbDur.value = String(dur);
      if (gbVol) gbVol.value = String(anthemVol);
      if (typeof ClassicStratagemHero !== "undefined" && ClassicStratagemHero.setBraschAnthemVolume01) {
        ClassicStratagemHero.setBraschAnthemVolume01(anthemVol);
      }
      saveConfig(cfg);
    }
    ["generalBraschEnabled", "generalBraschEveryN", "generalBraschDurationMs", "generalBraschAnthemVolume"].forEach((id) => {
      const node = el(id);
      if (!node) return;
      node.addEventListener("change", persistGeneralBraschFromForm);
    });
    const gbUrlInp = el("generalBraschAnthemUrl");
    if (gbUrlInp) {
      gbUrlInp.addEventListener("change", persistGeneralBraschFromForm);
    }
    const gbPortraitInp = el("generalBraschPortraitUrl");
    if (gbPortraitInp) {
      gbPortraitInp.addEventListener("change", persistGeneralBraschFromForm);
    }

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
      const showQrEl = el(`${prefix}ShowQr`);
      if (showQrEl) {
        showQrEl.addEventListener("change", () => {
          base().showQr = showQrEl.checked;
          saveConfig(cfg);
        });
      }
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

    wireSettingsResetChrome();
  }

  function initDirButtons() {
    document.querySelectorAll(".dir-btn[data-dir]").forEach((btn) => {
      const d = btn.getAttribute("data-dir");
      if (!d) return;
      btn.textContent = "";
      btn.appendChild(makeChevronChip(d, "hd-arrow-chip--tiny"));
    });
  }

  function ensureDefaultKioskFromConfig() {
    if (cfg.defaultKiosk === false) return;
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("kiosk")) {
        u.searchParams.set("kiosk", "1");
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch {
      /* ignore */
    }
  }

  function init() {
    setSaveNotifier(notifySettingsSavedUi);
    initClassicStratagemHero();
    ensureDefaultKioskFromConfig();
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
