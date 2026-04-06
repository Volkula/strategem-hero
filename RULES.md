# Stratagem Hero — rules / Правила игры

**Maintenance / Сопровождение:** When you change gameplay numbers or modes in `classic-game.js` or `app.js` (`getNormalClassicOpts`, `getClassicKioskOpts`, `handleClassicGameOver`), update **both** language sections below.  
**При изменении** чисел или режимов в `classic-game.js` или `app.js` — обновите **оба** раздела (EN и RU).

---

## English

### Overview

The trainer uses a **classic** loop inspired by StratagemHero.com (`classic-game.js`): rounds, a queue of stratagems, one shared timer per round, and Howler-based SFX/music from **local files** under `assets/audio/classic/`.

### Game flow

1. **Start** — attract screen; any arrow / WASD begins a run (`startInternal`).
2. **Round starting** — ~**2 s** “get ready”; queue is built; first round plays **round_start_coin**, later rounds use the same coin clip.
3. **In game** — complete each stratagem’s **U/D/L/R** sequence in order. One **global timer** drains each tick (**10 ms**). Clearing the **entire** current sequence: **+1 s** to the timer (capped at the round’s max), **+5 × length** score, success SFX; when the **queue is empty**, music stops and **round over** runs.
4. **Round over** — ~**4 s** screen; staged reveal of time / perfect / total bonuses; then the next round.
5. **Game over** — timer hits **0**, or **session** wall clock ends (kiosk), or **wrong input** with **failOnWrong** (lottery). ~**3 s** lockout, then restart hint.

### Queue and timer

- **Queue size:** `4 + round` stratagems (randomized by category mix from the eligible pool).
- **Timer bar** turns **warning style** when remaining width ≤ **25%** (`TIME_WARNING`).
- **Wrong key:** input resets, correct-arrow highlights clear, **glitch** overlay + shake + error SFX; unless lottery, the run continues.

### Scoring (end of round)

- **Round bonus:** `75 + 25 × (round − 1)`.
- **Time bonus:** `floor((timeLeft / timeTotalCap) × 100)` (0–100 scale).
- **Perfect bonus:** **+100** if no wrong inputs during the round (`sequencePerfect`).
- **Per stratagem:** **+5 × sequence length** when a code is fully entered.

### Input

- **Keyboard:** arrows and **W A S D** (see `KEY_MAP` / `code` in `classic-game.js`). **Space** can start/restart on start or post–game-over when allowed.
- **Touch:** **swipes** on the playfield (when swipes are enabled in Settings) map to the same letters. There is no on-screen D-pad or Start/End bar on the playfield.
- **Volume:** slider in the classic shell; stored as `cfg.sfxVolume` (0–1).

### Normal play (`getNormalClassicOpts`)

| Parameter | Value |
|-----------|--------|
| `timeTotal` | **10 000** ms per round cap |
| `renewTimeEachRound` | **true** (timer refills each round) |
| `freezeTimer` | **false** |
| `failOnWrong` | **false** |
| `sessionDeadline` | **null** |

### Kiosk (`?kiosk=1`)

Festival presets (`getClassicKioskOpts`):

| Preset | Timer cap | Renew / round | Freeze timer | Fail on wrong | Session wall |
|--------|-----------|---------------|--------------|---------------|--------------|
| **easy** | very large | yes | **yes** | no | — |
| **sprint30** | **30 s** | no | no | no | **30 s** from mode start |
| **lottery** | **10 s** | yes | no | **yes** (one mistake → game over) | — |
| **marathon5** | **120 s** / round | no | no | no | **5 min** from mode start |

**Kiosk end screens** (`handleClassicGameOver`): lottery → **defeat** modal on wrong or time out; sprint / marathon → **victory** modal on time or session end (configurable final screens in Settings).

### Legacy code paths

`app.js` still contains the older **per-stratagem timer / lives** helpers for editor and edge cases; **active play** uses the classic engine. If that changes, update this document.

### Local assets policy

Shipped game resources (Howler, classic MP3s, header logo, favicon) live under **`assets/`** — no CDN for those. User-supplied theme URLs (YouTube, MP3, import) may still be remote by design.

---

## Русский

### Обзор

Тренажёр использует **классический** цикл в духе StratagemHero.com (`classic-game.js`): раунды, очередь стратегем, общий таймер на раунд, звук через Howler из **локальных** файлов в `assets/audio/classic/`.

### Ход игры

1. **Старт** — заставка; стрелки / WASD начинают забег (`startInternal`).
2. **Подготовка к раунду** — ~**2 с**; строится очередь; в первом раунде звук **round_start_coin**, дальше тот же клип.
3. **Игра** — вводить код текущей стратегемы как **U/D/L/R** по порядку. **Один общий таймер** убывает каждый тик (**10 мс**). Полный ввод цепочки: **+1 с** к таймеру (не выше максимума раунда), **+5 × длина** очков, звук успеха; когда **очередь пуста** — музыка стихает, экран **конец раунда**.
4. **Конец раунда** — ~**4 с**; поэтапно показываются бонусы времени / идеала / итог; затем следующий раунд.
5. **Game over** — таймер **0**, или **сессия** по часам (киоск), или **ошибка ввода** при **failOnWrong** (лотерея). ~**3 с** блокировка, затем подсказка перезапуска.

### Очередь и таймер

- **Размер очереди:** `4 + номер раунда` стратегем (случайный микс по категориям из доступного пула).
- **Полоса таймера** — предупреждающий стиль при остатке ≤ **25%** ширины (`TIME_WARNING`).
- **Неверная клавиша:** ввод сбрасывается, подсветка стрелок снимается, **глич** + тряска + звук ошибки; кроме лотереи забег продолжается.

### Очки (конец раунда)

- **Бонус раунда:** `75 + 25 × (раунд − 1)`.
- **Бонус времени:** `floor((остаток / макс. раунда) × 100)` (в условных 0–100).
- **Бонус за идеал:** **+100**, если за раунд не было ошибок (`sequencePerfect`).
- **За стратегему:** **+5 × длина кода** при полном вводе.

### Ввод

- **Клавиатура:** стрелки и **W A S D** (см. `KEY_MAP` в `classic-game.js`). **Пробел** — старт / перезапуск там, где это разрешено логикой экрана.
- **Сенсор:** **свайпы** по полю (если включены в настройках) дают те же буквы направления. Встроенного D-pad и полосы «Старт/Стоп» на экране игры нет.
- **Громкость:** ползунок в классической оболочке; в конфиге `cfg.sfxVolume` (0–1).

### Обычная игра (`getNormalClassicOpts`)

| Параметр | Значение |
|----------|----------|
| `timeTotal` | **10 000** мс на раунд (потолок) |
| `renewTimeEachRound` | **да** (таймер обнуляется/заполняется каждый раунд) |
| `freezeTimer` | **нет** |
| `failOnWrong` | **нет** |
| `sessionDeadline` | **нет** |

### Киоск (`?kiosk=1`)

Пресеты фестиваля (`getClassicKioskOpts`):

| Режим | Потолок таймера | Продление каждый раунд | Заморозка таймера | Поражение с первой ошибки | Стена по времени |
|-------|-----------------|------------------------|-------------------|---------------------------|------------------|
| **easy** | очень большой | да | **да** | нет | — |
| **sprint30** | **30 с** | нет | нет | нет | **30 с** от старта режима |
| **lottery** | **10 с** | да | нет | **да** | — |
| **marathon5** | **120 с** на раунд | нет | нет | нет | **5 мин** от старта режима |

**Финальные экраны киоска** (`handleClassicGameOver`): лотерея — модалка **поражения** при ошибке или таймауте; спринт / марафон — **победа** при окончании времени или сессии (тексты и QR в настройках).

### Старый код

В `app.js` остаётся логика **таймера на стратегему / жизней** для редактора и краевых случаев; **активная игра** идёт через классический движок. Если это изменится — обновите этот файл.

### Локальные ресурсы

Игровые файлы (Howler, MP3 классики, логотип, фавикон) лежат в **`assets/`**, без CDN. Пользовательские темы (YouTube, MP3, импорт по URL) по задумке могут быть внешними.
