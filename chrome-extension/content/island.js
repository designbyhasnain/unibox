const Island = (() => {
  let host, shadow, islandEl;

  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0;font-family:'SF Mono','Fira Code','Cascadia Code','Consolas',monospace}
    #island{background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);overflow:hidden;position:relative;
      transition:width 0.5s cubic-bezier(0.32,0.72,0,1),max-height 0.5s cubic-bezier(0.32,0.72,0,1),border-radius 0.4s;
      box-shadow:0 4px 40px rgba(0,0,0,0.8),0 0 0 0.5px rgba(255,255,255,0.06);pointer-events:all;cursor:default}
    .s-idle{width:160px;max-height:32px;border-radius:20px}
    .s-scan{width:260px;max-height:32px;border-radius:20px}
    .s-hot,.s-partial,.s-exists,.s-low{width:380px;max-height:800px;border-radius:12px}
    .pill{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:6px;transition:opacity 0.2s}
    .pill-dot{width:6px;height:6px;border-radius:50%;background:#00ff41;animation:pulse 2.5s ease-in-out infinite}
    .pill-label{font-size:10px;font-weight:500;color:rgba(255,255,255,0.4);letter-spacing:0.1em;text-transform:uppercase}
    #island:not(.s-idle) .pill{opacity:0;pointer-events:none}
    .scan{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;opacity:0;pointer-events:none;transition:opacity 0.2s}
    .s-scan .scan{opacity:1;pointer-events:all}.s-scan .pill{opacity:0}
    .scan-bars{display:flex;gap:2px;align-items:center}
    .scan-bar{width:3px;height:10px;background:#00ff41;animation:barPulse 0.8s ease-in-out infinite}
    .scan-bar:nth-child(2){animation-delay:0.1s;height:14px}.scan-bar:nth-child(3){animation-delay:0.2s;height:8px}.scan-bar:nth-child(4){animation-delay:0.3s;height:12px}
    .scan-text{font-size:9px;color:rgba(255,255,255,0.35);letter-spacing:0.08em;text-transform:uppercase}
    .expanded{opacity:0;max-height:0;overflow-y:auto;padding:0;transition:opacity 0.25s 0.15s,max-height 0.4s,padding 0.3s;pointer-events:none}
    .s-hot .expanded,.s-partial .expanded,.s-exists .expanded,.s-low .expanded{opacity:1;max-height:600px;padding:14px 16px 16px;pointer-events:all}
    .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .badge{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase}
    .green{color:#00ff41}.red{color:#ff3333}.amber{color:#ffb700}.blue{color:#60a5fa}.purple{color:#a78bfa}.dim{color:rgba(255,255,255,0.25)}
    .rank{font-size:9px;font-weight:600;border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:2px 8px;color:rgba(255,255,255,0.4);letter-spacing:0.05em}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:10px}
    .grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-bottom:10px}
    .cell{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:6px 8px}
    .cell-sm{padding:4px 6px}
    .cl{font-size:7px;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px}
    .cv{font-size:10px;font-weight:500;color:rgba(255,255,255,0.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cv-lg{font-size:14px;font-weight:700}
    .found{color:#00ff41}.missing{color:rgba(255,255,255,0.15);font-style:italic}.accent{color:#818cf8}
    .section{font-size:7.5px;color:rgba(255,255,255,0.15);text-transform:uppercase;letter-spacing:0.12em;margin:8px 0 4px;border-top:1px solid rgba(255,255,255,0.04);padding-top:6px}
    .price-box{background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:6px;padding:8px 10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
    .pr-label{font-size:7px;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.08em}
    .pr-val{font-size:10px;font-weight:600;color:#818cf8;margin-top:1px}
    .pr-suggest{font-size:12px;font-weight:700;color:#00ff41;margin-top:1px}
    .social-row{display:flex;gap:4px;margin-bottom:10px}
    .social-pill{font-size:8px;font-weight:600;color:rgba(255,255,255,0.35);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:3px 8px;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;text-decoration:none;transition:border-color 0.15s}
    .social-pill:hover{border-color:rgba(255,255,255,0.3);color:rgba(255,255,255,0.6)}
    .fb-row{display:flex;align-items:center;gap:7px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:6px;padding:6px 10px;margin-bottom:10px}
    .fb-dot{width:5px;height:5px;border-radius:50%;background:#60a5fa;animation:pulse 1.2s ease-in-out infinite;flex-shrink:0}
    .fb-text{font-size:9px;color:#60a5fa;letter-spacing:0.05em;text-transform:uppercase}
    .fb-row.ok{background:rgba(0,255,65,0.04);border-color:rgba(0,255,65,0.15)}
    .fb-row.ok .fb-dot{background:#00ff41;animation:none}.fb-row.ok .fb-text{color:#00ff41}
    .email-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:8px}
    .email-dir{width:12px;font-size:7px;font-weight:700}.email-dir.sent{color:#60a5fa}.email-dir.recv{color:#00ff41}
    .email-subj{flex:1;color:rgba(255,255,255,0.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 6px}
    .email-age{color:rgba(255,255,255,0.15);font-size:7px;white-space:nowrap}
    .proj-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:8px}
    .proj-name{flex:1;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .proj-status{font-size:7px;padding:1px 5px;border-radius:3px;border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.3);margin-left:4px}
    .proj-val{color:#00ff41;font-weight:600;margin-left:6px;white-space:nowrap}
    .follow-up-bar{border-radius:6px;padding:6px 10px;margin-bottom:10px;font-size:9px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase}
    .fu-reply{background:rgba(0,255,65,0.08);border:1px solid rgba(0,255,65,0.2);color:#00ff41}
    .fu-followup{background:rgba(255,183,0,0.08);border:1px solid rgba(255,183,0,0.2);color:#ffb700}
    .fu-cold{background:rgba(255,51,51,0.08);border:1px solid rgba(255,51,51,0.2);color:#ff3333}
    .fu-active{background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);color:#60a5fa}
    .fu-dormant{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.2)}
    .btn-row{display:flex;gap:5px}
    .btn-primary{flex:2;background:transparent;color:#00ff41;border:1px solid #00ff41;border-radius:6px;padding:8px 10px;font-size:9px;font-weight:600;cursor:pointer;letter-spacing:0.08em;text-transform:uppercase;font-family:inherit;transition:background 0.15s,transform 0.1s}
    .btn-primary:hover{background:rgba(0,255,65,0.1)}.btn-primary:active{transform:scale(0.96)}
    .btn-ghost{flex:1;background:transparent;color:rgba(255,255,255,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 8px;font-size:9px;cursor:pointer;letter-spacing:0.06em;text-transform:uppercase;font-family:inherit;transition:background 0.15s}
    .btn-ghost:hover{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5)}
    .btn-amber{border-color:#ffb700;color:#ffb700}.btn-amber:hover{background:rgba(255,183,0,0.1)}
    .btn-danger{border-color:#ff3333;color:#ff3333}.btn-danger:hover{background:rgba(255,51,51,0.1)}
    .dismiss{position:absolute;top:10px;right:10px;width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.2);font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;transition:background 0.15s}
    .dismiss:hover{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.5)}
    .state-label{font-size:7px;color:rgba(255,255,255,0.08);letter-spacing:0.1em;text-transform:uppercase;margin-top:8px}
    @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.85)}50%{opacity:1;transform:scale(1)}}
    @keyframes barPulse{0%,100%{opacity:0.2;transform:scaleY(0.5)}50%{opacity:1;transform:scaleY(1)}}
  `;

  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + '...' : (s || ''); }
  function fmtMoney(v) { return v ? '$' + Number(v).toLocaleString() : '$0'; }

  function mount() {
    host = document.createElement('div');
    host.id = 'unibox-island-host';
    host.style.cssText = 'position:fixed!important;top:8px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;pointer-events:none!important;';
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
    islandEl = document.createElement('div');
    islandEl.id = 'island';
    islandEl.className = 's-idle';
    islandEl.innerHTML = '<div class="pill"><div class="pill-dot"></div><div class="pill-label">Unibox.os</div></div><div class="scan"><div class="scan-bars"><div class="scan-bar"></div><div class="scan-bar"></div><div class="scan-bar"></div><div class="scan-bar"></div></div><div class="scan-text" id="scan-text">recovering contact...</div></div><div class="expanded" id="expanded"></div>';
    shadow.appendChild(islandEl);
    islandEl.addEventListener('click', function(e) {
      if (e.target === islandEl && islandEl.className !== 's-idle' && islandEl.className !== 's-scan') contract();
    });
  }

  function setState(s) { islandEl.className = 's-' + s; }

  function scanning() {
    setState('scan');
    var steps = ['detecting page type...', 'scraping contact data...', 'extracting pricing...', 'querying crm database...'];
    var i = 0;
    var el = shadow.getElementById('scan-text');
    return new Promise(function(resolve) {
      var iv = setInterval(function() {
        if (el) el.textContent = steps[i % steps.length];
        i++;
        if (i >= steps.length) { clearInterval(iv); setTimeout(resolve, 300); }
      }, 450);
    });
  }

  function contract() {
    setState('idle');
    var ev = shadow.getElementById('expanded');
    if (ev) ev.innerHTML = '';
  }

  function _bind() {
    shadow.querySelectorAll('.dismiss,.btn-skip').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); contract(); }); });
  }

  function _bindCommit(data) {
    var btn = shadow.querySelector('.btn-commit');
    if (btn) btn.addEventListener('click', function() {
      chrome.runtime.sendMessage({ type: 'ADD_TO_CRM', data: data });
      btn.textContent = '■ COMMITTED';
      btn.style.borderColor = '#00ff41';
      btn.style.color = '#00ff41';
      btn.style.background = 'rgba(0,255,65,0.1)';
      setTimeout(contract, 1500);
    });
  }

  function showHot(data) {
    var ev = shadow.getElementById('expanded');
    var p = data.pricing;
    var social = data.social || {};
    var socials = '';
    if (social.instagram) socials += '<a href="' + social.instagram + '" target="_blank" class="social-pill">IG</a>';
    if (social.facebook) socials += '<a href="' + social.facebook + '" target="_blank" class="social-pill">FB</a>';
    if (social.youtube) socials += '<a href="' + social.youtube + '" target="_blank" class="social-pill">YT</a>';
    if (social.vimeo) socials += '<a href="' + social.vimeo + '" target="_blank" class="social-pill">VM</a>';
    socials += '<a href="https://' + esc(data.domain) + '" target="_blank" class="social-pill">WEB</a>';

    ev.innerHTML = '<button class="dismiss">×</button>' +
      '<div class="hdr"><div class="badge"><span class="green">■</span> HOT_LEAD</div><div class="rank">RANK: ' + data.score.score + '</div></div>' +
      '<div class="grid">' +
        '<div class="cell"><div class="cl">Subject</div><div class="cv">' + esc(data.name) + '</div></div>' +
        '<div class="cell"><div class="cl">Loc</div><div class="cv accent">' + esc(data.location || '—') + '</div></div>' +
        '<div class="cell"><div class="cl">Email</div><div class="cv ' + (data.email ? 'found' : 'missing') + '">' + (data.email ? esc(trunc(data.email, 25)) : 'NULL_PTR') + '</div></div>' +
        '<div class="cell"><div class="cl">Comms</div><div class="cv ' + (data.phone ? 'found' : 'missing') + '">' + (data.phone ? esc(data.phone) : 'NULL_PTR') + '</div></div>' +
      '</div>' +
      (p ? '<div class="price-box"><div><div class="pr-label">Their Price</div><div class="pr-val">' + p.display + '</div></div><div style="text-align:right"><div class="pr-label">Our Price</div><div class="pr-suggest">' + (p.suggestedRange || p.suggestedDisplay) + '</div></div></div>' +
      '<div class="grid"><div class="cell cell-sm"><div class="cl">Tier</div><div class="cv ' + (p.affordability === 'HIGH' || p.affordability === 'VERY_HIGH' ? 'found' : 'accent') + '">' + (p.tier || '') + '</div></div><div class="cell cell-sm"><div class="cl">Can Afford</div><div class="cv ' + (p.affordability === 'HIGH' || p.affordability === 'VERY_HIGH' ? 'found' : 'accent') + '">' + (p.affordability || '') + '</div></div></div>' +
      '<div style="font-size:7px;color:rgba(255,255,255,0.2);margin:4px 0 8px;letter-spacing:0.03em">' + esc(p.confidence || '') + '</div>' +
      (p.packages ? '<div class="section">Suggested Packages (' + (p.editPercent || 15) + '%)</div>' + p.packages.map(function(pk) { return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.03)"><span style="font-size:8px;color:rgba(255,255,255,0.3);letter-spacing:0.05em">' + pk.name + '</span><span style="font-size:9px;font-weight:700;color:#00ff41">$' + pk.price + '</span></div>'; }).join('') : '') : '') +
      '<div class="social-row">' + socials + '</div>' +
      '<div class="btn-row"><button class="btn-ghost btn-skip">Skip</button><button class="btn-primary btn-commit">Commit to CRM</button></div>' +
      '<div class="state-label">03 // TARGET_FOUND_HIGH</div>';
    setState('hot');
    _bind();
    _bindCommit(data);
  }

  function showPartial(data, fbCallback, igCallback) {
    var ev = shadow.getElementById('expanded');
    ev.innerHTML = '<button class="dismiss">×</button>' +
      '<div class="hdr"><div class="badge"><span class="amber">■</span> WARM // INCOMPLETE</div><div class="rank">RANK: ' + data.score.score + '</div></div>' +
      '<div class="grid">' +
        '<div class="cell"><div class="cl">Subject</div><div class="cv">' + esc(data.name) + '</div></div>' +
        '<div class="cell"><div class="cl">Loc</div><div class="cv accent">' + esc(data.location || '—') + '</div></div>' +
        '<div class="cell"><div class="cl">Email</div><div class="cv missing" id="email-cell">NULL_PTR</div></div>' +
        '<div class="cell"><div class="cl">Comms</div><div class="cv missing" id="phone-cell">NULL_PTR</div></div>' +
      '</div>' +
      '<div class="fb-row" id="fb-row"><div class="fb-dot"></div><div class="fb-text">■ extracting from social...</div></div>' +
      '<div class="btn-row"><button class="btn-ghost btn-skip">Skip</button><button class="btn-primary btn-amber btn-commit">Commit Partial</button></div>' +
      '<div class="state-label">04 // TARGET_PARTIAL</div>';
    setState('partial');
    _bind();
    _bindCommit(data);
    if (fbCallback) fbCallback();
    if (igCallback) igCallback();
  }

  function showExists(lead) {
    var ev = shadow.getElementById('expanded');

    // Follow-up status bar
    var fuClass = 'fu-active';
    var fuText = '● ACTIVE';
    if (lead.followUpStatus === 'REPLY_ASAP') { fuClass = 'fu-reply'; fuText = '▲ REPLY ASAP — they replied ' + lead.daysSinceLastEmail + 'd ago'; }
    else if (lead.followUpStatus === 'REPLY_SOON') { fuClass = 'fu-reply'; fuText = '● REPLY SOON — they replied ' + lead.daysSinceLastEmail + 'd ago'; }
    else if (lead.followUpStatus === 'FOLLOW_UP') { fuClass = 'fu-followup'; fuText = '▲ FOLLOW UP — last sent ' + lead.daysSinceLastEmail + 'd ago'; }
    else if (lead.followUpStatus === 'GOING_COLD') { fuClass = 'fu-cold'; fuText = '▲ GOING COLD — ' + lead.daysSinceLastEmail + 'd since last email'; }
    else if (lead.followUpStatus === 'DORMANT') { fuClass = 'fu-dormant'; fuText = '○ DORMANT — ' + lead.daysSinceLastEmail + 'd inactive'; }
    else if (lead.followUpStatus === 'ACTIVE') { fuClass = 'fu-active'; fuText = '● ACTIVE — last email ' + lead.daysSinceLastEmail + 'd ago'; }

    // Recent emails list
    var emailsHtml = '';
    if (lead.recentEmails && lead.recentEmails.length > 0) {
      lead.recentEmails.forEach(function(e) {
        var dirClass = e.direction === 'SENT' ? 'sent' : 'recv';
        var dirLabel = e.direction === 'SENT' ? '→' : '←';
        emailsHtml += '<div class="email-row"><span class="email-dir ' + dirClass + '">' + dirLabel + '</span><span class="email-subj">' + esc(e.subject) + '</span><span class="email-age">' + e.daysAgo + 'd</span></div>';
      });
    }

    // Projects list
    var projHtml = '';
    if (lead.projects && lead.projects.length > 0) {
      lead.projects.forEach(function(p) {
        projHtml += '<div class="proj-row"><span class="proj-name">' + esc(p.name) + '</span><span class="proj-status">' + esc(p.status || '—') + '</span><span class="proj-val">' + fmtMoney(p.value) + '</span></div>';
      });
    }

    ev.innerHTML = '<button class="dismiss">×</button>' +
      '<div class="hdr"><div class="badge"><span class="green">■</span> RECORD_EXISTS</div><div class="rank">' + esc(lead.stage) + '</div></div>' +

      // Follow-up urgency bar
      '<div class="follow-up-bar ' + fuClass + '">' + fuText + '</div>' +

      // Contact info
      '<div class="grid">' +
        '<div class="cell"><div class="cl">Subject</div><div class="cv">' + esc(lead.name) + '</div></div>' +
        '<div class="cell"><div class="cl">Email</div><div class="cv found">' + esc(trunc(lead.email, 22)) + '</div></div>' +
      '</div>' +

      // Email intelligence
      '<div class="section">Email Intelligence</div>' +
      '<div class="grid4">' +
        '<div class="cell cell-sm"><div class="cl">Sent</div><div class="cv cv-lg blue">' + (lead.emailsSent || 0) + '</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Received</div><div class="cv cv-lg green">' + (lead.emailsReceived || 0) + '</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Reply %</div><div class="cv cv-lg ' + (lead.replyRate > 30 ? 'green' : lead.replyRate > 10 ? 'amber' : 'red') + '">' + (lead.replyRate || 0) + '%</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Opens</div><div class="cv cv-lg purple">' + (lead.openCount || 0) + '</div></div>' +
      '</div>' +

      // Relationship stats
      '<div class="grid3">' +
        '<div class="cell cell-sm"><div class="cl">Score</div><div class="cv">' + (lead.leadScore || 0) + '/100</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Relationship</div><div class="cv">' + (lead.relationshipDays || 0) + 'd</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Avg Reply</div><div class="cv">' + (lead.avgReplySpeed || '—') + '</div></div>' +
      '</div>' +

      // Recent emails
      (emailsHtml ? '<div class="section">Recent Threads</div>' + emailsHtml : '') +

      // Projects
      (lead.totalProjects > 0 ? '<div class="section">Projects (' + lead.totalProjects + ') — Revenue: ' + fmtMoney(lead.totalRevenue) + '</div>' + projHtml : '') +

      // Pricing intelligence for next deal
      '<div class="section">Next Deal Intelligence</div>' +
      '<div class="grid3">' +
        '<div class="cell cell-sm"><div class="cl">Client Tier</div><div class="cv ' + (lead.clientTier === 'VIP' ? 'found' : lead.clientTier === 'PREMIUM' ? 'accent' : 'amber') + '">' + (lead.clientTier || 'NEW') + '</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Avg Deal</div><div class="cv">' + fmtMoney(lead.avgProjectValue) + '</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Next Price</div><div class="cv cv-lg found">' + fmtMoney(lead.nextDealSuggested) + '</div></div>' +
      '</div>' +
      (lead.unpaidAmount > 0 ? '<div class="follow-up-bar fu-cold">⚠ UNPAID: ' + fmtMoney(lead.unpaidAmount) + ' — collect before new work</div>' : '') +
      '<div style="font-size:7px;color:rgba(255,255,255,0.2);margin-bottom:8px;letter-spacing:0.03em">' + esc(lead.pricingAdvice || '') + '</div>' +

      // Actions
      '<div class="btn-row" style="margin-top:8px"><button class="btn-ghost btn-skip">Dismiss</button><button class="btn-primary" id="btn-open-db">Open Database</button></div>' +
      '<div class="state-label">05 // DATABASE_EXISTS — ENTRY T-' + lead.addedDaysAgo + 'D</div>';

    setState('exists');
    _bind();
    var openBtn = shadow.getElementById('btn-open-db');
    if (openBtn) openBtn.addEventListener('click', function() { window.open(lead.crmUrl, '_blank'); });
  }

  function showLow(data) {
    var ev = shadow.getElementById('expanded');
    ev.innerHTML = '<button class="dismiss">×</button>' +
      '<div class="hdr"><div class="badge">MISMATCH_DETECTED <span class="amber">■</span> <span class="red">■</span></div></div>' +
      '<div class="grid"><div class="cell"><div class="cl">Subject</div><div class="cv dim">' + esc(data ? data.name : '—') + '</div></div><div class="cell"><div class="cl">Domain</div><div class="cv dim">' + esc(data ? data.domain : '—') + '</div></div></div>' +
      '<div class="btn-row"><button class="btn-ghost btn-danger btn-skip">Purge</button><button class="btn-primary btn-amber btn-commit">Force Add</button></div>' +
      '<div class="state-label">06 // LOW_CONFIDENCE</div>';
    setState('low');
    _bind();
    if (data) _bindCommit(data);
  }

  function updateFbFound(email, phone) {
    var fbRow = shadow.getElementById('fb-row');
    if (fbRow) { fbRow.classList.add('ok'); fbRow.querySelector('.fb-text').textContent = 'FOUND: ' + (email || phone || 'data'); }
    if (email) { var ec = shadow.getElementById('email-cell'); if (ec) { ec.textContent = email; ec.classList.remove('missing'); ec.classList.add('found'); } }
    if (phone) { var pc = shadow.getElementById('phone-cell'); if (pc) { pc.textContent = phone; pc.classList.remove('missing'); pc.classList.add('found'); } }
  }

  return { mount: mount, scanning: scanning, showHot: showHot, showPartial: showPartial, showExists: showExists, showLow: showLow, contract: contract, updateFbFound: updateFbFound };
})();
