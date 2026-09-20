'use strict';
'require view';
'require rpc';
'require poll';
'require ui';

var callStatus = rpc.declare({ object: 'luci.lb3', method: 'status' });
var callSetConfig = rpc.declare({ object: 'luci.lb3', method: 'setConfig', params: [ 'mode', 'wan', 'wan2', 'wan3' ] });
var callService = rpc.declare({ object: 'luci.lb3', method: 'service', params: [ 'action' ] });
var previous = {};

function humanBytes(v) {
	v = Number(v) || 0;
	var units = [ 'B', 'KB', 'MB', 'GB', 'TB' ], i = 0;
	while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
	return (i ? v.toFixed(v >= 100 ? 0 : 1) : v.toFixed(0)) + ' ' + units[i];
}

function humanRate(v) { return humanBytes(v) + '/s'; }

function humanUptime(v) {
	v = Number(v) || 0;
	var d = Math.floor(v / 86400), h = Math.floor(v % 86400 / 3600), m = Math.floor(v % 3600 / 60);
	return (d ? d + '天 ' : '') + h + '小时 ' + m + '分';
}

function badge(text, ok) {
	return E('span', { 'class': 'lb3-badge ' + (ok ? 'lb3-ok' : 'lb3-bad') }, text);
}

function modeName(mode) {
	return ({ balance: '按权重均衡', force_wan: '强制主线 WAN', force_wan2: '强制 WAN2', force_wan3: '强制 WAN3' })[mode] || mode;
}

function style() {
	return E('style', {}, [
		'.lb3-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin:14px 0}',
		'.lb3-card{background:var(--background-color-high,#fff);border:1px solid rgba(127,127,127,.22);border-radius:12px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.04)}',
		'.lb3-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.lb3-head h3{margin:0}',
		'.lb3-badge{display:inline-block;border-radius:99px;padding:3px 9px;font-size:12px;font-weight:600}.lb3-ok{background:#dcfce7;color:#166534}.lb3-bad{background:#fee2e2;color:#991b1b}',
		'.lb3-stat{display:grid;grid-template-columns:1fr 1fr;gap:9px}.lb3-stat div{background:rgba(127,127,127,.08);border-radius:8px;padding:9px}.lb3-stat small{display:block;opacity:.65;margin-bottom:3px}.lb3-stat strong{font-size:14px}',
		'.lb3-bar{height:8px;background:rgba(127,127,127,.16);border-radius:99px;overflow:hidden;margin-top:10px}.lb3-bar i{display:block;height:100%;background:#1677ff;transition:width .4s}',
		'.lb3-controls{display:grid;grid-template-columns:2fr repeat(3,1fr);gap:12px;align-items:end}.lb3-controls label{display:block}.lb3-controls label span{display:block;margin-bottom:5px;font-size:12px;opacity:.7}.lb3-controls input,.lb3-controls select{width:100%}',
		'.lb3-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.lb3-note{font-size:12px;opacity:.7;margin-top:10px}',
		'@media(max-width:720px){.lb3-controls{grid-template-columns:1fr 1fr}.lb3-controls label:first-child{grid-column:1/-1}}'
	].join(''));
}

function card(iface, totals, timestamp) {
	var old = previous[iface.name], dt = old ? Math.max(1, timestamp - old.t) : 1;
	var rxRate = old ? Math.max(0, (Number(iface.rx_bytes) - old.rx) / dt) : 0;
	var txRate = old ? Math.max(0, (Number(iface.tx_bytes) - old.tx) / dt) : 0;
	previous[iface.name] = { rx: Number(iface.rx_bytes), tx: Number(iface.tx_bytes), t: timestamp };
	var share = totals.flows ? Number(iface.flows) * 100 / totals.flows : 0;
	return E('div', { 'class': 'lb3-card', 'id': 'lb3-' + iface.name }, [
		E('div', { 'class': 'lb3-head' }, [ E('h3', {}, iface.label), badge(iface.up && iface.route_ok ? '在线' : '异常', iface.up && iface.route_ok) ]),
		E('div', { 'class': 'lb3-stat' }, [
			E('div', {}, [ E('small', {}, '公网 IP'), E('strong', {}, iface.ip || '未获取') ]),
			E('div', {}, [ E('small', {}, '设备 / 路由表'), E('strong', {}, iface.device + ' / ' + iface.table) ]),
			E('div', {}, [ E('small', {}, '实时下载'), E('strong', {}, humanRate(rxRate)) ]),
			E('div', {}, [ E('small', {}, '实时上传'), E('strong', {}, humanRate(txRate)) ]),
			E('div', {}, [ E('small', {}, '新连接分配'), E('strong', {}, iface.flows + '（' + share.toFixed(1) + '%）') ]),
			E('div', {}, [ E('small', {}, '在线时长 / 权重'), E('strong', {}, humanUptime(iface.uptime) + ' / ' + iface.weight) ])
		]),
		E('div', { 'class': 'lb3-bar', 'title': '自本次规则加载后的新连接占比' }, E('i', { 'style': 'width:' + Math.min(100, share) + '%' }))
	]);
}

function update(data) {
	var list = data.interfaces || [], totals = { flows: 0 }, totalRx = 0, totalTx = 0, now = Number(data.timestamp) || 0;
	list.forEach(function(i) { totals.flows += Number(i.flows) || 0; });
	var cards = list.map(function(i) {
		var old = previous[i.name], dt = old ? Math.max(1, now - old.t) : 1;
		if (old) { totalRx += Math.max(0, (Number(i.rx_bytes) - old.rx) / dt); totalTx += Math.max(0, (Number(i.tx_bytes) - old.tx) / dt); }
		return card(i, totals, now);
	});
	var grid = document.getElementById('lb3-lines'); if (grid) grid.replaceChildren.apply(grid, cards);
	var state = document.getElementById('lb3-state'); if (state) state.replaceChildren(badge(data.active ? '负载均衡运行中' : '已停用 / 已回退主路由', data.active));
	var mode = document.getElementById('lb3-mode-now'); if (mode) mode.textContent = modeName(data.mode);
	var rate = document.getElementById('lb3-total-rate'); if (rate) rate.textContent = '↓ ' + humanRate(totalRx) + '  ↑ ' + humanRate(totalTx);
	var wd = document.getElementById('lb3-watchdog'); if (wd) wd.replaceChildren(badge(data.watchdog && data.watchdog.enabled ? '已启用（每2分钟）' : '未启用', data.watchdog && data.watchdog.enabled));
	var ev = document.getElementById('lb3-watchdog-event'); if (ev) ev.textContent = data.watchdog && data.watchdog.last_event ? data.watchdog.last_event : '暂无故障回退记录';
}

function perform(promise, okText) {
	ui.showModal('正在应用', [ E('p', { 'class': 'spinning' }, '请稍候…') ]);
	return promise.then(function(res) {
		ui.hideModal();
		if (!res || res.success !== true) throw new Error((res && res.error) || '操作失败');
		ui.addNotification(null, E('p', {}, okText), 'info');
		return callStatus().then(update);
	}).catch(function(err) { ui.hideModal(); ui.addNotification(null, E('p', {}, err.message || String(err)), 'error'); });
}

return view.extend({
	load: function() { return callStatus(); },
	render: function(data) {
		var w = {}; (data.interfaces || []).forEach(function(i) { w[i.name] = i.weight; });
		var root = E('div', { 'class': 'cbi-map' }, [ style(),
			E('div', { 'class': 'lb3-head' }, [ E('div', {}, [ E('h2', {}, '三线负载均衡'), E('div', { 'id': 'lb3-state' }) ]), E('strong', { 'id': 'lb3-total-rate' }, '计算实时速率中…') ]),
			E('div', { 'class': 'lb3-grid', 'id': 'lb3-lines' }),
			E('div', { 'class': 'lb3-card' }, [
				E('div', { 'class': 'lb3-head' }, [ E('h3', {}, '手动调整'), E('span', {}, [ '当前：', E('strong', { 'id': 'lb3-mode-now' }, modeName(data.mode)) ]) ]),
				E('div', { 'class': 'lb3-controls' }, [
					E('label', {}, [ E('span', {}, '运行模式'), E('select', { 'id': 'lb3-mode' }, [
						E('option', { value: 'balance', selected: data.mode === 'balance' }, '按权重均衡'),
						E('option', { value: 'force_wan', selected: data.mode === 'force_wan' }, '强制主线 WAN'),
						E('option', { value: 'force_wan2', selected: data.mode === 'force_wan2' }, '强制 WAN2'),
						E('option', { value: 'force_wan3', selected: data.mode === 'force_wan3' }, '强制 WAN3')
					]) ]),
					E('label', {}, [ E('span', {}, 'WAN 权重（0-10）'), E('input', { 'id': 'lb3-weight-wan', type: 'number', min: 0, max: 10, value: w.wan || 0 }) ]),
					E('label', {}, [ E('span', {}, 'WAN2 权重（0-10）'), E('input', { 'id': 'lb3-weight-wan2', type: 'number', min: 0, max: 10, value: w.wan2 || 0 }) ]),
					E('label', {}, [ E('span', {}, 'WAN3 权重（0-10）'), E('input', { 'id': 'lb3-weight-wan3', type: 'number', min: 0, max: 10, value: w.wan3 || 0 }) ])
				]),
				E('div', { 'class': 'lb3-actions' }, [
					E('button', { type: 'button', 'class': 'btn cbi-button cbi-button-apply', click: function() { return perform(callSetConfig(root.querySelector('#lb3-mode').value, Number(root.querySelector('#lb3-weight-wan').value), Number(root.querySelector('#lb3-weight-wan2').value), Number(root.querySelector('#lb3-weight-wan3').value)), '权重和模式已应用'); } }, '应用调整'),
					E('button', { type: 'button', 'class': 'btn cbi-button cbi-button-action', click: function() { return perform(callService('restart'), '负载均衡已重启'); } }, '重启负载均衡'),
					E('button', { type: 'button', 'class': 'btn cbi-button cbi-button-negative', click: function() { return perform(callService('stop'), '负载均衡已停用，当前使用主路由'); } }, '停用并回退主路由'),
					E('button', { type: 'button', 'class': 'btn cbi-button cbi-button-positive', click: function() { return perform(callService('start'), '负载均衡已启用'); } }, '重新启用')
				]),
				E('div', { 'class': 'lb3-note' }, '权重 0 表示不再向该线路分配新连接；调整仅影响新连接，现有连接会继续走原线路。强制模式保留各表的备用路由，线路故障时仍可切换。')
			]),
			E('div', { 'class': 'lb3-card' }, [
				E('div', { 'class': 'lb3-head' }, [ E('h3', {}, '断网看门狗'), E('span', { 'id': 'lb3-watchdog' }) ]),
				E('p', {}, '每 2 分钟检测公网连通性；连续失败时停止 lb3，让系统自动回退到主路由。'),
				E('code', { 'id': 'lb3-watchdog-event' }, '读取中…')
			])
		]);
		root.querySelector('#lb3-mode').value = data.mode || 'balance';
		update(data);
		poll.add(function() { return callStatus().then(update); }, 2);
		return root;
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
