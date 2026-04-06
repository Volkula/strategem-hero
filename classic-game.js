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

  function processLetterInput(L) {
    if (!L || screen !== "in_game") return;
    userInput += L;
    const row = els.seqRow;
    if (!row) return;
    let bad = false;
    for (let a = 0; a < userInput.length; a++) {
      if (sequenceCurrent[a] !== userInput[a]) {
        bad = true;
        if (failOnWrong) {
          wrongSequence();
          stopMusic();
          onGameOver("wrong");
          return;
        }
        wrongSequence();
        break;
      }
      const cell = row.children[a];
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
    updateVolumeIcon(x);
    if (deps && typeof deps.onVolumeChange === "function") deps.onVolumeChange(x);
  }

  function updateVolumeIcon(v) {
    const node = els.volIcon;
    if (!node) return;
    node.textContent = v >= 0.5 ? "🔊" : v > 0 ? "🔉" : "🔇";
  }

  function playSfx(name) {
    if (!playAudio || !howls || !howls[name]) return;
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

  function wrongSequence() {
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
    if (deps && typeof deps.onScreenChange === "function") deps.onScreenChange(name);
  }

  function onRoundStarting() {
    round += 1;
    if (els.roundCount) els.roundCount.textContent = String(round);
    if (els.infoRound) els.infoRound.textContent = String(round);
    if (els.infoScore) els.infoScore.textContent = String(score);
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

    const hide = (nodes) => nodes.forEach((n) => n && n.classList.add("classic-ro--hidden"));
    hide([els.roTimeLbl, els.roTimeBonus, els.roPerfLbl, els.roPerfectBonus, els.roTotLbl, els.roTotal]);
    timeRoundOver = TIME_ROUND_OVER;
    showScreen("round_over");
    playSfx("round_over");
    stopMusic();
  }

  function onGameOver(reason) {
    const why = reason || "time";
    timeGameOver = TIME_GAME_OVER;
    if (els.goScore) els.goScore.textContent = String(score);
    if (els.goRestart) els.goRestart.hidden = true;
    showScreen("game_over");
    stopMusic();
    playSfx("game_over");
    deps.onGameOver && deps.onGameOver(score, why);
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
    if (timeRoundOver < TIME_ROUND_OVER - 2800) show([els.roTotLbl, els.roTotal]);
    if (timeRoundOver <= 0) {
      onRoundStarting();
    }
  }

  function loopGameOver() {
    timeGameOver -= GAME_TICK;
    if (timeGameOver <= 0) {
      if (els.goRestart) els.goRestart.hidden = false;
    }
  }

  function loopInGame() {
    if (sessionDeadline != null && Date.now() >= sessionDeadline) {
      stopMusic();
      onGameOver("session");
      return;
    }
    if (!freezeTimer && timeLeft > 0) timeLeft -= GAME_TICK;
    const pct = timeTotalCap > 0 ? (timeLeft / timeTotalCap) * 100 : 100;
    if (els.timerFill) {
      els.timerFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      if (pct <= TIME_WARNING) els.timerFill.classList.add("classic-timer__fill--warn");
      else els.timerFill.classList.remove("classic-timer__fill--warn");
    }

    if (timeLeft <= 0) {
      stopMusic();
      onGameOver("time");
      return;
    }

    if (userInput === sequenceCurrent && sequenceCurrent.length > 0) {
      score += 5 * sequenceCurrent.length;
      if (els.infoScore) els.infoScore.textContent = String(score);
      timeLeft = Math.min(timeTotalCap, timeLeft + TIME_BONUS);
      playSfx("sequence_success");
      removeActiveStratagem();
      if (queue.length === 0) {
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
    score = 0;
    round = 0;
    timeLeft = timeTotalCap;
    sequencePerfect = true;
    clearQueueUi();
    if (els.infoScore) els.infoScore.textContent = "0";
    if (els.goRestart) els.goRestart.hidden = true;
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
        infoRound: root.querySelector("#classicInfoRound"),
        infoScore: root.querySelector("#classicInfoScore"),
        roRoundBonus: root.querySelector("#classicRoRoundBonus"),
        roTimeLbl: root.querySelector("#classicRoTimeLbl"),
        roTimeBonus: root.querySelector("#classicRoTimeBonus"),
        roPerfLbl: root.querySelector("#classicRoPerfLbl"),
        roPerfectBonus: root.querySelector("#classicRoPerfectBonus"),
        roTotLbl: root.querySelector("#classicRoTotLbl"),
        roTotal: root.querySelector("#classicRoTotal"),
        goScore: root.querySelector("#classicGoScore"),
        goRestart: root.querySelector("#classicGoRestart"),
        glitch: root.querySelector("#classicGlitch"),
        touchPad: root.querySelector("#classicTouchPad"),
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
      active = true;
      root.hidden = false;
      showScreen("start");
      if (els.goRestart) els.goRestart.hidden = true;
      ensureLoop();
    },

    stop() {
      active = false;
      if (loopTimer) clearTimeout(loopTimer);
      loopTimer = null;
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
    getVolume01() {
      return typeof Howler !== "undefined" ? Howler.volume() : 0.82;
    },
  };

  global.ClassicStratagemHero = api;
})(typeof window !== "undefined" ? window : this);
