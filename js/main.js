/**
 * My Home — personal launcher for Samsung Smart TV (Tizen)
 */
(function () {
  'use strict';

  var S = window.HOME_SETTINGS || {};
  var CHANNELS = window.CHANNELS_DATA || [];
  var isTizen = !!(window.tizen && tizen.application);

  var KEYS = {
    ENTER: 13,
    RETURN: 10009,
    ESCAPE: 27,
    BACKSPACE: 8,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    RED: 403,
    GREEN: 404,
    YELLOW: 405,
    CH_UP: 427,
    CH_DOWN: 428,
    PAGE_UP: 33,
    PAGE_DOWN: 34,
    KEY_F: 70,
    KEY_G: 71,
    KEY_C: 67
  };

  var STORAGE = {
    pinned: 'home.pinnedApps',
    favorites: 'home.favoriteChannels',
    recent: 'home.recentChannels',
    category: 'home.channelCategory'
  };

  var RECENT_MAX = 10;
  var PAGE_STEP = 5;

  var MONOGRAM_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#ca8a04', '#dc2626'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEATHER_REFRESH_MS = 20 * 60 * 1000;
  var WEATHER_RETRY_MS = 2 * 60 * 1000;

  var state = {
    selfId: null,
    apps: [],
    pinned: [],
    favorites: [],
    recent: [],
    category: '',
    sources: [],
    rows: [],
    rowIndex: 0,
    colByRow: {},
    tileOffset: {},
    rowsOffset: 0,
    userMoved: false,
    sourceShowing: false,
    dial: '',
    dialTimer: null,
    weatherAt: 0,
    weatherTriedAt: 0
  };

  function $(id) { return document.getElementById(id); }

  var DOM = {
    greeting: $('greeting'),
    clock: $('clock'),
    date: $('date'),
    weatherIcon: $('weather-icon'),
    weatherTemp: $('weather-temp'),
    weatherDesc: $('weather-desc'),
    weatherRange: $('weather-range'),
    viewport: $('rows-viewport'),
    rows: $('rows'),
    toast: $('toast'),
    dial: $('dial'),
    dialDigits: $('dial-digits'),
    sourceHint: $('source-hint')
  };

  function find(list, test) {
    for (var i = 0; i < list.length; i++) {
      if (test(list[i])) return list[i];
    }
    return null;
  }

  function findIndex(list, test) {
    for (var i = 0; i < list.length; i++) {
      if (test(list[i])) return i;
    }
    return -1;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function readStorage(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {}
  }

  var toastTimer = null;
  function toast(msg) {
    DOM.toast.textContent = msg;
    DOM.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      DOM.toast.classList.remove('show');
    }, 3000);
  }

  function errorText(err) {
    return err && err.message ? ': ' + err.message : '';
  }

  // ---------------------------------------------------------------- Clock

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function updateClock() {
    var now = new Date();
    var h = now.getHours();
    var mm = pad(now.getMinutes());

    if (S.use24HourClock) {
      DOM.clock.textContent = pad(h) + ':' + mm;
    } else {
      DOM.clock.innerHTML = ((h % 12) || 12) + ':' + mm + '<span class="ampm">' + (h < 12 ? 'AM' : 'PM') + '</span>';
    }
    DOM.date.textContent = DAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear();

    var part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
    DOM.greeting.textContent = S.ownerName ? part + ', ' + S.ownerName : part;
  }

  // ---------------------------------------------------------------- Weather (Open-Meteo, no API key)

  var WEATHER_CODES = [
    [[0], '☀️', 'Clear sky'],
    [[1], '🌤️', 'Mainly clear'],
    [[2], '⛅', 'Partly cloudy'],
    [[3], '☁️', 'Overcast'],
    [[45, 48], '🌫️', 'Fog'],
    [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'],
    [[61, 63, 65, 66, 67], '🌧️', 'Rain'],
    [[71, 73, 75, 77, 85, 86], '❄️', 'Snow'],
    [[80, 81, 82], '🌦️', 'Rain showers'],
    [[95, 96, 99], '⛈️', 'Thunderstorm']
  ];

  function describeWeather(code, isDay) {
    var match = find(WEATHER_CODES, function (entry) { return entry[0].indexOf(code) !== -1; });
    if (!match) return { icon: '🌡️', text: '' };
    return { icon: !isDay && code <= 1 ? '🌙' : match[1], text: match[2] };
  }

  function getJson(url, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 10000;
    xhr.onload = function () {
      if (xhr.status !== 200) return onError();
      try {
        onSuccess(JSON.parse(xhr.responseText));
      } catch (err) {
        onError();
      }
    };
    xhr.onerror = onError;
    xhr.ontimeout = onError;
    xhr.send();
  }

  function loadWeather() {
    var w = S.weather || {};
    if (w.latitude === undefined || w.longitude === undefined) {
      DOM.weatherDesc.textContent = 'Set your location in settings.js';
      return;
    }
    state.weatherTriedAt = Date.now();
    var unit = w.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + w.latitude + '&longitude=' + w.longitude +
      '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min' +
      '&forecast_days=1&timezone=auto&temperature_unit=' + unit;

    getJson(url, function (data) {
      var cur = data && data.current;
      if (!cur) return weatherFailed();
      var info = describeWeather(cur.weather_code, cur.is_day);
      DOM.weatherIcon.textContent = info.icon;
      DOM.weatherTemp.textContent = Math.round(cur.temperature_2m) + '°';
      DOM.weatherDesc.textContent = (w.city ? w.city + ' • ' : '') + info.text;
      var daily = data.daily;
      DOM.weatherRange.textContent = daily && daily.temperature_2m_max
        ? 'High ' + Math.round(daily.temperature_2m_max[0]) + '°   Low ' + Math.round(daily.temperature_2m_min[0]) + '°'
        : '';
      state.weatherAt = Date.now();
    }, weatherFailed);
  }

  function weatherFailed() {
    if (!state.weatherAt) {
      DOM.weatherIcon.textContent = '🌡️';
      DOM.weatherDesc.textContent = 'Weather unavailable';
    }
  }

  function refreshWeatherIfStale() {
    var now = Date.now();
    if (now - state.weatherAt > WEATHER_REFRESH_MS && now - state.weatherTriedAt > WEATHER_RETRY_MS) {
      loadWeather();
    }
  }

  // ---------------------------------------------------------------- Apps

  function iconUrl(path) {
    if (!path) return '';
    return path.charAt(0) === '/' ? 'file://' + path : path;
  }

  function loadApps(done) {
    if (!isTizen) {
      state.apps = (S.previewApps || []).map(function (a) {
        return { id: a.id, name: a.name, icon: a.icon || '' };
      });
      done();
      return;
    }
    try {
      tizen.application.getAppsInfo(function (list) {
        var seen = {};
        state.apps = list.filter(function (info) {
          if (!info.show || !info.name || info.id === state.selfId || seen[info.id]) return false;
          seen[info.id] = true;
          return true;
        }).map(function (info) {
          return { id: info.id, name: info.name, icon: iconUrl(info.iconPath) };
        }).sort(function (a, b) {
          return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
        });
        done();
      }, function () { done(); });
    } catch (err) {
      done();
    }
  }

  function appById(id) {
    return find(state.apps, function (a) { return a.id === id; });
  }

  function resolvePinned() {
    var saved = readStorage(STORAGE.pinned, null);
    if (Array.isArray(saved)) {
      state.pinned = saved.map(String);
      return;
    }
    // Not customized yet: match the defaults against what is installed right now.
    var picks = [];
    (S.defaultPinnedApps || []).forEach(function (want) {
      var w = String(want).toLowerCase();
      var app = find(state.apps, function (a) { return a.id.toLowerCase() === w; }) ||
        find(state.apps, function (a) { return a.name.toLowerCase().indexOf(w) !== -1; });
      if (app && picks.indexOf(app.id) === -1) picks.push(app.id);
    });
    state.pinned = picks;
  }

  function togglePin(app) {
    var idx = state.pinned.indexOf(app.id);
    if (idx === -1) {
      state.pinned.push(app.id);
      toast('📌 ' + app.name + ' pinned to My Apps');
    } else {
      state.pinned.splice(idx, 1);
      toast(app.name + ' removed from My Apps');
    }
    writeStorage(STORAGE.pinned, state.pinned);
    refresh();
  }

  function launchApp(app) {
    if (!isTizen) {
      toast('On the TV this opens ' + app.name);
      return;
    }
    try {
      tizen.application.launch(app.id, null, function (err) {
        toast('Could not open ' + app.name + errorText(err));
      });
    } catch (err) {
      toast('Could not open ' + app.name + errorText(err));
    }
  }

  // ---------------------------------------------------------------- Live TV (IPTV app)

  function channelById(id) {
    return find(CHANNELS, function (c) { return String(c.id) === String(id); });
  }

  var CATEGORIES = (function () {
    var list = [];
    CHANNELS.forEach(function (c) {
      if (c.category && list.indexOf(c.category) === -1) list.push(c.category);
    });
    return list;
  })();

  function inCategory(channel) {
    return !state.category || channel.category === state.category;
  }

  function orderedChannels() {
    var favs = state.favorites.map(channelById).filter(Boolean);
    var rest = CHANNELS.filter(function (c) { return state.favorites.indexOf(String(c.id)) === -1; });
    return favs.concat(rest).filter(inCategory);
  }

  function recentChannels() {
    return state.recent.map(channelById).filter(Boolean);
  }

  function rememberChannel(channel) {
    var id = String(channel.id);
    var idx = state.recent.indexOf(id);
    if (idx !== -1) state.recent.splice(idx, 1);
    state.recent.unshift(id);
    state.recent = state.recent.slice(0, RECENT_MAX);
    writeStorage(STORAGE.recent, state.recent);
    state.colByRow.recent = 0;
    state.tileOffset.recent = 0;
  }

  function watchLastChannel() {
    var last = recentChannels()[0];
    if (last) openChannel(last);
    else toast('No recently watched channel yet');
  }

  function cycleCategory() {
    if (!CATEGORIES.length) return;
    var idx = CATEGORIES.indexOf(state.category);
    // '' (All) -> first category -> ... -> last category -> All
    state.category = idx + 1 < CATEGORIES.length ? CATEGORIES[idx + 1] : '';
    writeStorage(STORAGE.category, state.category);
    state.colByRow.live = 0;
    state.tileOffset.live = 0;
    state.userMoved = true;
    refresh();
    var liveIdx = findIndex(state.rows, function (r) { return r.id === 'live'; });
    if (liveIdx !== -1) {
      state.rowIndex = liveIdx;
      updateFocus();
    }
    toast('Live TV: ' + (state.category || 'All channels'));
  }

  function toggleFavorite(channel) {
    var id = String(channel.id);
    var idx = state.favorites.indexOf(id);
    if (idx === -1) {
      state.favorites.push(id);
      toast('★ ' + channel.name + ' added to favorites');
    } else {
      state.favorites.splice(idx, 1);
      toast(channel.name + ' removed from favorites');
    }
    writeStorage(STORAGE.favorites, state.favorites);
    refresh();
    var row = currentRow();
    if (row && row.type === 'channel') {
      state.colByRow[row.id] = Math.max(0, findIndex(row.items, function (c) { return String(c.id) === id; }));
      updateFocus();
    }
  }

  function openChannel(channel) {
    rememberChannel(channel);
    if (!isTizen) {
      window.location.href = (S.iptvBrowserUrl || '../samsung-tv-iptv/') + '?channel=' + encodeURIComponent(channel.id);
      return;
    }
    try {
      var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, [
        new tizen.ApplicationControlData('channel', [String(channel.id)]),
        new tizen.ApplicationControlData('requestId', [String(Date.now())])
      ]);
      tizen.application.launchAppControl(control, S.iptvAppId, null, function (err) {
        toast('Could not open the IPTV app' + errorText(err));
      });
    } catch (err) {
      toast('Could not open the IPTV app' + errorText(err));
    }
  }

  // ---------------------------------------------------------------- Sources (HDMI / TV)

  var FALLBACK_SOURCES = [
    { type: 'TV', number: 1 },
    { type: 'HDMI', number: 1 },
    { type: 'HDMI', number: 2 },
    { type: 'HDMI', number: 3 },
    { type: 'HDMI', number: 4 }
  ];

  function sourceLabel(info) {
    return info.type === 'TV' ? 'TV' : info.type + (info.number ? ' ' + info.number : '');
  }

  function loadSources(done) {
    function useFallback() {
      state.sources = FALLBACK_SOURCES.map(function (info) {
        return { info: info, connected: false, label: sourceLabel(info) };
      });
      done();
    }

    if (!(window.tizen && tizen.systeminfo && tizen.tvwindow)) return useFallback();

    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (vs) {
        var list = [];
        (vs.connected || []).forEach(function (info) { list.push({ info: info, connected: true }); });
        (vs.disconnected || []).forEach(function (info) { list.push({ info: info, connected: false }); });
        list = list.filter(function (s) { return s.info.type === 'TV' || s.info.type === 'HDMI'; });
        list.sort(function (a, b) {
          var typeOrder = (a.info.type === 'TV' ? 0 : 1) - (b.info.type === 'TV' ? 0 : 1);
          return typeOrder || a.info.number - b.info.number;
        });
        list.forEach(function (s) { s.label = sourceLabel(s.info); });
        if (!list.length) return useFallback();
        state.sources = list;
        done();
      }, useFallback);
    } catch (err) {
      useFallback();
    }
  }

  var sourceHintTimer = null;
  function flashSourceHint() {
    DOM.sourceHint.classList.remove('faded');
    clearTimeout(sourceHintTimer);
    sourceHintTimer = setTimeout(function () {
      DOM.sourceHint.classList.add('faded');
    }, 4000);
  }

  function showSource(source) {
    if (!(window.tizen && tizen.tvwindow)) {
      toast('On the TV this switches to ' + source.label);
      return;
    }
    function fail(err) {
      exitSourceMode();
      toast('Could not switch to ' + source.label + errorText(err));
    }
    try {
      tizen.tvwindow.setSource(source.info, function () {
        tizen.tvwindow.show(function () {
          state.sourceShowing = true;
          document.body.classList.add('source-mode');
          flashSourceHint();
        }, fail, ['0px', '0px', '100%', '100%'], 'MAIN');
      }, fail, 'MAIN');
    } catch (err) {
      fail(err);
    }
  }

  function exitSourceMode() {
    state.sourceShowing = false;
    document.body.classList.remove('source-mode');
  }

  function hideSource() {
    exitSourceMode();
    if (window.tizen && tizen.tvwindow) {
      try {
        tizen.tvwindow.hide(function () {}, null, 'MAIN');
      } catch (err) {}
    }
  }

  // ---------------------------------------------------------------- Rows

  function buildRows() {
    var otherApps = state.apps.filter(function (a) { return state.pinned.indexOf(a.id) === -1; });
    state.rows = [
      { id: 'recent', title: 'Continue Watching', type: 'channel', items: recentChannels() },
      {
        id: 'pinned',
        title: 'My Apps',
        type: 'app',
        items: state.pinned.map(appById).filter(Boolean),
        empty: 'Highlight an app in "All Apps" and press RED to pin it here.'
      },
      {
        id: 'live',
        title: 'Live TV' + (state.category ? ' · ' + state.category : ''),
        type: 'channel',
        items: orderedChannels(),
        empty: state.category ? 'No channels in ' + state.category + '. Press YELLOW for the next category.' : ''
      },
      { id: 'sources', title: 'Sources', type: 'source', items: state.sources },
      { id: 'apps', title: 'All Apps', type: 'app', items: otherApps }
    ].filter(function (row) { return row.items.length || row.empty; });
  }

  function currentRow() {
    return state.rows[state.rowIndex] || null;
  }

  function colOf(row) {
    var col = state.colByRow[row.id] || 0;
    return Math.max(0, Math.min(col, row.items.length - 1));
  }

  function firstUsableRow(from, dir) {
    for (var i = from; i >= 0 && i < state.rows.length; i += dir) {
      if (state.rows[i].items.length) return i;
    }
    return -1;
  }

  function refresh() {
    var current = currentRow();
    var currentId = current ? current.id : null;
    buildRows();

    var idx = state.userMoved ? findIndex(state.rows, function (r) { return r.id === currentId; }) : -1;
    if (idx === -1 || !state.rows[idx].items.length) {
      idx = firstUsableRow(Math.max(idx, 0), 1);
      if (idx === -1) idx = firstUsableRow(state.rows.length - 1, -1);
    }
    state.rowIndex = Math.max(idx, 0);
    render();
  }

  function monogram(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    var node = el('div', 'app-monogram', name.charAt(0).toUpperCase());
    node.style.background = MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
    return node;
  }

  function renderAppTile(app, row) {
    var tile = el('div', 'tile tile-app');
    if (app.icon) {
      var img = el('img', 'app-icon');
      img.alt = '';
      img.onerror = function () {
        tile.replaceChild(monogram(app.name), img);
      };
      img.src = app.icon;
      tile.appendChild(img);
    } else {
      tile.appendChild(monogram(app.name));
    }
    tile.appendChild(el('div', 'tile-name', app.name));
    if (row.id === 'pinned') tile.appendChild(el('span', 'tile-pin', '📌'));
    return tile;
  }

  function renderChannelTile(channel) {
    var tile = el('div', 'tile tile-channel');
    var logoWrap = el('div', 'channel-logo-wrap');
    var img = el('img', 'channel-logo');
    var fallback = el('div', 'channel-logo-fallback', '📺');
    img.alt = '';
    img.setAttribute('data-src', channel.logo ? encodeURI(channel.logo) : '');
    img.onerror = function () {
      img.style.display = 'none';
      fallback.style.display = 'block';
    };
    logoWrap.appendChild(img);
    logoWrap.appendChild(fallback);
    tile.appendChild(logoWrap);

    var meta = el('div', 'channel-meta');
    meta.appendChild(el('div', 'channel-number', 'CH ' + pad(channel.number)));
    meta.appendChild(el('div', 'tile-name', channel.name));
    tile.appendChild(meta);

    if (state.favorites.indexOf(String(channel.id)) !== -1) tile.appendChild(el('span', 'tile-pin', '★'));
    return tile;
  }

  function renderSourceTile(source) {
    var tile = el('div', 'tile tile-source');
    tile.appendChild(el('div', 'source-icon', source.info.type === 'TV' ? '📡' : '🔌'));
    tile.appendChild(el('div', 'tile-name', source.label));
    var status = el('div', 'source-state' + (source.connected ? ' connected' : ''));
    status.appendChild(el('span', 'dot'));
    status.appendChild(document.createTextNode(source.connected ? 'Connected' : 'Not connected'));
    tile.appendChild(status);
    return tile;
  }

  function render() {
    DOM.rows.innerHTML = '';
    state.rows.forEach(function (row, r) {
      var section = el('section', 'row');
      var title = el('h2', 'row-title', row.title);
      if (row.id === 'live' && state.favorites.length && !state.category) {
        title.appendChild(el('span', 'row-count', '★ ' + state.favorites.length + ' favorite' + (state.favorites.length > 1 ? 's' : '')));
      } else if (row.items.length) {
        title.appendChild(el('span', 'row-count', String(row.items.length)));
      }
      section.appendChild(title);

      var strip = el('div', 'row-strip');
      var tiles = el('div', 'row-tiles');
      if (!row.items.length) {
        strip.appendChild(el('div', 'row-empty', row.empty));
      }
      row.items.forEach(function (item, c) {
        var tile = row.type === 'app' ? renderAppTile(item, row)
          : row.type === 'channel' ? renderChannelTile(item)
          : renderSourceTile(item);
        tile.addEventListener('click', function () {
          state.userMoved = true;
          state.rowIndex = r;
          state.colByRow[row.id] = c;
          updateFocus();
          activate();
        });
        tiles.appendChild(tile);
      });
      tiles.style.transform = 'translateX(' + -(state.tileOffset[row.id] || 0) + 'px)';
      strip.appendChild(tiles);
      section.appendChild(strip);
      DOM.rows.appendChild(section);

      row.el = section;
      row.tilesEl = tiles;
      if (row.type === 'channel') loadLogos(row, colOf(row));
    });
    updateFocus();
  }

  function loadLogos(row, col) {
    var tiles = row.tilesEl.children;
    var end = Math.min(tiles.length, col + 12);
    for (var i = Math.max(0, col - 3); i < end; i++) {
      var img = tiles[i].querySelector('.channel-logo');
      var src = img && img.getAttribute('data-src');
      if (src && !img.getAttribute('src')) img.src = src;
    }
  }

  function scrollTiles(row, tile) {
    var viewW = DOM.viewport.clientWidth;
    var offset = state.tileOffset[row.id] || 0;
    var margin = 140;
    var left = tile.offsetLeft;
    var right = left + tile.offsetWidth;
    if (left - margin < offset) {
      offset = Math.max(0, left - margin);
    } else if (right + margin > offset + viewW) {
      offset = right + margin - viewW;
    }
    state.tileOffset[row.id] = offset;
    row.tilesEl.style.transform = 'translateX(' + -offset + 'px)';
  }

  function scrollRows(row) {
    var viewH = DOM.viewport.clientHeight;
    var top = row.el.offsetTop;
    var bottom = top + row.el.offsetHeight;
    var offset = state.rowsOffset;
    if (state.rowIndex === 0 || top < offset) {
      offset = state.rowIndex === 0 ? 0 : top;
    } else if (bottom > offset + viewH) {
      offset = bottom - viewH;
    }
    state.rowsOffset = offset;
    DOM.rows.style.transform = 'translateY(' + -offset + 'px)';
  }

  function updateFocus() {
    var prev = DOM.rows.querySelector('.tile.focused');
    if (prev) prev.classList.remove('focused');

    var row = currentRow();
    if (!row || !row.el) return;
    scrollRows(row);
    if (!row.items.length) return;

    var col = colOf(row);
    var tile = row.tilesEl.children[col];
    tile.classList.add('focused');
    scrollTiles(row, tile);
    if (row.type === 'channel') loadLogos(row, col);
  }

  function moveRow(dir) {
    var idx = firstUsableRow(state.rowIndex + dir, dir);
    if (idx === -1) return;
    state.rowIndex = idx;
    updateFocus();
  }

  // A single press wraps from one end of the row to the other; a held key stops at the end
  // so fast scrolling doesn't fly past it.
  function moveCol(dir, isRepeat) {
    var row = currentRow();
    if (!row || !row.items.length) return;
    var last = row.items.length - 1;
    var col = colOf(row) + dir;
    if (col < 0) col = isRepeat ? 0 : last;
    else if (col > last) col = isRepeat ? last : 0;
    if (col === colOf(row)) return;
    state.colByRow[row.id] = col;
    updateFocus();
  }

  // Jump several tiles at once; clamps instead of wrapping.
  function pageCol(dir) {
    var row = currentRow();
    if (!row || !row.items.length) return;
    var col = Math.max(0, Math.min(colOf(row) + dir * PAGE_STEP, row.items.length - 1));
    state.colByRow[row.id] = col;
    updateFocus();
  }

  function focusedItem() {
    var row = currentRow();
    return row && row.items.length ? { row: row, item: row.items[colOf(row)] } : null;
  }

  function activate() {
    var focus = focusedItem();
    if (!focus) return;
    if (focus.row.type === 'app') launchApp(focus.item);
    else if (focus.row.type === 'channel') openChannel(focus.item);
    else showSource(focus.item);
  }

  function redAction() {
    var focus = focusedItem();
    if (!focus) return;
    if (focus.row.type === 'app') togglePin(focus.item);
    else if (focus.row.type === 'channel') toggleFavorite(focus.item);
  }

  function goToStart() {
    state.colByRow = {};
    state.rowIndex = Math.max(firstUsableRow(0, 1), 0);
    updateFocus();
  }

  // ---------------------------------------------------------------- Channel number dial

  function dialDigit(digit) {
    state.dial = (state.dial + digit).slice(-3);
    DOM.dialDigits.textContent = state.dial;
    DOM.dial.classList.add('show');
    clearTimeout(state.dialTimer);
    state.dialTimer = setTimeout(commitDial, 1800);
  }

  function cancelDial() {
    clearTimeout(state.dialTimer);
    state.dial = '';
    DOM.dial.classList.remove('show');
  }

  function commitDial() {
    var num = parseInt(state.dial, 10);
    cancelDial();
    var channel = find(CHANNELS, function (c) { return c.number === num; });
    if (channel) openChannel(channel);
    else toast('No channel ' + num);
  }

  // ---------------------------------------------------------------- Keys

  function registerKeys() {
    if (!(window.tizen && tizen.tvinputdevice)) return;
    ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ChannelUp', 'ChannelDown', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (key) {
      try {
        tizen.tvinputdevice.registerKey(key);
      } catch (err) {}
    });
  }

  function isBackKey(code) {
    return code === KEYS.RETURN || code === KEYS.ESCAPE || code === KEYS.BACKSPACE;
  }

  function handleKey(e) {
    var code = e.keyCode;

    if (state.sourceShowing) {
      if (isBackKey(code)) {
        e.preventDefault();
        hideSource();
      } else {
        flashSourceHint();
      }
      return;
    }

    if (code >= 48 && code <= 57) {
      dialDigit(String(code - 48));
      return;
    }

    if (state.dial) {
      if (code === KEYS.ENTER) {
        commitDial();
        return;
      }
      if (isBackKey(code)) {
        e.preventDefault();
        cancelDial();
        return;
      }
    }

    switch (code) {
      case KEYS.UP:
      case KEYS.DOWN:
        e.preventDefault();
        state.userMoved = true;
        moveRow(code === KEYS.UP ? -1 : 1);
        break;
      case KEYS.LEFT:
      case KEYS.RIGHT:
        e.preventDefault();
        state.userMoved = true;
        moveCol(code === KEYS.LEFT ? -1 : 1, e.repeat);
        break;
      case KEYS.CH_UP:
      case KEYS.CH_DOWN:
      case KEYS.PAGE_UP:
      case KEYS.PAGE_DOWN:
        e.preventDefault();
        state.userMoved = true;
        pageCol(code === KEYS.CH_UP || code === KEYS.PAGE_UP ? 1 : -1);
        break;
      case KEYS.GREEN:
      case KEYS.KEY_G:
        watchLastChannel();
        break;
      case KEYS.YELLOW:
      case KEYS.KEY_C:
        cycleCategory();
        break;
      case KEYS.ENTER:
        activate();
        break;
      case KEYS.RED:
      case KEYS.KEY_F:
        redAction();
        break;
      case KEYS.RETURN:
      case KEYS.ESCAPE:
      case KEYS.BACKSPACE:
        e.preventDefault();
        goToStart();
        break;
    }
  }

  // ---------------------------------------------------------------- Start

  function reloadApps() {
    loadApps(function () {
      resolvePinned();
      refresh();
    });
  }

  window.addEventListener('load', function () {
    if (isTizen) {
      try {
        state.selfId = tizen.application.getCurrentApplication().appInfo.id;
      } catch (err) {}
    }
    registerKeys();

    var savedFavorites = readStorage(STORAGE.favorites, []);
    state.favorites = Array.isArray(savedFavorites) ? savedFavorites.map(String) : [];
    var savedRecent = readStorage(STORAGE.recent, []);
    state.recent = Array.isArray(savedRecent) ? savedRecent.map(String).slice(0, RECENT_MAX) : [];
    var savedCategory = readStorage(STORAGE.category, '');
    state.category = CATEGORIES.indexOf(savedCategory) !== -1 ? savedCategory : '';

    updateClock();
    setInterval(updateClock, 1000);
    loadWeather();
    setInterval(refreshWeatherIfStale, 60 * 1000);

    refresh();
    loadSources(refresh);
    reloadApps();

    document.addEventListener('keydown', handleKey);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (state.sourceShowing) hideSource();
        return;
      }
      updateClock();
      refreshWeatherIfStale();
      reloadApps();
    });
  });
})();
