/* =========================================================
   Логика сайта: списки стихов и плеер.
   Контент лежит в assets/js/data.js — правьте его, а не этот файл.
   ========================================================= */

(function () {
  "use strict";

  var site = window.SITE || {};
  var poems = Array.isArray(site.poems) ? site.poems.slice() : [];
  var tracks = Array.isArray(site.tracks) ? site.tracks.slice() : [];
  var audioElements = [];

  var ICON_PLAY =
    '<svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M8.5 5.4v13.2L19 12z" fill="currentColor"/></svg>';
  var ICON_PAUSE =
    '<svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<rect x="7" y="5" width="3.4" height="14" rx="1" fill="currentColor"/>' +
    '<rect x="13.6" y="5" width="3.4" height="14" rx="1" fill="currentColor"/></svg>';

  /* ---------- Утилиты ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function normalizeText(value) {
    if (Array.isArray(value)) return value.join("\n");
    return value === undefined || value === null ? "" : String(value);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var date = new Date(iso + "T00:00:00");
    if (isNaN(date.getTime())) return String(iso);
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(date);
    } catch (error) {
      return String(iso);
    }
  }

  function fmtTime(seconds) {
    var value = Number(seconds);
    if (!isFinite(value) || value < 0) value = 0;
    var minutes = Math.floor(value / 60);
    var rest = Math.floor(value % 60);
    return minutes + ":" + (rest < 10 ? "0" : "") + rest;
  }

  function plural(count, forms) {
    var lastTwo = count % 100;
    var last = count % 10;
    if (last === 1 && lastTwo !== 11) return forms[0];
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
    return forms[2];
  }

  var TRANSLIT = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
  };

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .split("")
      .map(function (character) {
        return TRANSLIT[character] !== undefined ? TRANSLIT[character] : character;
      })
      .join("")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function uniqueId(base, used) {
    var id = base;
    var counter = 2;
    while (used[id]) {
      id = base + "-" + counter;
      counter += 1;
    }
    used[id] = true;
    return id;
  }

  /* ---------- Подготовка данных ---------- */

  (function prepare() {
    var used = {};

    poems.forEach(function (poem, index) {
      poem.text = normalizeText(poem.text);
      poem.title = normalizeText(poem.title) || "Без названия";
      var base = slugify(poem.title) || "poem-" + (index + 1);
      if (!poem.id || used[poem.id]) {
        poem.id = uniqueId(base, used);
      } else {
        used[poem.id] = true;
      }
    });

    poems.sort(function (a, b) {
      var first = a.date ? Date.parse(a.date) : 0;
      var second = b.date ? Date.parse(b.date) : 0;
      if (isNaN(first)) first = 0;
      if (isNaN(second)) second = 0;
      return second - first;
    });

    tracks.forEach(function (track) {
      track.title = normalizeText(track.title) || "Без названия";
      track.description = normalizeText(track.description);
      track.src = normalizeText(track.src);
    });
  })();

  /* ---------- Общие элементы ---------- */

  function highlightNav() {
    var page = document.body.getAttribute("data-page");
    if (!page) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (link) {
      if (link.getAttribute("data-nav") === page) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function setYear() {
    var year = String(new Date().getFullYear());
    Array.prototype.forEach.call(document.querySelectorAll("[data-year]"), function (node) {
      node.textContent = year;
    });
  }

  function emptyState(text) {
    var box = el("div", "empty");
    box.appendChild(el("p", "empty__title", "Здесь пока пусто"));
    box.appendChild(el("p", "empty__text", text));
    return box;
  }

  function excerpt(text, maxLines) {
    var stanzas = String(text || "").trim().split(/\n\s*\n/);
    var lines = (stanzas[0] || "").split("\n").filter(function (line) {
      return line.trim() !== "";
    });
    var truncated = stanzas.length > 1 || lines.length > maxLines;
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);
    var output = lines.join("\n");
    if (truncated && output) output += " …";
    return output;
  }

  /* ---------- Плеер ---------- */

  function pauseOthers(currentAudio) {
    audioElements.forEach(function (audio) {
      if (audio !== currentAudio && !audio.paused) audio.pause();
    });
  }

  function buildTrack(track, options) {
    options = options || {};

    var card = el("article", "track");
    card.setAttribute("data-track", "");

    var meta = el("div", "track__meta");
    if (!options.compact) {
      var number = String(options.number || 1);
      meta.appendChild(el("span", "track__num", number.length < 2 ? "0" + number : number));
    }
    meta.appendChild(el("h3", "track__title", track.title));
    if (track.description) {
      meta.appendChild(el("p", "track__desc", track.description));
    }
    card.appendChild(meta);

    var player = el("div", "track__player");

    var button = el("button", "track__play");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Слушать: " + track.title);
    button.innerHTML = ICON_PLAY + ICON_PAUSE;
    player.appendChild(button);

    var line = el("div", "track__line");

    var seek = document.createElement("input");
    seek.type = "range";
    seek.className = "track__seek";
    seek.min = "0";
    seek.max = "100";
    seek.step = "0.1";
    seek.value = "0";
    seek.disabled = true;
    seek.setAttribute("aria-label", "Перемотка: " + track.title);
    line.appendChild(seek);

    var bottom = el("div", "track__bottom");
    var time = el("span", "track__time", "0:00 / 0:00");
    bottom.appendChild(time);
    if (track.src) {
      var download = el("a", "track__dl", "скачать");
      download.href = track.src;
      download.setAttribute("download", "");
      bottom.appendChild(download);
    }
    line.appendChild(bottom);

    var status = el("p", "track__status");
    status.hidden = true;
    line.appendChild(status);

    player.appendChild(line);
    card.appendChild(player);

    var audio = document.createElement("audio");
    audio.className = "track__audio";
    audio.preload = "metadata";
    if (track.src) audio.src = track.src;
    card.appendChild(audio);
    audioElements.push(audio);

    function setPressed(isPlaying) {
      button.setAttribute("aria-pressed", isPlaying ? "true" : "false");
      button.setAttribute("aria-label", (isPlaying ? "Пауза: " : "Слушать: ") + track.title);
    }

    function update() {
      var duration = audio.duration;
      var current = audio.currentTime || 0;
      if (isFinite(duration) && duration > 0) {
        var percent = Math.min(100, (current / duration) * 100);
        seek.disabled = false;
        seek.value = String(percent);
        seek.style.setProperty("--progress", percent + "%");
      }
      time.textContent = fmtTime(current) + " / " + fmtTime(duration);
    }

    function showError(message) {
      status.hidden = false;
      status.textContent = message;
    }

    audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("durationchange", update);
    audio.addEventListener("timeupdate", update);

    audio.addEventListener("play", function () {
      pauseOthers(audio);
      setPressed(true);
    });

    audio.addEventListener("pause", function () {
      setPressed(false);
    });

    audio.addEventListener("ended", function () {
      setPressed(false);
      audio.currentTime = 0;
      update();
    });

    audio.addEventListener("error", function () {
      if (!track.src) return;
      setPressed(false);
      showError("Не удалось загрузить аудио — проверьте путь к файлу в assets/js/data.js.");
    });

    button.addEventListener("click", function () {
      if (!track.src) {
        showError("У трека не указан файл. Добавьте путь в поле src в assets/js/data.js.");
        return;
      }
      status.hidden = true;
      if (audio.paused) {
        pauseOthers(audio);
        var promise = audio.play();
        if (promise && typeof promise.catch === "function") {
          promise.catch(function (error) {
            if (error && error.name === "AbortError") return;
            showError("Не удалось воспроизвести файл. Проверьте путь и формат (mp3).");
          });
        }
      } else {
        audio.pause();
      }
    });

    seek.addEventListener("input", function () {
      var duration = audio.duration;
      if (!isFinite(duration) || duration <= 0) return;
      audio.currentTime = (Number(seek.value) / 100) * duration;
      seek.style.setProperty("--progress", seek.value + "%");
    });

    return card;
  }

  /* ---------- Главная ---------- */

  function renderLatestPoem() {
    var host = document.getElementById("latest-poem");
    if (!host) return;

    if (!poems.length) {
      host.appendChild(
        emptyState("Добавьте стихотворение в файл assets/js/data.js — и оно появится здесь.")
      );
      return;
    }

    var poem = poems[0];
    var feature = el("article", "feature");

    var head = el("header", "feature__head");
    head.appendChild(el("h3", "feature__title", poem.title));
    if (poem.date) {
      var date = el("time", "feature__date", fmtDate(poem.date));
      date.setAttribute("datetime", poem.date);
      head.appendChild(date);
    }
    feature.appendChild(head);

    var text = el("div", "feature__text");
    text.textContent = excerpt(poem.text, 7);
    feature.appendChild(text);

    var link = el("a", "text-link", "Читать целиком");
    link.href = "poems.html#" + encodeURIComponent(poem.id);
    feature.appendChild(link);

    host.appendChild(feature);
  }

  function renderFeaturedTrack() {
    var host = document.getElementById("featured-track");
    if (!host) return;

    if (!tracks.length) {
      host.appendChild(
        emptyState("Добавьте трек в файл assets/js/data.js — и он появится здесь.")
      );
      return;
    }

    host.appendChild(buildTrack(tracks[0], { compact: true }));
  }

  /* ---------- Страница «Стихи» ---------- */

  function renderPoemsPage() {
    var host = document.getElementById("poems");
    if (!host) return;

    var counter = document.getElementById("poems-count");
    if (counter) {
      counter.textContent = poems.length
        ? poems.length + " " + plural(poems.length, ["стихотворение", "стихотворения", "стихотворений"])
        : "";
    }

    if (!poems.length) {
      host.appendChild(
        emptyState("Добавьте первое стихотворение в файл assets/js/data.js.")
      );
      return;
    }

    poems.forEach(function (poem) {
      var article = el("article", "poem");
      article.id = poem.id;

      var head = el("header", "poem__head");
      head.appendChild(el("h2", "poem__title", poem.title));
      if (poem.date) {
        var date = el("time", "poem__date", fmtDate(poem.date));
        date.setAttribute("datetime", poem.date);
        head.appendChild(date);
      }
      article.appendChild(head);

      var text = el("div", "poem__text");
      text.textContent = poem.text;
      article.appendChild(text);

      host.appendChild(article);
    });
  }

  /* ---------- Страница «Музыка» ---------- */

  function renderMusicPage() {
    var host = document.getElementById("tracks");
    if (!host) return;

    var counter = document.getElementById("tracks-count");
    if (counter) {
      counter.textContent = tracks.length
        ? tracks.length + " " + plural(tracks.length, ["трек", "трека", "треков"])
        : "";
    }

    if (!tracks.length) {
      host.appendChild(
        emptyState("Положите mp3 в папку assets/audio и опишите трек в assets/js/data.js.")
      );
      return;
    }

    tracks.forEach(function (track, index) {
      host.appendChild(buildTrack(track, { number: index + 1 }));
    });
  }

  /* ---------- Запуск ---------- */

  highlightNav();
  setYear();
  renderLatestPoem();
  renderFeaturedTrack();
  renderPoemsPage();
  renderMusicPage();
})();
