let _currentMs = Date.now();
let _stepMs = 1000;
let _speed = 1;
let _interval = null;
const _subs = new Set();
let _initialized = false;

function notify() {
  for (const cb of Array.from(_subs)) {
    try { cb(_currentMs); } catch (e) { }
  }
}

function startTicker() {
  if (_interval) clearInterval(_interval);
  if (_speed === 0) { _interval = null; return; }
  const advance = Math.max(1, Math.round(_stepMs * _speed));
  _interval = setInterval(() => {
    _currentMs += advance;
    notify();
  }, _stepMs);
}

export function parseSpanishDatetime(s) {
  if (!s) return null;
  try {
    let t = String(s).trim();
    t = t.replace(/\./g, "").replace(/\s+/g, " ").trim();
    t = t.replace(/\b(p\s*m|pm|p m)\b/i, "PM").replace(/\b(a\s*m|am|a m)\b/i, "AM");
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!m) {
      const d = new Date(t);
      return isNaN(d.getTime()) ? null : d;
    }
    const [, dd, mm, yyyy, hhRaw, min, sec, ampm] = m;
    let hh = parseInt(hhRaw, 10);
    if (ampm) {
      const up = ampm.toUpperCase();
      if (up === "PM" && hh < 12) hh += 12;
      if (up === "AM" && hh === 12) hh = 0;
    }
    const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${min}:${sec}Z`;
    const date = new Date(iso);
    return isNaN(date.getTime()) ? null : date;
  } catch (e) {
    return null;
  }
}

export function initSim({ startMs = null, stepMs = 1000, speed = 1 } = {}) {
  if (_initialized && startMs == null) {
    _stepMs = stepMs;
    _speed = Number(speed) || 0;
    startTicker();
    notify();
    return;
  }
  if (startMs != null) _currentMs = startMs;
  _stepMs = stepMs;
  _speed = Number(speed) || 0;
  _initialized = true;
  startTicker();
  notify();
}

export function getSimMs() { return _currentMs; }
export function setSimMs(ms) { _currentMs = Number(ms) || _currentMs; notify(); }

export function setSpeed(newSpeed) {
  _speed = Number(newSpeed) || 0;
  startTicker();
  notify();
}
export function getSpeed() { return _speed; }

export function isRunning() { return _interval != null; }

export function subscribe(cb) {
  _subs.add(cb);
  setTimeout(() => {
    try { cb(_currentMs); } catch (e) { }
  }, 0);
  return () => _subs.delete(cb);
}

export function stopSim() {
  if (_interval) clearInterval(_interval);
  _interval = null;
  _initialized = false;
}
