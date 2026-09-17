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

  function prefersDark(){
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
    catch (e) { return false; }
  }

  function fmtSigned(n){
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return (n>=0?'+':'') + n.toFixed(2) + '%';
  }

  // Renders a two-series (portfolio vs benchmark) indexed line chart into containerId.
  // history: array of {date, portfolioPct, benchmarkPct}, ascending by date.
  function renderPerfChart(containerId, history, opts){
    opts = opts || {};
    var dark = prefersDark();
    var portfolioColor = dark ? (opts.portfolioColorDark || '#3987e5') : (opts.portfolioColorLight || '#2a78d6');
    var benchmarkColor = dark ? (opts.benchmarkColorDark || '#d95926') : (opts.benchmarkColorLight || '#eb6834');
    var portfolioLabel = opts.portfolioLabel || '组合';
    var benchmarkLabel = opts.benchmarkLabel || '基准';

    var container = document.getElementById(containerId);
    if (!container) return;

    var data = (Array.isArray(history) ? history : []).filter(function(d){
      return d && typeof d.portfolioPct === 'number' && typeof d.benchmarkPct === 'number';
    });

    if (!data.length) {
      container.innerHTML = '<div class="perf-empty">暂无数据，等待下一次调仓后开始记录。</div>';
      return;
    }

    var W = 640, H = 240, padL = 46, padR = 16, padT = 16, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var allVals = [0];
    data.forEach(function(d){ allVals.push(d.portfolioPct, d.benchmarkPct); });
    var minV = Math.min.apply(null, allVals);
    var maxV = Math.max.apply(null, allVals);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    var padV = (maxV - minV) * 0.12;
    minV -= padV; maxV += padV;

    function xAt(i){ return data.length === 1 ? padL + plotW/2 : padL + (i/(data.length-1)) * plotW; }
    function yAt(v){ return padT + (1 - (v - minV)/(maxV - minV)) * plotH; }
    function pathFor(key){
      return data.map(function(d,i){ return (i===0?'M':'L') + xAt(i).toFixed(2) + ',' + yAt(d[key]).toFixed(2); }).join(' ');
    }

    var ticks = [];
    var steps = 4;
    for (var s=0; s<=steps; s++){ ticks.push(minV + (maxV-minV) * s/steps); }

    var svgParts = [];
    svgParts.push('<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="收益率走势图">');

    ticks.forEach(function(t){
      var y = yAt(t);
      svgParts.push('<line x1="'+padL+'" y1="'+y.toFixed(2)+'" x2="'+(W-padR)+'" y2="'+y.toFixed(2)+'" stroke="var(--border)" stroke-width="1" />');
      svgParts.push('<text x="'+(padL-8)+'" y="'+(y+3).toFixed(2)+'" text-anchor="end" font-size="10" fill="var(--ink-dim)">'+ t.toFixed(1) +'%</text>');
    });

    svgParts.push('<text x="'+padL+'" y="'+(H-8)+'" text-anchor="start" font-size="10" fill="var(--ink-dim)">'+ escapeHtml(data[0].date) +'</text>');
    if (data.length > 1) {
      svgParts.push('<text x="'+(W-padR)+'" y="'+(H-8)+'" text-anchor="end" font-size="10" fill="var(--ink-dim)">'+ escapeHtml(data[data.length-1].date) +'</text>');
    }

    svgParts.push('<path d="'+pathFor('benchmarkPct')+'" fill="none" stroke="'+benchmarkColor+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />');
    svgParts.push('<path d="'+pathFor('portfolioPct')+'" fill="none" stroke="'+portfolioColor+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />');

    var lastI = data.length - 1;
    [['benchmarkPct', benchmarkColor], ['portfolioPct', portfolioColor]].forEach(function(pair){
      var x = xAt(lastI), y = yAt(data[lastI][pair[0]]);
      svgParts.push('<circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="6" fill="var(--surface)" />');
      svgParts.push('<circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="4" fill="'+pair[1]+'" />');
    });

    svgParts.push('<rect class="perf-hit" x="'+padL+'" y="'+padT+'" width="'+plotW+'" height="'+plotH+'" fill="transparent" tabindex="0" style="cursor:crosshair;" />');
    svgParts.push('<line class="perf-crosshair" x1="0" y1="'+padT+'" x2="0" y2="'+(H-padB)+'" stroke="var(--ink-dim)" stroke-width="1" opacity="0" />');
    svgParts.push('</svg>');

    var latest = data[lastI];
    var legendHtml = '<div class="perf-legend">'
      + '<span class="perf-legend-item"><span class="perf-legend-swatch" style="background:'+portfolioColor+'"></span>'+ escapeHtml(portfolioLabel) +'</span>'
      + '<span class="perf-legend-item"><span class="perf-legend-swatch" style="background:'+benchmarkColor+'"></span>'+ escapeHtml(benchmarkLabel) +'</span>'
      + '</div>';

    var summaryHtml = '<div class="perf-summary">最新（'+ escapeHtml(latest.date) +'）：'
      + '<b style="color:'+portfolioColor+'">'+ escapeHtml(portfolioLabel) +' ' + fmtSigned(latest.portfolioPct) + '</b> · '
      + '<b style="color:'+benchmarkColor+'">'+ escapeHtml(benchmarkLabel) +' ' + fmtSigned(latest.benchmarkPct) + '</b></div>';

    container.innerHTML = legendHtml
      + '<div class="perf-chart-wrap">' + svgParts.join('') + '<div class="perf-tooltip"></div></div>'
      + summaryHtml;

    var wrap = container.querySelector('.perf-chart-wrap');
    var svgEl = wrap.querySelector('svg');
    var hitRect = svgEl.querySelector('.perf-hit');
    var crosshair = svgEl.querySelector('.perf-crosshair');
    var tooltip = wrap.querySelector('.perf-tooltip');

    function showAt(i){
      i = Math.max(0, Math.min(data.length-1, i));
      var d = data[i];
      var x = xAt(i);
      crosshair.setAttribute('x1', x); crosshair.setAttribute('x2', x);
      crosshair.setAttribute('opacity', '1');
      tooltip.innerHTML = '';
      var dateEl = document.createElement('div'); dateEl.className = 'date'; dateEl.textContent = d.date;
      tooltip.appendChild(dateEl);
      [['portfolioPct', portfolioColor, portfolioLabel], ['benchmarkPct', benchmarkColor, benchmarkLabel]].forEach(function(t){
        var row = document.createElement('div'); row.className = 'row';
        var key = document.createElement('span'); key.className = 'key'; key.style.background = t[1];
        var val = document.createElement('span'); val.className = 'val'; val.textContent = fmtSigned(d[t[0]]);
        var lbl = document.createElement('span'); lbl.textContent = t[2];
        row.appendChild(key); row.appendChild(val); row.appendChild(lbl);
        tooltip.appendChild(row);
      });
      var pct = x / W;
      tooltip.style.left = (pct*100) + '%';
      tooltip.style.top = '0px';
      tooltip.style.opacity = '1';
      tooltip.style.transform = pct > 0.65 ? 'translate(-105%, 0)' : 'translate(8px, 0)';
    }
    function hide(){
      crosshair.setAttribute('opacity', '0');
      tooltip.style.opacity = '0';
    }
    function indexFromClientX(clientX){
      var rect = svgEl.getBoundingClientRect();
      var relX = (clientX - rect.left) / rect.width * W;
      var best = 0, bestDist = Infinity;
      for (var i=0;i<data.length;i++){
        var dist = Math.abs(xAt(i) - relX);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      return best;
    }
    hitRect.addEventListener('mousemove', function(evt){ showAt(indexFromClientX(evt.clientX)); });
    hitRect.addEventListener('mouseleave', hide);
    hitRect.addEventListener('touchstart', function(evt){ if (evt.touches[0]) showAt(indexFromClientX(evt.touches[0].clientX)); }, {passive:true});
    hitRect.addEventListener('touchmove', function(evt){ if (evt.touches[0]) showAt(indexFromClientX(evt.touches[0].clientX)); }, {passive:true});
    hitRect.addEventListener('touchend', hide);
    hitRect._idx = data.length - 1;
    hitRect.addEventListener('keydown', function(evt){
      if (evt.key === 'ArrowLeft') { hitRect._idx = Math.max(0, hitRect._idx-1); showAt(hitRect._idx); evt.preventDefault(); }
      else if (evt.key === 'ArrowRight') { hitRect._idx = Math.min(data.length-1, hitRect._idx+1); showAt(hitRect._idx); evt.preventDefault(); }
    });
    hitRect.addEventListener('focus', function(){ hitRect._idx = data.length - 1; showAt(hitRect._idx); });
    hitRect.addEventListener('blur', hide);
  }

  return {
    bjParts: bjParts, pad: pad, marketStatus: marketStatus,
    fmtMoney: fmtMoney, fmtPct: fmtPct, pnlClass: pnlClass,
    escapeHtml: escapeHtml, fetchJson: fetchJson, bjTimeString: bjTimeString,
    renderDialogue: renderDialogue, renderHeartbeatInto: renderHeartbeatInto,
    renderPerfChart: renderPerfChart
  };
})();
