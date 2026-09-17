window.RP = (function(){
  function bjParts(d){
    d = d || new Date();
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
    });
    var parts = {};
    fmt.formatToParts(d).forEach(function(p){ parts[p.type] = p.value; });
    var wdMap = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
    return {
      year: +parts.year, month: +parts.month, day: +parts.day,
      hour: +parts.hour, minute: +parts.minute, second: +parts.second,
      weekday: wdMap[parts.weekday],
      minutesOfDay: (+parts.hour) * 60 + (+parts.minute)
    };
  }
  function pad(n){ return String(n).padStart(2,'0'); }

  function marketStatus(p){
    var isWeekday = p.weekday >= 1 && p.weekday <= 5;
    var m = p.minutesOfDay;
    if (!isWeekday) return {label: '周末休市', live: false};
    if (m < 9*60+15) return {label: '盘前', live: false};
    if (m < 9*60+30) return {label: '集合竞价', live: false};
    if (m <= 11*60+30) return {label: '早盘交易中', live: true};
    if (m < 13*60) return {label: '午间休市', live: false};
    if (m <= 15*60) return {label: '午盘交易中', live: true};
    return {label: '已收盘', live: false};
  }

  function fmtMoney(n){
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return (n<0?'-':'') + '¥' + Math.abs(n).toFixed(2);
  }
  function fmtPct(n){
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return (n>=0?'+':'') + n.toFixed(2) + '%';
  }
  function pnlClass(n){
    if (typeof n !== 'number' || isNaN(n)) return 'flat';
    if (n > 0) return 'gain';
    if (n < 0) return 'loss';
    return 'flat';
  }
  function escapeHtml(s){
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  function fetchJson(path){
    return fetch(path + '?t=' + Date.now(), {cache: 'no-store'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .catch(function(){ return null; });
  }
  function bjTimeString(d){
    var p = bjParts(d);
    return p.year+'-'+pad(p.month)+'-'+pad(p.day)+' '+pad(p.hour)+':'+pad(p.minute)+' (北京时间)';
  }

  function renderDialogue(entries, bodyId, emptyMsg){
    var body = document.getElementById(bodyId);
    if (!body) return;
    if (!Array.isArray(entries) || !entries.length) {
      body.innerHTML = '<div class="dlg-empty">' + escapeHtml(emptyMsg || '暂无AI对话记录。') + '</div>';
      return;
    }
    var recent = entries.slice(-8).reverse();
    var html = '';
    recent.forEach(function(e){
      var side = e.speaker === '短线AI' ? 'short' : 'long';
      html += '<div class="dlg-row dlg-'+side+'">';
      html +=   '<div class="dlg-meta"><span class="dlg-speaker">'+ escapeHtml(e.speaker||'AI') +'</span><span class="dlg-time mono">'+ escapeHtml((e.date||'')+' '+(e.time||'')) +'</span></div>';
      html +=   '<div class="dlg-text">'+ escapeHtml(e.note||'') +'</div>';
      html += '</div>';
    });
    body.innerHTML = html;
  }

  function renderHeartbeatInto(elId, hb, defaultSource){
    var el = document.getElementById(elId);
    if (!el) return;
    if (!hb) return;
    var when = hb.lastRunAt ? new Date(hb.lastRunAt) : null;
    var whenStr = when ? bjTimeString(when) : '暂无数据';
    el.textContent = '最后更新：' + whenStr + (hb.lastRunNote ? (' · ' + hb.lastRunNote) : '') + '。行情数据来源：' + (hb.dataSource || defaultSource || '公开免费行情接口（新浪/东方财富等）') + '，可能存在延迟或中断；机构持仓线索来自季度定期报告等公开披露，存在滞后。';
  }

  return {
    bjParts: bjParts, pad: pad, marketStatus: marketStatus,
    fmtMoney: fmtMoney, fmtPct: fmtPct, pnlClass: pnlClass,
    escapeHtml: escapeHtml, fetchJson: fetchJson, bjTimeString: bjTimeString,
    renderDialogue: renderDialogue, renderHeartbeatInto: renderHeartbeatInto
  };
})();
