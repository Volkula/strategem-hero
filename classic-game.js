/* global Howl, Howler */
/**
 * StratagemHero.com–style round / queue / global timer gameplay (simplified port).
 * Audio: vendored MP3s under assets/audio/classic/ (Howler.js).
 */
(function (global) {
  const GAME_TICK = 10;
  const STRATAGEM_LIST_BASE_COUNT = 4;
  const TIME_ROUND_STARTING = 2000;
  const TIME_ROUND_OVER = 4000;
  const TIME_GAME_OVER = 3000;
  const TIME_BONUS = 1000;
  const TIME_WARNING = 25;
  /** Relative to site root (index.html). See RULES.md — keep in sync when paths change. */
  const SH_AUDIO_BASE = "assets/audio/classic/";

  const KEY_MAP = {
    37: "L",
    38: "U",
    39: "R",
    40: "D",
    87: "U",
    65: "L",
    83: "D",
    68: "R",
  };

  function codeFromKeyEvent(e) {
    if (!e) return null;
    const kc = e.keyCode != null ? e.keyCode : e.which;
    if (KEY_MAP[kc]) return KEY_MAP[kc];
    const c = e.code;
    if (c === "ArrowUp" || c === "KeyW") return "U";
    if (c === "ArrowDown" || c === "KeyS") return "D";
    if (c === "ArrowLeft" || c === "KeyA") return "L";
    if (c === "ArrowRight" || c === "KeyD") return "R";
    return null;
  }

  function dirToLetter(dir) {
    if (dir === "up") return "U";
    if (dir === "down") return "D";
    if (dir === "left") return "L";
    if (dir === "right") return "R";
    return "";
  }

  function letterToDir(L) {
    const x = { U: "up", D: "down", L: "left", R: "right" };
    return x[L] || "up";
  }

  let deps = null;
  let root = null;
  let els = {};
  let howls = null;
  let playAudio = true;
  /** Mirrors app cfg.directionSoundsMuted — short Howler SFX (not loop music / anthem). */
  let directionSfxMuted = false;

  let active = false;
  let screen = "start";
  let score = 0;
  let round = 0;
  let timeLeft = 10000;
  let timeTotalCap = 10000;
  let renewTimeEachRound = true;
  let freezeTimer = false;
  let failOnWrong = false;

  let timeRoundStarting = TIME_ROUND_STARTING;
  let timeRoundOver = TIME_ROUND_OVER;
  let timeGameOver = TIME_GAME_OVER;

  let sequencePerfect = true;
  let sequenceCurrent = "";
  let userInput = "";

  let queue = [];
  let sequenceRows = [];

  let readyLines = [];
  let tFn = (k) => k;
  let loopTimer = null;
  let sessionDeadline = null;
  /** Wall-clock session window length (ms), for mode-limit bar; set when sessionDeadline is set. */
  let sessionTotalMs = 0;

  /** Completed stratagems this run (classic); every N → General Brasch. */
  let completedStratagemCount = 0;
  /** `Date.now()` until which round timer is frozen and Brasch UI is active. */
  let braschModeUntil = 0;
  let braschWarnUntil = 0;
  let anthemHowl = null;
  /** Multiplier for anthem loudness against current master volume (0..1). */
  let anthemVolumeMul = 1;

  function getBraschCfg() {
    const d = {
      enabled: true,
      everyNStratagems: 50,
      durationMs: 10000,
      warnLeadMs: 0,
      anthemUrl: "",
      anthemVolume: 1,
      portraitUrl: "",
    };
    if (!deps || typeof deps.getGeneralBraschConfig !== "function") return d;
    const c = deps.getGeneralBraschConfig() || {};
    return {
      enabled: c.enabled !== false,
      everyNStratagems: Math.max(1, Math.floor(Number(c.everyNStratagems)) || 50),
      durationMs: Math.max(1000, Math.floor(Number(c.durationMs)) || 10000),
      warnLeadMs: Math.max(0, Math.floor(Number(c.warnLeadMs) || 0)),
      anthemUrl: String(c.anthemUrl || "").trim(),
      portraitUrl: String(c.portraitUrl || "").trim(),
      anthemVolume: Math.max(0, Math.min(1, Number.isFinite(Number(c.anthemVolume)) ? Number(c.anthemVolume) : 1)),
    };
  }

  function anthemStillPlaying() {
    return !!(anthemHowl && typeof anthemHowl.playing === "function" && anthemHowl.playing());
  }

  /** UI/timer freeze: minimum burst length OR until anthem finishes (no early cut). */
  function isBraschActive() {
    if (Date.now() < braschModeUntil) return true;
    return anthemStillPlaying();
  }

  function roundTimerPaused() {
    return freezeTimer || isBraschActive();
  }

  function stopAnthem() {
    if (!anthemHowl) return;
    try {
      anthemHowl.stop();
      anthemHowl.unload();
    } catch {
      /* ignore */
    }
    anthemHowl = null;
  }

  function resumeRoundMusicAfterBrasch() {
    if (screen === "in_game" && playAudio && howls && howls.game_music) {
      try {
        howls.game_music.play();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * @param {boolean} resumeGameMusic — if true, fade back to round music after anthem ends (or now if no anthem).
   * @param {boolean} forceStopAnthem — when true, stop the anthem immediately (e.g. leaving the round).
   */
  function endBraschMode(resumeGameMusic, forceStopAnthem) {
    if (root) root.classList.remove("classic-game--brasch");
    if (els.timerFill) els.timerFill.classList.remove("classic-timer__fill--brasch");
    if (els.braschPortraitWrap) els.braschPortraitWrap.hidden = true;

    if (forceStopAnthem) {
      stopAnthem();
      return;
    }

    if (!resumeGameMusic) {
      stopAnthem();
      return;
    }

    if (anthemStillPlaying()) {
      const onAnthemEnd = () => {
        try {
          anthemHowl.off("end", onAnthemEnd);
        } catch {
          /* ignore */
        }
        stopAnthem();
        resumeRoundMusicAfterBrasch();
      };
      try {
        anthemHowl.on("end", onAnthemEnd);
      } catch {
        stopAnthem();
        resumeRoundMusicAfterBrasch();
      }
      return;
    }

    stopAnthem();
    resumeRoundMusicAfterBrasch();
  }

  function clearBraschLeavingPlay() {
    braschModeUntil = 0;
    braschWarnUntil = 0;
    if (els.braschWarnBanner) {
      els.braschWarnBanner.hidden = true;
      els.braschWarnBanner.classList.remove("brasch-warning-banner--blink");
    }
    endBraschMode(false, true);
  }

  function playAnthem(url) {
    const u = (url || "").trim();
    if (!u || typeof Howl === "undefined") return;
    ensureHowls();
    stopAnthem();
    const vol = (typeof Howler !== "undefined" ? Howler.volume() : 0.82) * anthemVolumeMul;
    const src = /\s/.test(u) ? encodeURI(u) : u;
    anthemHowl = new Howl({ src: [src], html5: true, volume: vol, loop: false });
    try {
      anthemHowl.on("loaderror", () => {
        try {
          anthemHowl.unload();
        } catch {
          /* ignore */
        }
        anthemHowl = null;
      });
    } catch {
      /* ignore */
    }
    try {
      anthemHowl.play();
    } catch {
      /* ignore */
    }
  }

  function syncBraschPortrait(bc) {
    const wrap = els.braschPortraitWrap;
    const img = els.braschPortrait;
    if (!wrap || !img) return;
    const src = (bc && bc.portraitUrl) || "";
    if (!src.trim()) {
      wrap.hidden = true;
      img.removeAttribute("src");
      return;
    }
    img.src = /\s/.test(src) ? encodeURI(src.trim()) : src.trim();
    img.alt = typeof tFn === "function" ? tFn("classicBraschPortraitAlt") : "General Brasch";
    wrap.hidden = false;
  }

  function startBraschMode(bc) {
    if (!bc || !bc.enabled || !active || screen !== "in_game") return;
    anthemVolumeMul = Math.max(0, Math.min(1, Number(bc.anthemVolume)));
    braschModeUntil = Date.now() + bc.durationMs;
    if (root) root.classList.add("classic-game--brasch");
    stopMusic();
    playAnthem(bc.anthemUrl);
    syncBraschPortrait(bc);
    updateTimerLabel();
  }

  function scheduleBraschMode(bc) {
    if (!bc || !bc.enabled || !active || screen !== "in_game") return;
    const lead = Math.max(0, Math.floor(Number(bc.warnLeadMs) || 0));
    if (lead <= 0) {
      startBraschMode(bc);
      return;
    }
    braschWarnUntil = Date.now() + lead;
  }

  function updateComboHud() {
    const wrap = els.comboWrap;
    if (!wrap) return;
    const bc = getBraschCfg();
    if (!bc.enabled || !active || screen !== "in_game") {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const goal = bc.everyNStratagems;
    const n = completedStratagemCount % goal;
    if (els.comboHud) {
      els.comboHud.textContent =
        typeof tFn === "function"
          ? tFn("classicComboHud").replace("{n}", String(n)).replace("{goal}", String(goal))
          : `${n} / ${goal}`;
    }
  }

  function updateBraschWarningUi() {
    const node = els.braschWarnBanner;
    if (!node) return;
    if (!active || screen !== "in_game" || !braschWarnUntil || Date.now() >= braschWarnUntil) {
      node.hidden = true;
      node.classList.remove("brasch-warning-banner--blink");
      return;
    }
    const sec = Math.max(1, Math.ceil((braschWarnUntil - Date.now()) / 1000));
    node.hidden = false;
    node.classList.add("brasch-warning-banner--blink");
    node.textContent =
      typeof tFn === "function" ? tFn("braschWarningBannerText").replace("{seconds}", String(sec)) : `BRASCH IN ${sec}s`;
  }

  function updateSolvedCounters() {
    if (els.infoSolved) els.infoSolved.textContent = String(completedStratagemCount);
    if (els.roSolved) els.roSolved.textContent = String(completedStratagemCount);
    if (els.goSolved) els.goSolved.textContent = String(completedStratagemCount);
  }

  function formatModeTimeLeft(ms) {
    const x = Math.max(0, ms);
    if (x >= 60000) {
      const s = Math.ceil(x / 1000);
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${String(r).padStart(2, "0")}`;
    }
    return `${(x / 1000).toFixed(1)}s`;
  }

  function updateSessionTimerDisplay() {
    const panel = els.modeTimerPanel;
    if (!panel) return;
    if (sessionDeadline == null) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const remain = Math.max(0, sessionDeadline - Date.now());
    const denom = Math.max(1, sessionTotalMs);
    const pct = (remain / denom) * 100;
    if (els.modeTimerFill) {
      els.modeTimerFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      if (pct <= TIME_WARNING) els.modeTimerFill.classList.add("classic-timer__fill--warn");
      else els.modeTimerFill.classList.remove("classic-timer__fill--warn");
    }
    if (els.modeTimerText) els.modeTimerText.textContent = formatModeTimeLeft(remain);
    if (els.modeTimerBar) {
      els.modeTimerBar.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(100, pct)))));
      els.modeTimerBar.setAttribute(
        "aria-label",
        typeof tFn === "function"
          ? tFn("classicModeTimerAria").replace("{time}", formatModeTimeLeft(remain))
          : `Mode limit: ${formatModeTimeLeft(remain)} left`
      );
    }
  }

  function illuminatiRtl() {
    return !!(deps && typeof deps.getIlluminateRtlInput === "function" && deps.getIlluminateRtlInput());
  }

  function sequenceExpectedForInput() {
    if (!sequenceCurrent) return "";
    return illuminatiRtl()
      ? sequenceCurrent.split("").reverse().join("")
      : sequenceCurrent;
  }

  function processLetterInput(L) {
    if (!L || screen !== "in_game") return;
    userInput += L;
    const row = els.seqRow;
    if (!row) return;
    const expectStr = sequenceExpectedForInput();
    const rtl = illuminatiRtl();
    let bad = false;
    for (let a = 0; a < userInput.length; a++) {
      if (expectStr[a] !== userInput[a]) {
        bad = true;
        if (failOnWrong) {
          wrongSequence(true);
          stopMusic();
          onGameOver("wrong");
          return;
        }
        wrongSequence();
        break;
      }
      const cellIdx = rtl ? sequenceCurrent.length - 1 - a : a;
      const cell = row.children[cellIdx];
      if (cell) cell.classList.add("classic-arrow--correct");
    }
    if (!bad && userInput.length > 0) playSfx("button_press");
  }

  function ensureHowls() {
    if (howls || typeof Howl === "undefined") return;
    const opt = { html5: true };
    howls = {
      button_press: new Howl({ src: [`${SH_AUDIO_BASE}button_press.mp3`], ...opt }),
      button_press_error: new Howl({ src: [`${SH_AUDIO_BASE}button_press_error.mp3`], ...opt }),
      sequence_success: new Howl({ src: [`${SH_AUDIO_BASE}sequence_success.mp3`], ...opt }),
      round_start_coin: new Howl({ src: [`${SH_AUDIO_BASE}round_start_coin.mp3`], ...opt }),
      round_start: new Howl({ src: [`${SH_AUDIO_BASE}round_start_coin.mp3`], ...opt }),
      game_music: new Howl({ src: [`${SH_AUDIO_BASE}game_music.mp3`], loop: true, ...opt }),
      round_over: new Howl({ src: [`${SH_AUDIO_BASE}round_over.mp3`], ...opt }),
      game_over: new Howl({ src: [`${SH_AUDIO_BASE}game_over.mp3`], ...opt }),
    };
  }

  function setVolume01(v) {
    const x = Math.max(0, Math.min(1, Number(v) || 0));
    if (typeof Howler !== "undefined") Howler.volume(x);
    if (anthemHowl) try {
      anthemHowl.volume(x);
    } catch {
      /* ignore */
    }
    updateVolumeIcon(x);
    if (deps && typeof deps.onVolumeChange === "function") deps.onVolumeChange(x);
  }

  function updateVolumeIcon(v) {
    const node = els.volIcon;
    if (!node) return;
    node.textContent = v >= 0.5 ? "🔊" : v > 0 ? "🔉" : "🔇";
  }

  function playSfx(name) {
    if (directionSfxMuted || !playAudio || !howls || !howls[name]) return;
    try {
      howls[name].play();
    } catch {
      /* ignore */
    }
  }

  function stopMusic() {
    if (howls && howls.game_music) try {
      howls.game_music.stop();
    } catch {
      /* ignore */
    }
  }

  function wrongSequence(suppressLivesHook) {
    sequencePerfect = false;
    userInput = "";
    const row = els.seqRow;
    if (row) {
      row.querySelectorAll(".classic-arrow--correct").forEach((n) => n.classList.remove("classic-arrow--correct"));
      row.style.animation = "none";
      void row.offsetWidth;
      row.style.animation = "classic-shake 0.22s ease";
    }
    if (els.glitch) {
      els.glitch.hidden = false;
      els.glitch.classList.remove("classic-game__glitch--flash");
      void els.glitch.offsetWidth;
      els.glitch.classList.add("classic-game__glitch--flash");
      setTimeout(() => {
        if (els.glitch) {
          els.glitch.hidden = true;
          els.glitch.classList.remove("classic-game__glitch--flash");
        }
      }, 280);
    }
    setTimeout(() => {
      if (row) row.style.animation = "";
    }, 240);
    playSfx("button_press_error");
    if (!suppressLivesHook && deps && typeof deps.onClassicWrong === "function") deps.onClassicWrong();
  }

  function resetCurrentSequenceProgress() {
    userInput = "";
    const row = els.seqRow;
    if (row) {
      row.querySelectorAll(".classic-arrow--correct").forEach((n) => n.classList.remove("classic-arrow--correct"));
    }
  }

  function updateTimerLabel() {
    if (!els.timerText) return;
    if (isBraschActive()) {
      els.timerText.textContent = typeof tFn === "function" ? tFn("classicTimerBrasch") : "GENERAL BRASCH";
      if (els.timerFill) {
        els.timerFill.style.width = "100%";
        els.timerFill.classList.remove("classic-timer__fill--warn");
        els.timerFill.classList.add("classic-timer__fill--brasch");
      }
      if (els.timerBar) {
        els.timerBar.setAttribute("aria-valuenow", "100");
        els.timerBar.setAttribute(
          "aria-label",
          typeof tFn === "function" ? tFn("classicTimerAriaBrasch") : "General Brasch: round timer paused"
        );
      }
      return;
    }
    if (freezeTimer) {
      els.timerText.textContent = typeof tFn === "function" ? tFn("classicTimerFrozen") : "∞";
      if (els.timerFill) {
        els.timerFill.style.width = "100%";
        els.timerFill.classList.remove("classic-timer__fill--warn", "classic-timer__fill--brasch");
      }
      if (els.timerBar) {
        els.timerBar.setAttribute("aria-valuenow", "100");
        els.timerBar.setAttribute(
          "aria-label",
          typeof tFn === "function" ? tFn("classicTimerAriaFrozen") : "Timer paused"
        );
      }
      return;
    }
    const s = Math.max(0, timeLeft) / 1000;
    els.timerText.textContent = `${s.toFixed(1)}s`;
    if (els.timerFill) els.timerFill.classList.remove("classic-timer__fill--brasch");
    if (els.timerBar) {
      els.timerBar.setAttribute(
        "aria-label",
        typeof tFn === "function"
          ? tFn("classicTimerAriaPressure").replace("{seconds}", s.toFixed(1))
          : `Time left ${s.toFixed(1)} seconds`
      );
    }
  }

  function buildQueue() {
    queue = [];
    sequenceRows = [];
    const pool = deps.getPool();
    if (!pool.length) return;
    const count = STRATAGEM_LIST_BASE_COUNT + round;
    const categories = {};
    pool.forEach((s) => {
      const cat = s.category || "misc";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(s);
    });
    const catKeys = Object.keys(categories);
    for (let i = 0; i < count; i++) {
      let strat = null;
      if (catKeys.length) {
        const ck = catKeys[Math.floor(Math.random() * catKeys.length)];
        const arr = categories[ck];
        strat = arr[Math.floor(Math.random() * arr.length)];
      }
      if (!strat) strat = pool[Math.floor(Math.random() * pool.length)];
      const letters = (strat.code || []).map(dirToLetter).join("");
      if (!letters) continue;
      queue.push({ strat, letters });
    }
    renderQueueDom();
    updateActiveStratagem();
  }

  function renderQueueDom() {
    if (!els.stratList) return;
    els.stratList.innerHTML = "";
    const arrowBase = deps.arrowUrls;
    queue.forEach((item, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "classic-strat-item" + (idx === 0 ? " classic-strat-item--active" : "");
      const img = document.createElement("img");
      img.className = "classic-strat-item__icon";
      img.alt = "";
      img.src = deps.stratIconUrl(item.strat);
      img.onerror = () => {
        img.src = deps.fallbackIcon;
      };
      wrap.appendChild(img);
      els.stratList.appendChild(wrap);
    });

    if (!els.seqHost) return;
    els.seqHost.innerHTML = "";
    queue.forEach((item) => {
      const row = document.createElement("div");
      row.className = "classic-seq-row";
      for (let i = 0; i < item.letters.length; i++) {
        const L = item.letters[i];
        const d = letterToDir(L);
        const ar = document.createElement("div");
        ar.className = "classic-arrow";
        ar.dataset.letter = L;
        const im = document.createElement("img");
        im.src = arrowBase[d] || arrowBase.up;
        im.alt = "";
        ar.appendChild(im);
        row.appendChild(ar);
      }
      els.seqHost.appendChild(row);
    });
    sequenceRows = els.seqHost.querySelectorAll(".classic-seq-row");
    els.seqRow = sequenceRows[0] || null;
  }

  function updateActiveStratagem() {
    sequenceCurrent = "";
    userInput = "";
    if (!queue.length) return;
    const first = queue[0];
    sequenceCurrent = first.letters;
    if (els.activeName) els.activeName.textContent = deps.stratName(first.strat);
    els.stratList.querySelectorAll(".classic-strat-item").forEach((n, i) => {
      n.classList.toggle("classic-strat-item--active", i === 0);
    });
    sequenceRows.forEach((r, i) => {
      r.style.display = i === 0 ? "flex" : "none";
    });
    els.seqRow = sequenceRows[0] || null;
    if (screen === "in_game" && deps && typeof deps.onClassicActiveStratagemChanged === "function") {
      deps.onClassicActiveStratagemChanged();
    }
  }

  function removeActiveStratagem() {
    queue.shift();
    if (els.stratList.firstElementChild) els.stratList.removeChild(els.stratList.firstElementChild);
    if (els.seqHost.firstElementChild) els.seqHost.removeChild(els.seqHost.firstElementChild);
    sequenceRows = els.seqHost.querySelectorAll(".classic-seq-row");
    updateActiveStratagem();
  }

  function clearQueueUi() {
    queue = [];
    if (els.stratList) els.stratList.innerHTML = "";
    if (els.seqHost) els.seqHost.innerHTML = "";
    sequenceRows = [];
    els.seqRow = null;
  }

  function showScreen(name) {
    screen = name;
    const map = {
      start: els.screenStart,
      round_starting: els.screenRoundStarting,
      in_game: els.screenGame,
      round_over: els.screenRoundOver,
      game_over: els.screenGameOver,
    };
    Object.values(map).forEach((n) => {
      if (n) n.hidden = true;
    });
    if (map[name]) map[name].hidden = false;
    if (name !== "in_game") clearBraschLeavingPlay();
    if (name === "in_game") updateComboHud();
    if (deps && typeof deps.onScreenChange === "function") deps.onScreenChange(name);
  }

  function onRoundStarting() {
    round += 1;
    if (els.roundCount) els.roundCount.textContent = String(round);
    if (els.infoRound) els.infoRound.textContent = String(round);
    if (els.infoScore) els.infoScore.textContent = String(score);
    updateSolvedCounters();
    if (readyLines.length && Math.floor(10 * Math.random()) + 1 > 6) {
      const ri = Math.floor(Math.random() * readyLines.length);
      if (els.readyText) els.readyText.textContent = readyLines[ri];
    } else if (els.readyText) els.readyText.textContent = "";

    if (renewTimeEachRound) timeLeft = timeTotalCap;

    if (els.timerFill) els.timerFill.classList.remove("classic-timer__fill--warn");

    sequencePerfect = true;
    sequenceCurrent = "";
    userInput = "";
    buildQueue();
    if (!queue.length) {
      showScreen("start");
      active = false;
      deps.onStop && deps.onStop();
      return;
    }

    timeRoundStarting = TIME_ROUND_STARTING;
    showScreen("round_starting");
    playSfx(round === 1 ? "round_start_coin" : "round_start");
  }

  function onRoundOver() {
    const roundBonus = 75 + 25 * (round - 1);
    const timeBonus = Math.floor((timeLeft / timeTotalCap) * 100);
    let perfectBonus = 0;
    if (sequencePerfect) perfectBonus = 100;
    score += roundBonus + timeBonus + perfectBonus;
    if (els.roRoundBonus) els.roRoundBonus.textContent = String(roundBonus);
    if (els.roTimeBonus) els.roTimeBonus.textContent = String(timeBonus);
    if (els.roPerfectBonus) els.roPerfectBonus.textContent = String(perfectBonus);
    if (els.roTotal) els.roTotal.textContent = String(score);
    if (els.infoScore) els.infoScore.textContent = String(score);
    updateSolvedCounters();

    const hide = (nodes) => nodes.forEach((n) => n && n.classList.add("classic-ro--hidden"));
    hide([els.roTimeLbl, els.roTimeBonus, els.roPerfLbl, els.roPerfectBonus, els.roTotLbl, els.roTotal, els.roSolvedWrap]);
    timeRoundOver = TIME_ROUND_OVER;
    showScreen("round_over");
    playSfx("round_over");
    stopMusic();
  }

  function onGameOver(reason) {
    const why = reason || "time";
    timeGameOver = TIME_GAME_OVER;
    if (els.goScore) els.goScore.textContent = String(score);
    updateSolvedCounters();
    if (els.goRestart) els.goRestart.hidden = true;
    if (els.btnRestart) els.btnRestart.hidden = true;
    showScreen("game_over");
    stopMusic();
    playSfx("game_over");
    deps.onGameOver && deps.onGameOver(score, why, completedStratagemCount);
  }

  function loopRoundStarting() {
    timeRoundStarting -= GAME_TICK;
    if (timeRoundStarting <= 0) {
      showScreen("in_game");
      try {
        if (howls && howls.game_music) howls.game_music.play();
      } catch {
        /* ignore */
      }
    }
  }

  function loopRoundOver() {
    timeRoundOver -= GAME_TICK;
    const show = (nodes) => nodes.forEach((n) => n && n.classList.remove("classic-ro--hidden"));
    if (timeRoundOver < TIME_ROUND_OVER - 800) show([els.roTimeLbl, els.roTimeBonus]);
    if (timeRoundOver < TIME_ROUND_OVER - 1600) show([els.roPerfLbl, els.roPerfectBonus]);
    if (timeRoundOver < TIME_ROUND_OVER - 2800) show([els.roTotLbl, els.roTotal, els.roSolvedWrap]);
    if (timeRoundOver <= 0) {
      onRoundStarting();
    }
  }

  function loopGameOver() {
    timeGameOver -= GAME_TICK;
    if (timeGameOver <= 0) {
      if (els.goRestart) els.goRestart.hidden = false;
      if (els.btnRestart) els.btnRestart.hidden = false;
    }
  }

  function loopInGame() {
    updateBraschWarningUi();
    if (braschWarnUntil && Date.now() >= braschWarnUntil) {
      braschWarnUntil = 0;
      const bc2 = getBraschCfg();
      startBraschMode(bc2);
    }
    if (!isBraschActive() && root && root.classList.contains("classic-game--brasch")) {
      endBraschMode(true, false);
    }

    if (sessionDeadline != null && Date.now() >= sessionDeadline) {
      clearBraschLeavingPlay();
      stopMusic();
      onGameOver("session");
      return;
    }
    const rtPaused = roundTimerPaused();
    if (!rtPaused && timeLeft > 0) timeLeft -= GAME_TICK;
    const pct = rtPaused
      ? 100
      : timeTotalCap > 0
        ? (timeLeft / timeTotalCap) * 100
        : 100;
    if (els.timerFill) {
      els.timerFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      if (isBraschActive()) {
        els.timerFill.classList.add("classic-timer__fill--brasch");
        els.timerFill.classList.remove("classic-timer__fill--warn");
      } else if (!freezeTimer && pct <= TIME_WARNING) els.timerFill.classList.add("classic-timer__fill--warn");
      else els.timerFill.classList.remove("classic-timer__fill--warn");
    }
    updateTimerLabel();
    if (els.timerBar) {
      els.timerBar.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(100, pct)))));
    }

    if (timeLeft <= 0 && !rtPaused) {
      if (deps && typeof deps.onRoundTimerZero === "function" && deps.onRoundTimerZero()) {
        updateTimerLabel();
        return;
      }
      clearBraschLeavingPlay();
      stopMusic();
      onGameOver("time");
      return;
    }

    if (userInput === sequenceExpectedForInput() && sequenceCurrent.length > 0) {
      if (deps && typeof deps.onClassicStratCompleted === "function") deps.onClassicStratCompleted();
      score += 5 * sequenceCurrent.length;
      if (els.infoScore) els.infoScore.textContent = String(score);
      timeLeft = Math.min(timeTotalCap, timeLeft + TIME_BONUS);
      playSfx("sequence_success");
      removeActiveStratagem();
      completedStratagemCount += 1;
      updateComboHud();
      updateSolvedCounters();
      const roundJustEnded = queue.length === 0;
      const bc = getBraschCfg();
      if (
        !roundJustEnded &&
        bc.enabled &&
        completedStratagemCount > 0 &&
        completedStratagemCount % bc.everyNStratagems === 0
      ) {
        scheduleBraschMode(bc);
      }
      if (roundJustEnded && isBraschActive()) {
        buildQueue();
        resetCurrentSequenceProgress();
        return;
      }
      if (roundJustEnded) {
        stopMusic();
        onRoundOver();
      }
    }
  }

  function gameLoop() {
    loopTimer = null;
    if (!active) return;
    switch (screen) {
      case "round_starting":
        loopRoundStarting();
        break;
      case "in_game":
        loopInGame();
        break;
      case "round_over":
        loopRoundOver();
        break;
      case "game_over":
        loopGameOver();
        break;
      default:
        break;
    }
    loopTimer = setTimeout(gameLoop, GAME_TICK);
    if (active && sessionDeadline != null) updateSessionTimerDisplay();
    if (active && deps && typeof deps.onAfterTick === "function") deps.onAfterTick(screen);
  }

  function ensureLoop() {
    if (active && loopTimer == null) loopTimer = setTimeout(gameLoop, GAME_TICK);
  }

  function onKeyDown(e) {
    if (!active) return false;
    const ae = document.activeElement;
    const tag = ae && ae.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || ae?.isContentEditable) return false;
    const ch = codeFromKeyEvent(e);
    if (screen === "start" && (ch || e.code === "Space" || e.keyCode === 32)) {
      e.preventDefault();
      startInternal();
      return true;
    }
    if (screen === "game_over" && timeGameOver <= 0 && (ch || e.code === "Space" || e.keyCode === 32)) {
      e.preventDefault();
      startInternal();
      return true;
    }
    if (screen === "in_game" && ch) {
      e.preventDefault();
      processLetterInput(ch);
      return true;
    }
    if (active && screen === "in_game" && (e.code === "Space" || e.keyCode === 32)) e.preventDefault();
    return false;
  }

  function startInternal() {
    if (deps && typeof deps.onStart === "function") deps.onStart();
    completedStratagemCount = 0;
    clearBraschLeavingPlay();
    score = 0;
    round = 0;
    timeLeft = timeTotalCap;
    sequencePerfect = true;
    clearQueueUi();
    if (els.infoScore) els.infoScore.textContent = "0";
    updateSolvedCounters();
    if (els.goRestart) els.goRestart.hidden = true;
    if (els.btnRestart) els.btnRestart.hidden = true;
    onRoundStarting();
  }

  const api = {
    init(options) {
      deps = options;
      root = options.root;
      readyLines = options.readyLines || [];
      tFn = options.t || ((k) => k);
      els = {
        volSlider: root.querySelector("#classicVolSlider"),
        volIcon: root.querySelector("#classicVolIcon"),
        screenStart: root.querySelector("#classicScreenStart"),
        screenRoundStarting: root.querySelector("#classicScreenRoundStarting"),
        screenGame: root.querySelector("#classicScreenGame"),
        screenRoundOver: root.querySelector("#classicScreenRoundOver"),
        screenGameOver: root.querySelector("#classicScreenGameOver"),
        roundCount: root.querySelector("#classicRoundCount"),
        readyText: root.querySelector("#classicReadyText"),
        stratList: root.querySelector("#classicStratList"),
        activeName: root.querySelector("#classicActiveName"),
        seqHost: root.querySelector("#classicSeqHost"),
        timerFill: root.querySelector("#classicTimerFill"),
        timerText: root.querySelector("#classicTimerText"),
        timerBar: root.querySelector("#classicTimerBar"),
        modeTimerPanel: root.querySelector("#classicModeTimerPanel"),
        modeTimerFill: root.querySelector("#classicModeTimerFill"),
        modeTimerText: root.querySelector("#classicModeTimerText"),
        modeTimerBar: root.querySelector("#classicModeTimerBar"),
        infoRound: root.querySelector("#classicInfoRound"),
        infoScore: root.querySelector("#classicInfoScore"),
        infoSolved: root.querySelector("#classicInfoSolved"),
        roRoundBonus: root.querySelector("#classicRoRoundBonus"),
        roTimeLbl: root.querySelector("#classicRoTimeLbl"),
        roTimeBonus: root.querySelector("#classicRoTimeBonus"),
        roPerfLbl: root.querySelector("#classicRoPerfLbl"),
        roPerfectBonus: root.querySelector("#classicRoPerfectBonus"),
        roTotLbl: root.querySelector("#classicRoTotLbl"),
        roTotal: root.querySelector("#classicRoTotal"),
        roSolvedWrap: root.querySelector("#classicRoSolvedWrap"),
        roSolved: root.querySelector("#classicRoSolved"),
        goScore: root.querySelector("#classicGoScore"),
        goSolved: root.querySelector("#classicGoSolved"),
        goRestart: root.querySelector("#classicGoRestart"),
        btnStart: root.querySelector("#classicBtnStart"),
        btnRestart: root.querySelector("#classicBtnRestart"),
        glitch: root.querySelector("#classicGlitch"),
        touchPad: root.querySelector("#classicTouchPad"),
        comboWrap: root.querySelector("#classicComboWrap"),
        comboHud: root.querySelector("#classicComboHud"),
        braschPortraitWrap: root.querySelector("#classicBraschPortraitWrap"),
        braschPortrait: root.querySelector("#classicBraschPortrait"),
        braschWarnBanner: root.querySelector("#classicBraschWarnBanner"),
      };
      ensureHowls();
      const v0 = typeof options.initialVolume === "number" ? options.initialVolume : 0.82;
      if (els.volSlider) {
        els.volSlider.value = String(Math.round(v0 * 100));
        els.volSlider.addEventListener("input", () => {
          setVolume01(Number(els.volSlider.value) / 100);
        });
      }
      setVolume01(v0);

      if (els.touchPad) {
        els.touchPad.querySelectorAll("[data-dir]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const d = btn.getAttribute("data-dir");
            const L = dirToLetter(d);
            if (!L) return;
            processLetterInput(L);
          });
        });
      }

      function tryStartFromTouchUi() {
        if (!active) return;
        if (screen === "start") {
          startInternal();
          return;
        }
        if (screen === "game_over" && timeGameOver <= 0) startInternal();
      }
      if (els.btnStart) els.btnStart.addEventListener("click", tryStartFromTouchUi);
      if (els.btnRestart) els.btnRestart.addEventListener("click", tryStartFromTouchUi);
    },

    applyTouchLetter(L) {
      if (!active || screen !== "in_game" || !L) return;
      processLetterInput(L);
    },

    beginFromButton() {
      if (!active) return;
      if (screen === "start" || (screen === "game_over" && timeGameOver <= 0)) startInternal();
    },

    start(opts) {
      ensureHowls();
      timeTotalCap = Math.max(1000, Number(opts.timeTotal) || 10000);
      renewTimeEachRound = opts.renewTimeEachRound !== false;
      freezeTimer = !!opts.freezeTimer;
      failOnWrong = !!opts.failOnWrong;
      playAudio = opts.playAudio !== false;
      sessionDeadline = opts.sessionDeadline != null ? Number(opts.sessionDeadline) : null;
      sessionTotalMs =
        sessionDeadline != null ? Math.max(1, Math.round(sessionDeadline - Date.now())) : 0;
      active = true;
      root.hidden = false;
      showScreen("start");
      if (els.goRestart) els.goRestart.hidden = true;
      if (els.btnRestart) els.btnRestart.hidden = true;
      updateSolvedCounters();
      ensureLoop();
    },

    stop() {
      active = false;
      if (loopTimer) clearTimeout(loopTimer);
      loopTimer = null;
      clearBraschLeavingPlay();
      stopMusic();
      root.hidden = true;
      deps.onStop && deps.onStop();
    },

    isActive() {
      return active;
    },

    getScreen() {
      return screen;
    },

    onKeyDown(e) {
      return onKeyDown(e);
    },

    setVolume01: setVolume01,
    setBraschAnthemVolume01(v) {
      anthemVolumeMul = Math.max(0, Math.min(1, Number(v)));
      if (anthemHowl) {
        const master = typeof Howler !== "undefined" ? Howler.volume() : 0.82;
        try {
          anthemHowl.volume(master * anthemVolumeMul);
        } catch {
          /* ignore */
        }
      }
    },
    setDirectionSfxMuted(muted) {
      directionSfxMuted = !!muted;
    },
    triggerBraschNow() {
      if (!active || screen !== "in_game") return;
      const bc = getBraschCfg();
      if (!bc || !bc.enabled) return;
      scheduleBraschMode(bc);
      updateBraschWarningUi();
    },
    getVolume01() {
      return typeof Howler !== "undefined" ? Howler.volume() : 0.82;
    },

    getScore() {
      return score;
    },

    getSessionDeadline() {
      return sessionDeadline;
    },
    getCompletedStratagemCount() {
      return completedStratagemCount;
    },

    refillRoundTimerAfterLifeLost() {
      if (!active || screen !== "in_game") return;
      timeLeft = timeTotalCap;
      sequencePerfect = false;
      resetCurrentSequenceProgress();
      updateTimerLabel();
    },
  };

  global.ClassicStratagemHero = api;
})(typeof window !== "undefined" ? window : this);
