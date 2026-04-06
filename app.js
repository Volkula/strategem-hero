/* global HD2_STRATAGEMS, SH2_I18N, HD2_ASSETS */
(function () {
  const STORAGE_KEY = "stratagem-hero-config-v5";
  const LEGACY_STORAGE_KEYS = ["stratagem-hero-config-v4", "stratagem-hero-config-v3"];
  const DEFAULT_LEVELS = 10;
  const ARROWS = { up: "↑", down: "↓", left: "←", right: "→" };
  const CHEVRON_D = "M24 4 L44 46 H32 L24 26 L16 46 H4 Z";
  const CHEVRON_ROT = { up: 0, right: 90, down: 180, left: 270 };

  /** Progressive defaults: shorter time, higher rewards and harsher penalties on later levels. */
  function generatedLevelRow(i) {
    const n = DEFAULT_LEVELS;
    const t = n <= 1 ? 0 : (i - 1) / (n - 1);
    const timeMs = Math.round(Math.max(3200, 14600 - t * (14600 - 3400)));
    const successPoints = Math.max(1, Math.round(1 + t * 7));
    const failPenaltyPoints = Math.min(6, Math.floor(0.25 + t * 5.25));
    const wrongTimeDebtMs = Math.round(t * t * 1000);
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
        maxErrors: 0,
        countTimeoutAsError: true,
        countWrongAsError: true,
      },
      endScreen: {
        title: "",
        message: "",
        linkUrl: "",
        linkText: "",
        imageDataUrl: "",
      },
    };
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
        failPenaltyPoints: pickNum(row, "failPenaltyPoints", 0, 0),
        wrongTimeDebtMs: pickNum(row, "wrongTimeDebtMs", 0, 0),
      };
    });
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
      if (!raw) return defaultConfig();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.levels)) {
        parsed.levels = normalizeLevels(parsed.levels);
      }
      const merged = deepMerge(defaultConfig(), parsed);
      merged.version = 5;
      if (legacyKey) saveConfig(merged);
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

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
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
    const baseMute = youtubeMuted ? "1" : "0";
    if (listId && !videoId) {
      const q = new URLSearchParams({
        list: listId,
        autoplay: "1",
        mute: baseMute,
        controls: "0",
        rel: "0",
        playsinline: "1",
      });
      return `https://www.youtube-nocookie.com/embed/videoseries?${q.toString()}`;
    }
    const params = new URLSearchParams({
      autoplay: "1",
      mute: baseMute,
      controls: "0",
      rel: "0",
      playsinline: "1",
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
  let bindTarget = null;
  let editorSeq = [];
  let touchStart = null;

  const el = (id) => document.getElementById(id);

  function t(key) {
    return SH2_I18N.t(cfg.locale, key);
  }

  function applyI18nDom() {
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const k = node.getAttribute("data-i18n");
      if (k) node.textContent = t(k);
    });
    const sel = el("localeSelect");
    if (sel) sel.value = cfg.locale;
  }

  function showPanel(name) {
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    const map = { play: "panelPlay", settings: "panelSettings", editor: "panelEditor" };
    const id = map[name] || "panelPlay";
    const panel = el(id);
    if (panel) panel.classList.add("active");
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
        iframe.loading = "lazy";
        iframe.allow = "autoplay; encrypted-media; picture-in-picture";
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
    const deg = CHEVRON_ROT[dir] ?? 0;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "hd-chevron-svg");
    svg.setAttribute("viewBox", "0 0 48 52");
    svg.setAttribute("aria-hidden", "true");
    svg.style.transform = `rotate(${deg}deg)`;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", CHEVRON_D);
    path.setAttribute("class", "hd-chevron-path");
    svg.appendChild(path);
    wrap.appendChild(svg);
    return wrap;
  }

  function applyPlayfieldForStratagem(strat) {
    const pf = document.querySelector(".playfield");
    if (!pf) return;
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
    if (!timerEl || !fill) return;
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

  function updateErrorsHud() {
    const node = el("hudErrors");
    if (!node) return;
    const gr = gameRules();
    const maxE = Math.max(0, Number(gr.maxErrors) || 0);
    if (!run || !run.active || maxE <= 0) {
      node.textContent = "";
      node.hidden = true;
      return;
    }
    node.hidden = false;
    const err = run.errors || 0;
    node.textContent = `${t("errors")} ${err}/${maxE}`;
  }

  function renderArrowPreview(strat, progressIndex, wrong) {
    const box = el("arrowPreview");
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
    el("playHint").textContent = strat.unverified && !cfg.stratagemOverrides[strat.id]?.verified ? `⚠ ${t("unverified")}` : "";
    updatePlayfieldTouchCapture();
    updateTimerHud();
  }

  function endRun(msg) {
    if (run) run.active = false;
    touchStart = null;
    setPlayfieldTouchMode(false);
    el("playHint").textContent = msg || t("runOver");
    el("stratAudio").pause();
    updateTimerHud();
    updateErrorsHud();
  }

  function showGameOverModal() {
    const modal = el("gameOverModal");
    if (!modal) return;
    const es = cfg.endScreen || defaultConfig().endScreen;
    const title = (es.title || "").trim() || t("gameOverTitle");
    const scoreLine = t("gameOverScoreLine").replace("{score}", String(run ? run.score : 0));
    const msgBody = (es.message || "").trim() || scoreLine;
    el("gameOverTitleText").textContent = title;
    el("gameOverMessageText").textContent = msgBody;
    const img = el("gameOverImage");
    const data = (es.imageDataUrl || "").trim();
    if (img) {
      if (data) {
        img.src = data;
        img.hidden = false;
        img.alt = "";
      } else {
        img.removeAttribute("src");
        img.hidden = true;
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
    modal.hidden = false;
  }

  function hideGameOverModal() {
    const modal = el("gameOverModal");
    if (modal) modal.hidden = true;
  }

  function gameOverFromErrors() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    if (run) run.active = false;
    touchStart = null;
    setPlayfieldTouchMode(false);
    el("stratAudio").pause();
    el("playHint").textContent = t("defeatMaxErrors");
    updateTimerHud();
    updateErrorsHud();
    showGameOverModal();
    setStratagemIcon(null);
    applyGlobalBackgrounds();
  }

  function registerFailError(reason) {
    const gr = gameRules();
    const maxE = Math.max(0, Number(gr.maxErrors) || 0);
    if (maxE <= 0 || !run) return false;
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
    if (!run) return;
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
    updateTimerHud();
    startNewChallenge();
  }

  function onFail(reason) {
    if (!run || !run.active) return;
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
        const slice = timeForStratagem(strat);
        run.current.deadline = Date.now() + slice;
        run.current.totalMs = slice;
        renderArrowPreview(strat, next, false);
        updateTimerHud();
      }
    } else {
      renderArrowPreview(strat, index, true);
      onFail("wrong");
    }
  }

  function updatePlayfieldTouchCapture() {
    const on =
      cfg.enableSwipes !== false &&
      run &&
      run.active &&
      run.current &&
      !run.current.empty &&
      run.current.strat &&
      run.current.strat.code &&
      run.current.strat.code.length > 0;
    setPlayfieldTouchMode(on);
  }

  function onPlayfieldTouchStart(e) {
    if (cfg.enableSwipes === false || bindTarget) return;
    if (!run || !run.active || !run.current || run.current.empty) return;
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY, id: t.identifier, time: Date.now() };
  }

  function onPlayfieldTouchMove(e) {
    if (!touchStart || cfg.enableSwipes === false || !run || !run.active || !run.current || run.current.empty) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchStart.id) {
        e.preventDefault();
        return;
      }
    }
  }

  function onPlayfieldTouchEnd(e) {
    if (!touchStart) return;
    if (cfg.enableSwipes === false || !run || !run.active || !run.current || run.current.empty) {
      touchStart = null;
      return;
    }
    let t = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchStart.id) {
        t = e.changedTouches[i];
        break;
      }
    }
    if (!t) return;
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
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
    processDirectionInput(pressed);
  }

  let tickHandle = null;
  function tick() {
    if (!run || !run.active || !run.current) {
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
      el("playHint").textContent = t("noCodeWarning");
      setPlayfieldTouchMode(false);
      return;
    }
    hideGameOverModal();
    run = { active: true, score: 0, combo: 0, level: 1, current: null, errors: 0, penaltyDebtMs: 0 };
    el("hudScore").textContent = "0";
    el("hudCombo").textContent = "×0";
    el("hudLevel").textContent = `${t("level")} 1`;
    updateErrorsHud();
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(tick, 120);
    startNewChallenge();
  }

  function endRunClick() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    hideGameOverModal();
    endRun();
    setStratagemIcon(null);
    applyGlobalBackgrounds();
  }

  function renderBindings() {
    const grid = el("bindGrid");
    grid.innerHTML = "";
    ["up", "down", "left", "right"].forEach((dir) => {
      const cell = document.createElement("div");
      cell.className = "bind-cell";
      const strong = document.createElement("strong");
      strong.textContent = ARROWS[dir];
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
    const es = cfg.endScreen || defaultConfig().endScreen;
    el("endScreenTitleField").value = es.title || "";
    el("endScreenMessageField").value = es.message || "";
    el("endScreenLinkUrl").value = es.linkUrl || "";
    el("endScreenLinkText").value = es.linkText || "";

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
    renderBindings();
    renderLevelRows();
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
        el("stratagemName").textContent = stratName(s);
        el("stratagemCategory").textContent = stratCategoryLabel(s.category);
        setStratagemIcon(s);
      }
    });

    el("btnPlay").addEventListener("click", () => {
      showPanel("play");
      if (!run || !run.active) applyGlobalBackgrounds();
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

    el("btnStartRun").addEventListener("click", startRunClick);
    el("btnEndRun").addEventListener("click", endRunClick);

    el("gameOverClose").addEventListener("click", () => {
      hideGameOverModal();
    });
    const goBd = el("gameOverBackdrop");
    if (goBd) goBd.addEventListener("click", () => hideGameOverModal());

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
    el("endScreenTitleField").addEventListener("change", () => {
      cfg.endScreen = cfg.endScreen || { ...defaultConfig().endScreen };
      cfg.endScreen.title = el("endScreenTitleField").value;
      saveConfig(cfg);
    });
    el("endScreenMessageField").addEventListener("change", () => {
      cfg.endScreen = cfg.endScreen || { ...defaultConfig().endScreen };
      cfg.endScreen.message = el("endScreenMessageField").value;
      saveConfig(cfg);
    });
    el("endScreenLinkUrl").addEventListener("change", () => {
      cfg.endScreen = cfg.endScreen || { ...defaultConfig().endScreen };
      cfg.endScreen.linkUrl = el("endScreenLinkUrl").value.trim();
      saveConfig(cfg);
    });
    el("endScreenLinkText").addEventListener("change", () => {
      cfg.endScreen = cfg.endScreen || { ...defaultConfig().endScreen };
      cfg.endScreen.linkText = el("endScreenLinkText").value;
      saveConfig(cfg);
    });
    el("endScreenImageFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        cfg.endScreen = cfg.endScreen || { ...defaultConfig().endScreen };
        cfg.endScreen.imageDataUrl = String(r.result || "");
        saveConfig(cfg);
      };
      r.readAsDataURL(f);
    });
    el("btnClearEndScreenImage").addEventListener("click", () => {
      cfg.endScreen = cfg.endScreen || { ...defaultConfig().endScreen };
      cfg.endScreen.imageDataUrl = "";
      el("endScreenImageFile").value = "";
      saveConfig(cfg);
    });

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

    window.addEventListener("keydown", handleKeyDown);
  }

  function init() {
    wireUi();
    hideGameOverModal();
    applyI18nDom();
    syncSettingsForm();
    syncEditorStratSelect();
    applyTheme();
    applyGlobalBackgrounds();
    applyTerminalBackground();
  }

  init();
})();
