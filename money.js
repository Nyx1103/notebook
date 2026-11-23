'use strict';
/* ========== 金额与汇率（只在本地计算，价格不会发送到任何地方） ========== */

const CURRENCIES = [
  { code: 'CNY', sym: '¥',   name: '人民币' },
  { code: 'USD', sym: '$',   name: '美元' },
  { code: 'EUR', sym: '€',   name: '欧元' },
  { code: 'JPY', sym: 'JP¥', name: '日元' },
  { code: 'HKD', sym: 'HK$', name: '港币' },
  { code: 'GBP', sym: '£',   name: '英镑' },
  { code: 'KRW', sym: '₩',   name: '韩元' },
  { code: 'TWD', sym: 'NT$', name: '新台币' },
  { code: 'AUD', sym: 'A$',  name: '澳元' },
  { code: 'CAD', sym: 'C$',  name: '加元' },
  { code: 'CHF', sym: 'CHF ', name: '瑞士法郎' },
  { code: 'SGD', sym: 'S$',  name: '新加坡元' },
  { code: 'THB', sym: '฿',   name: '泰铢' },
];
const curInfo = code => CURRENCIES.find(c => c.code === code) || { code, sym: code + ' ', name: code };

// 金额一律用"分"（整数，最小单位的 1/100）保存和相加，避免浮点误差
function parseMoney(str) {
  const s = String(str ?? '').trim().replace(/[,，\s]/g, '');
  if (!s) return null;
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
}

function moneyText(cents) {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const yuan = Math.floor(abs / 100), fen = abs % 100;
  const int = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + int + (fen ? '.' + String(fen).padStart(2, '0') : '');
}

const fmtMoney = (cents, code) => curInfo(code).sym + moneyText(cents);

/* ---------- 汇率：在线获取 + 本地缓存 ---------- */
const RATE_KEY = 'notebook-rates-v1';
const RATE_URL = 'https://open.er-api.com/v6/latest/CNY'; // 免费、无需密钥；请求里不带任何个人数据
const RATE_MAX_AGE = 12 * 3600 * 1000;

const rates = {
  data: null,        // { rates: {CNY:1, USD:0.14, ...}, updated: 毫秒, fetchedAt: 毫秒 }
  live: false,       // 这次打开 app 后是否成功在线更新过
  loading: false,
  error: false,
};

try { rates.data = JSON.parse(localStorage.getItem(RATE_KEY) || 'null'); } catch (e) { rates.data = null; }

async function refreshRates(force) {
  if (rates.loading) return;
  if (!force && rates.live) return;
  if (!force && rates.data && Date.now() - rates.data.fetchedAt < RATE_MAX_AGE && !navigator.onLine) return;
  rates.loading = true;
  try {
    const res = await fetch(RATE_URL, { cache: 'no-store' });
    const j = await res.json();
    if (j.result !== 'success' || !j.rates) throw new Error('bad rates');
    rates.data = { rates: j.rates, updated: (j.time_last_update_unix || 0) * 1000 || Date.now(), fetchedAt: Date.now() };
    rates.live = true; rates.error = false;
    try { localStorage.setItem(RATE_KEY, JSON.stringify(rates.data)); } catch (e) { /* 存不下也能用这次的 */ }
  } catch (e) {
    rates.error = true;
  } finally {
    rates.loading = false;
  }
}

// 把一笔"分"从 from 换成 to；没有汇率时返回 null
function convertCents(cents, from, to) {
  if (from === to) return cents;
  const r = rates.data?.rates;
  if (!r || !r[from] || !r[to]) return null;
  return Math.round(cents / r[from] * r[to]);
}

function rateStatusText() {
  const d = rates.data;
  const when = t => { const x = new Date(t); return `${x.getMonth() + 1}月${x.getDate()}日 ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  if (rates.loading && !d) return '正在获取汇率…';
  if (!d) return '汇率暂不可用：不同币种分别显示小计';
  if (rates.live) return `在线汇率 · 更新于 ${when(d.updated)}`;
  return `离线 · 使用缓存汇率（${when(d.updated)}）`;
}
