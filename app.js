'use strict';

/* ========== 数据 ========== */
const KEY = 'notebook-app-v1';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT_PLATFORMS = [
  { id: 'taobao',  name: '淘宝',   short: '淘', color: '#ff5000', fg: '#fff' },
  { id: 'douyin',  name: '抖音',   short: '抖', color: '#161823', fg: '#fff' },
  { id: 'jd',      name: '京东',   short: '京', color: '#e1251b', fg: '#fff' },
  { id: 'pdd',     name: '拼多多', short: '拼', color: '#e02e24', fg: '#fff' },
  { id: 'amazon',  name: '亚马逊', short: '亚', color: '#ff9900', fg: '#111' },
  { id: 'zhuanzhuan', name: '转转', short: '转', color: '#ff4f3f', fg: '#fff' },
  { id: 'xianyu',  name: '闲鱼',   short: '鱼', color: '#ffda44', fg: '#111' },
  { id: 'offline', name: '线下',   short: '店', color: '#6b7280', fg: '#fff', offline: true },
];

// "想去的地方"：用待办类的结构，状态是 想去 / 去过了，再加自定义状态（比如"在计划"）
const PLACES_BOARD = () => ({ id: 'places', name: '想去的地方', type: 'todo', done: '去过了', undone: '想去', icon: '📍' });

function defaultState() {
  return {
    boards: [
      { id: 'shop', name: '购物', type: 'shop', done: '已购买', undone: '未购买', categories: ['必需', '非必需'] },
      { id: 'todo', name: '待办', type: 'todo', done: '已完成', undone: '未完成' },
      PLACES_BOARD(),
    ],
    seeded: ['places'],
    platforms: DEFAULT_PLATFORMS.map(p => ({ ...p })),
    items: [],
    current: 'shop',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.boards) && Array.isArray(s.items)) {
        // 给老数据补上后来新增的默认板块（每个只补一次，用户删了就不再加）
        s.seeded = s.seeded || [];
        if (!s.seeded.includes('places')) {
          if (!s.boards.some(b => b.id === 'places')) s.boards.push(PLACES_BOARD());
          s.seeded.push('places');
        }
        return s;
      }
    }
  } catch (e) { /* 读取失败就用默认数据 */ }
  return defaultState();
}
let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('保存失败：存储空间不可用'); }
}

const board = id => state.boards.find(b => b.id === id);
const platform = id => state.platforms.find(p => p.id === id);
const TYPE_NAME = { shop: '购物类', todo: '待办类' };

/* ========== 小工具 ========== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dlg = $('#dlg');

let toastTimer;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (undo ? ' <button type="button">撤销</button>' : '');
  t.hidden = false;
  if (undo) t.querySelector('button').onclick = () => { undo(); t.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

function openSheet(html, bind) {
  dlg.innerHTML = `<form method="dialog" class="sheet-in">${html}</form>`;
  bind && bind(dlg.querySelector('form'));
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

function chips(name, options, value) {
  return `<div class="chips" data-name="${name}">` + options.map(o =>
    `<button type="button" class="chip${o.value === value ? ' on' : ''}" data-v="${esc(o.value)}">${o.html ?? esc(o.label)}</button>`
  ).join('') + `</div>`;
}
function bindChips(root, onChange) {
  root.querySelectorAll('.chips[data-name]').forEach(g => {
    g.addEventListener('click', e => {
      const c = e.target.closest('.chip');
      if (!c || !c.dataset.v && c.dataset.v !== '') return;
      const wasOn = c.classList.contains('on');
      g.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      // 分类和平台可以再点一次取消
      if (!(wasOn && g.dataset.toggle)) c.classList.add('on');
      onChange && onChange(g.dataset.name, chipValue(g));
    });
  });
}
const chipValue = g => g.querySelector('.chip.on')?.dataset.v ?? '';

function platBadge(p) {
  return p ? `<span class="plat" style="background:${esc(p.color)};color:${esc(p.fg)}" title="${esc(p.name)}">${esc(p.short)}</span>` : '';
}

/* ========== 渲染 ========== */
function render() {
  if (!board(state.current)) state.current = state.boards[0].id;
  state.filters = state.filters || {};
  renderTabs();
  renderList();
  const n = (state.trash || []).length;
  $('#trashBtn').innerHTML = `🗑${n ? `<span class="badge">${n > 99 ? '99+' : n}</span>` : ''}`;
}

function renderTabs() {
  const open = id => state.items.filter(i => i.boardId === id && i.status !== 'done').length;
  $('#tabs').innerHTML =
    state.boards.map(b =>
      `<button class="tab${state.current === b.id ? ' active' : ''}" data-id="${b.id}">${esc(b.name)}${open(b.id) ? `<span class="count">${open(b.id)}</span>` : ''}</button>`
    ).join('') +
    `<button class="tab-add" id="addBoard" aria-label="添加板块">＋</button>`;
}

$('#tabs').addEventListener('click', e => {
  if (e.target.closest('#addBoard')) return editBoard(null);
  const t = e.target.closest('.tab');
  if (!t) return;
  state.current = t.dataset.id;
  save(); render();
});

function itemRow(it, showBoard) {
  const b = board(it.boardId);
  const done = it.status === 'done';
  const meta = [];
  if (showBoard && b) meta.push(`<span class="tag">${esc(b.name)}</span>`);
  if (b?.type === 'shop') {
    if (it.category) meta.push(`<span class="tag${it.category === (b.categories || [])[0] ? ' need' : ''}">${esc(it.category)}</span>`);
    const p = platform(it.platform);
    if (p?.offline && it.location) meta.push(`<span class="tag">📍${esc(it.location)}</span>`);
  }
  if (it.status === 'custom' && it.customStatus) meta.unshift(`<span class="tag custom">${esc(it.customStatus)}</span>`);
  if (it.note) meta.push(`<span class="note">${esc(it.note.split('\n')[0])}</span>`);
  return `<div class="item${done ? ' done' : ''}" data-id="${it.id}">
    <button class="check${done ? ' on' : ''}" data-act="toggle" aria-label="${done ? '标为未完成' : '标为完成'}">${done ? '✓' : ''}</button>
    <div class="body"><div class="title">${esc(it.title)}</div>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}</div>
    ${b?.type === 'shop' ? platBadge(platform(it.platform)) : ''}
  </div>`;
}

function renderList() {
  const el = $('#list');
  const b = board(state.current);
  const all = state.items.filter(i => i.boardId === b.id)
    .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
  // 状态筛选：全部 / 未完成 / 已完成 / 自定义状态
  const opts = [{ value: 'all', label: '全部' }, { value: 'undone', label: b.undone }, { value: 'done', label: b.done }, { value: 'custom', label: '自定义状态' }];
  let f = state.filters[b.id] || 'all';
  if (!opts.some(o => o.value === f)) f = 'all';
  const match = i => f === 'all' || (f === 'undone' ? i.status !== 'done' : i.status === f);
  const list = all.filter(match);
  const count = v => v === 'all' ? all.length : all.filter(i => v === 'undone' ? i.status !== 'done' : i.status === v).length;

  el.innerHTML = `<div class="board-head"><span>${all.length} 项</span><span><button class="link" id="dataBtn">备份</button><button class="link" id="editBoard">编辑板块</button></span></div>
    <div class="chips filter" id="filter">${opts.map(o =>
      `<button type="button" class="chip${o.value === f ? ' on' : ''}" data-v="${o.value}">${esc(o.label)}<span class="n">${count(o.value)}</span></button>`).join('')}</div>` +
    (list.length ? list.map(i => itemRow(i)).join('')
      : all.length ? `<div class="empty">这个筛选下没有事项</div>`
      : `<div class="empty"><b>＋</b>点右下角的按钮添加事项</div>`);
  $('#editBoard').onclick = () => editBoard(b);
  $('#dataBtn').onclick = dataSheet;
  $('#filter').onclick = e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    state.filters[b.id] = c.dataset.v;
    save(); renderList();
  };
}

$('#list').addEventListener('click', e => {
  const row = e.target.closest('.item');
  if (!row) return;
  const it = state.items.find(i => i.id === row.dataset.id);
  if (!it) return;
  if (e.target.closest('[data-act="toggle"]')) {
    const prev = { status: it.status, doneAt: it.doneAt };
    const b = board(it.boardId);
    if (it.status === 'done') { it.status = 'undone'; it.doneAt = null; }
    else { it.status = 'done'; it.doneAt = Date.now(); }
    save(); render();
    toast(`「${it.title}」${it.status === 'done' ? b.done : b.undone}`,
      () => { Object.assign(it, prev); save(); render(); });
    return;
  }
  editItem(it);
});

/* ========== 添加事项：第一步选类型 ========== */
$('#fab').onclick = () => {
  openSheet(`<h2>添加到哪个板块？</h2>
    <div class="types">${state.boards.map(b =>
      `<button type="button" class="type-card" data-id="${b.id}"><b>${b.icon || (b.type === 'shop' ? '🛒' : '☑︎')}</b>${esc(b.name)}<br><small>${TYPE_NAME[b.type]}</small></button>`
    ).join('')}</div>
    <div class="actions"><button class="btn" value="cancel">取消</button></div>`,
    f => f.querySelectorAll('.type-card').forEach(c => c.onclick = () =>
      editItem({ id: null, boardId: c.dataset.id, title: '', status: 'undone' })));
};

/* ========== 事项表单（新建 / 详情） ========== */
function editItem(src) {
  const it = { ...src };
  const b = board(it.boardId);
  const isNew = !src.id;
  if (isNew && b.type === 'shop') it.category = it.category ?? (b.categories || [])[1] ?? '';

  let fields = `<div class="field"><label>名称</label><input class="input" name="title" value="${esc(it.title)}" placeholder="${b.id === 'places' ? '想去哪里' : b.type === 'shop' ? '要买什么' : '要做什么'}" required autocomplete="off"></div>`;

  // 状态：所有板块都有"自定义"，新建和之后修改都能用
  fields += `<div class="field"><span class="lbl">状态</span>${chips('status', [{ value: 'undone', label: b.undone }, { value: 'done', label: b.done }, { value: 'custom', label: '自定义' }], it.status || 'undone')}
    <input class="input" name="customStatus" value="${esc(it.customStatus)}" placeholder="${b.type === 'shop' ? '比如：等降价、已下单在路上' : '写一下现在的进度，比如：等对方回复'}" style="margin-top:8px;${it.status === 'custom' ? '' : 'display:none'}"></div>`;
  if (b.type === 'shop') {
    fields += `<div class="field"><span class="lbl">分类</span>${chips('category', (b.categories || []).map(c => ({ value: c, label: c })), it.category || '').replace('class="chips"', 'class="chips" data-toggle="1"')}</div>`;
    fields += `<div class="field"><span class="lbl">在哪个平台</span>${chips('platform', state.platforms.map(p => ({ value: p.id, html: platBadge(p) + esc(p.name) })), it.platform || '').replace('class="chips"', 'class="chips" data-toggle="1"')}
      <input class="input" name="location" value="${esc(it.location)}" placeholder="线下位置，比如：楼下超市" style="margin-top:8px;${platform(it.platform)?.offline ? '' : 'display:none'}"></div>`;
  }
  fields += `<div class="field"><label>备注</label><textarea class="input" name="note" placeholder="可选">${esc(it.note)}</textarea></div>`;
  if (state.boards.filter(x => x.type === b.type).length > 1) {
    fields += `<div class="field"><label>所属板块</label><select class="input" name="boardId">${state.boards.filter(x => x.type === b.type).map(x =>
      `<option value="${x.id}"${x.id === b.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`;
  }

  openSheet(`<h2>${isNew ? '添加到「' + esc(b.name) + '」' : '事项详情'}</h2>${fields}
    <div class="actions">${isNew ? '' : '<button type="button" class="btn danger" data-act="del">删除</button>'}
    <button class="btn" value="cancel" formnovalidate>取消</button><button class="btn primary" value="ok">${isNew ? '添加' : '保存'}</button></div>`,
    f => {
      bindChips(f, (name, v) => {
        if (name === 'platform') f.location.style.display = platform(v)?.offline ? '' : 'none';
        if (name === 'status' && f.customStatus) {
          f.customStatus.style.display = v === 'custom' ? '' : 'none';
          if (v === 'custom') f.customStatus.focus();
        }
      });
      setTimeout(() => isNew && f.title.focus(), 50);
      const del = f.querySelector('[data-act="del"]');
      if (del) del.onclick = () => {
        trashItems([it.id]);
        dlg.close();
        toast('已移到回收站', () => { restoreItems([it.id]); });
      };
      f.addEventListener('submit', e => {
        if (e.submitter?.value !== 'ok') return;
        const val = n => chipValue(f.querySelector(`.chips[data-name="${n}"]`));
        const title = f.title.value.trim();
        if (!title) { e.preventDefault(); f.title.focus(); return; }
        const out = { ...it, title, note: f.note.value.trim() };
        out.status = val('status') || 'undone';
        if (b.type === 'shop') {
          out.category = val('category');
          out.platform = val('platform');
          out.location = platform(out.platform)?.offline ? f.location.value.trim() : '';
        }
        out.customStatus = out.status === 'custom' ? f.customStatus.value.trim() : '';
        if (out.status === 'custom' && !out.customStatus) out.status = 'undone';
        if (f.boardId) out.boardId = f.boardId.value;
        if (out.status === 'done' && src.status !== 'done') out.doneAt = Date.now();
        if (out.status !== 'done') out.doneAt = null;
        if (isNew) {
          out.id = uid(); out.createdAt = Date.now();
          state.items.push(out);
          state.current = out.boardId;
        } else {
          Object.assign(state.items.find(i => i.id === it.id), out);
        }
        save(); render();
        if (isNew) toast('已添加');
      });
    });
}

/* ========== 板块：新建 / 编辑（自定义名称、状态文字、分类、平台） ========== */
function editBoard(src) {
  const isNew = !src;
  const b = src ? JSON.parse(JSON.stringify(src)) : { id: null, name: '', type: 'todo', done: '已完成', undone: '未完成', categories: ['必需', '非必需'] };
  const plats = state.platforms.map(p => ({ ...p }));

  const draw = () => {
    const shop = b.type === 'shop';
    openSheet(`<h2>${isNew ? '新建板块' : '编辑板块'}</h2>
      <div class="field"><label>板块名称</label><input class="input" name="name" value="${esc(b.name)}" placeholder="比如：学习、旅行清单" required autocomplete="off"></div>
      ${isNew ? `<div class="field"><span class="lbl">板块类型</span>${chips('type', [{ value: 'todo', label: '待办类' }, { value: 'shop', label: '购物类' }], b.type)}</div>` : ''}
      <div class="field"><span class="lbl">状态文字</span><div class="row">
        <input class="input" name="undone" value="${esc(b.undone)}" placeholder="未完成时">
        <input class="input" name="done" value="${esc(b.done)}" placeholder="完成时"></div></div>
      ${shop ? `<div class="field"><span class="lbl">分类（第一个会高亮显示）</span>
        <div class="chips" id="cats">${(b.categories || []).map((c, i) => `<span class="chip">${esc(c)}<button type="button" class="link x" data-i="${i}" aria-label="删除">×</button></span>`).join('')}</div>
        <div class="row" style="margin-top:8px"><input class="input" id="newCat" placeholder="新分类"><button type="button" class="btn" id="addCat">添加</button></div></div>
      <div class="field"><span class="lbl">电商平台（所有购物板块共用）</span>
        <div class="chips" id="plats">${plats.map((p, i) => `<span class="chip">${platBadge(p)}${esc(p.name)}<button type="button" class="link x" data-i="${i}" aria-label="删除">×</button></span>`).join('')}</div>
        <div class="row" style="margin-top:8px"><input class="input" id="newPlat" placeholder="平台名称"><input class="input" id="newPlatColor" type="color" value="#3b6ef5" style="flex:none;width:48px;padding:4px"><button type="button" class="btn" id="addPlat">添加</button></div></div>` : ''}
      <div class="actions">${!isNew && state.boards.length > 1 ? '<button type="button" class="btn danger" data-act="del">删除板块</button>' : ''}
        <button class="btn" value="cancel" formnovalidate>取消</button><button class="btn primary" value="ok">${isNew ? '创建' : '保存'}</button></div>`,
      f => {
        const keep = () => { b.name = f.name.value; b.done = f.done.value; b.undone = f.undone.value; };
        bindChips(f, (name, v) => {
          if (name !== 'type') return;
          keep(); b.type = v;
          if (v === 'shop') { b.done = '已购买'; b.undone = '未购买'; } else { b.done = '已完成'; b.undone = '未完成'; }
          draw();
        });
        f.querySelectorAll('#cats .x').forEach(x => x.onclick = () => { keep(); b.categories.splice(+x.dataset.i, 1); draw(); });
        f.querySelectorAll('#plats .x').forEach(x => x.onclick = () => { keep(); plats.splice(+x.dataset.i, 1); draw(); });
        const addCat = f.querySelector('#addCat');
        if (addCat) addCat.onclick = () => {
          const v = f.querySelector('#newCat').value.trim();
          if (v && !b.categories.includes(v)) { keep(); b.categories.push(v); draw(); }
        };
        const addPlat = f.querySelector('#addPlat');
        if (addPlat) addPlat.onclick = () => {
          const v = f.querySelector('#newPlat').value.trim();
          if (!v) return;
          keep();
          plats.push({ id: uid(), name: v, short: v[0], color: f.querySelector('#newPlatColor').value, fg: '#fff' });
          draw();
        };
        const del = f.querySelector('[data-act="del"]');
        if (del) del.onclick = () => {
          const n = state.items.filter(i => i.boardId === b.id).length;
          if (!confirm(`删除板块「${b.name}」？${n ? `里面的 ${n} 个事项会放进回收站，恢复时板块也会回来。` : ''}`)) return;
          trashItems(state.items.filter(i => i.boardId === b.id).map(i => i.id));
          state.boards = state.boards.filter(x => x.id !== b.id);
          save(); render(); dlg.close();
        };
        f.addEventListener('submit', e => {
          if (e.submitter?.value !== 'ok') return;
          keep();
          b.name = b.name.trim();
          if (!b.name) { e.preventDefault(); f.name.focus(); return; }
          b.done = b.done.trim() || (b.type === 'shop' ? '已购买' : '已完成');
          b.undone = b.undone.trim() || (b.type === 'shop' ? '未购买' : '未完成');
          if (b.type !== 'shop') delete b.categories;
          if (isNew) { b.id = uid(); state.boards.push(b); state.current = b.id; }
          else Object.assign(board(b.id), b);
          if (b.type === 'shop') state.platforms = plats;
          save(); render();
        });
      });
  };
  draw();
}

/* ========== 回收站：删除的事项先放这里，可以恢复 ========== */
function trashItems(ids) {
  state.trash = state.trash || [];
  const set = new Set(ids);
  for (const it of state.items.filter(i => set.has(i.id))) {
    const b = board(it.boardId);
    state.trash.unshift({ ...it, deletedAt: Date.now(), boardSnap: b ? { ...b } : null });
  }
  state.items = state.items.filter(i => !set.has(i.id));
  save(); render();
}

function restoreItems(ids) {
  const set = new Set(ids);
  const back = (state.trash || []).filter(t => set.has(t.id));
  for (const t of back) {
    const { deletedAt, boardSnap, ...it } = t;
    // 板块被删了就把板块也恢复回来
    if (!board(it.boardId)) {
      if (boardSnap) state.boards.push({ ...boardSnap });
      else it.boardId = state.boards[0].id;
    }
    if (!state.items.some(i => i.id === it.id)) state.items.push(it);
  }
  state.trash = state.trash.filter(t => !set.has(t.id));
  save(); render();
  return back.length;
}

function trashSheet() {
  const list = state.trash || [];
  const when = ts => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  openSheet(`<h2>回收站</h2>
    ${list.length ? `<div class="trash-list">${list.map(t => `
      <div class="trash-row" data-id="${t.id}">
        <div class="body"><div class="title">${esc(t.title)}</div>
          <div class="meta">${esc((board(t.boardId) || t.boardSnap || {}).name || '')} · ${when(t.deletedAt)} 删除</div></div>
        <button type="button" class="btn small" data-act="restore">恢复</button>
        <button type="button" class="link x" data-act="purge" aria-label="彻底删除">×</button>
      </div>`).join('')}</div>`
      : `<div class="empty" style="padding:30px 0">回收站是空的</div>`}
    <div class="actions">${list.length ? '<button type="button" class="btn danger" data-act="empty">清空回收站</button><button type="button" class="btn" data-act="all">全部恢复</button>' : ''}
      <button class="btn" value="cancel">关闭</button></div>`,
    f => {
      f.querySelectorAll('.trash-row').forEach(row => {
        row.querySelector('[data-act="restore"]').onclick = () => { restoreItems([row.dataset.id]); toast('已恢复'); trashSheet(); };
        row.querySelector('[data-act="purge"]').onclick = () => {
          if (!confirm('彻底删除后就找不回来了，确定吗？')) return;
          state.trash = state.trash.filter(t => t.id !== row.dataset.id);
          save(); render(); trashSheet();
        };
      });
      const all = f.querySelector('[data-act="all"]');
      if (all) all.onclick = () => { const n = restoreItems(list.map(t => t.id)); toast(`已恢复 ${n} 条`); trashSheet(); };
      const empty = f.querySelector('[data-act="empty"]');
      if (empty) empty.onclick = () => {
        if (!confirm(`彻底删除回收站里的 ${list.length} 条？删除后就找不回来了。`)) return;
        state.trash = [];
        save(); render(); trashSheet();
      };
    });
}

$('#trashBtn').onclick = trashSheet;

/* ========== 备份：导出成文件 / 从文件导入（用来在电脑和手机之间搬数据） ========== */
function dataSheet() {
  const n = state.items.length;
  openSheet(`<h2>备份</h2>
    <p style="margin-top:0">导出会生成一个备份文件，可以发到另一台设备上再导入。导入是<b>合并</b>：已经有的事项不会重复，也不会被删掉。</p>
    <div class="field"><button type="button" class="btn primary" id="exp" style="width:100%">导出备份（${n} 条事项）</button></div>
    <div class="field"><button type="button" class="btn" id="imp" style="width:100%">从备份文件导入</button>
      <input type="file" id="impFile" accept=".json,application/json" hidden></div>
    <div class="actions"><button class="btn" value="cancel">关闭</button></div>`,
    f => {
      f.querySelector('#exp').onclick = async () => {
        const d = new Date();
        const name = `记事本备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
        const data = JSON.stringify({ app: 'notebook', version: 1, exportedAt: d.toISOString(), ...state }, null, 1);
        const file = new File([data], name, { type: 'application/json' });
        // 手机上优先用系统分享（可以直接发到微信等）
        if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
          try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast('已导出：' + name);
      };
      const input = f.querySelector('#impFile');
      f.querySelector('#imp').onclick = () => input.click();
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        let d;
        try { d = JSON.parse(await file.text()); } catch (e) { return toast('这个文件读不出来'); }
        if (!d || !Array.isArray(d.boards) || !Array.isArray(d.items)) return toast('这不是记事本的备份文件');
        const r = mergeData(d);
        save(); render(); dlg.close();
        toast(`导入完成：新增 ${r.items} 条事项${r.boards ? `、${r.boards} 个板块` : ''}`);
      };
    });
}

function mergeData(d) {
  const r = { items: 0, boards: 0 };
  for (const b of d.boards) if (b && b.id && !board(b.id)) { state.boards.push(b); r.boards++; }
  for (const p of d.platforms || []) if (p && p.id && !platform(p.id)) state.platforms.push(p);
  const have = new Set(state.items.map(i => i.id));
  for (const i of d.items) if (i && i.id && !have.has(i.id) && board(i.boardId)) { state.items.push(i); r.items++; }
  state.imported = [...new Set([...(state.imported || []), ...(d.imported || [])])];
  state.seeded = [...new Set([...(state.seeded || []), ...(d.seeded || [])])];
  return r;
}

/* ========== 导入清单（app 目录里有 import.json 时，打开会询问导入一次） ========== */
async function checkImport() {
  let data;
  try {
    const res = await fetch('import.json', { cache: 'no-store' });
    if (!res.ok) return;
    data = await res.json();
  } catch (e) { return; }
  state.imported = state.imported || [];
  if (!data?.id || state.imported.includes(data.id)) return;
  const target = type => state.boards.find(b => b.id === type && b.type === type) || state.boards.find(b => b.type === type);
  const plan = ['shop', 'todo'].map(type => ({ type, board: target(type), list: data[type] || [] })).filter(p => p.list.length);
  const missing = plan.filter(p => !p.board);
  const ok = plan.filter(p => p.board);
  if (!ok.length) return;
  openSheet(`<h2>导入清单</h2>
    <p>发现「${esc(data.title || '清单')}」：${ok.map(p => `${esc(p.board.name)} ${p.list.length} 条`).join('，')}。状态都是默认的，你之后自己改。</p>
    ${missing.length ? `<p style="color:var(--muted)">没有${missing.map(p => TYPE_NAME[p.type]).join('、')}板块，这部分会跳过。</p>` : ''}
    <div class="actions"><button class="btn" value="later">以后再说</button><button class="btn" value="skip">不导入</button><button class="btn primary" value="ok">导入</button></div>`,
    f => f.addEventListener('submit', e => {
      const v = e.submitter?.value;
      if (v === 'later') return;
      if (v === 'ok') {
        let t = Date.now();
        for (const p of ok) for (const x of p.list) {
          state.items.push({
            id: uid(), boardId: p.board.id, title: String(x.title || '').trim(), note: x.note || '',
            status: 'undone', category: '', platform: '', createdAt: t--,
          });
        }
        state.current = ok[0].board.id;
        toast(`已导入 ${ok.reduce((n, p) => n + p.list.length, 0)} 条`);
      }
      state.imported.push(data.id);
      save(); render();
    }));
}

/* ========== 启动 ========== */
render();
checkImport();

// 别的标签页改了数据时同步过来
window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); render(); } });

// 离线支持
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
