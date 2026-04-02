const Island = (() => {
  let host, shadow, islandEl;
  var lastRenderFn = null, lastRenderArgs = null, lastState = null;

  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0;font-family:'SF Mono','Fira Code','Cascadia Code','Consolas',monospace}

    #island{background:#0a0a0a;border:1px solid rgba(255,255,255,0.1);overflow:hidden;position:relative;
      transition:width 0.55s cubic-bezier(0.32,0.72,0,1),max-height 0.55s cubic-bezier(0.32,0.72,0,1),border-radius 0.45s,padding 0.3s;
      box-shadow:0 8px 60px rgba(0,0,0,0.9),0 0 0 0.5px rgba(255,255,255,0.08);pointer-events:all}

    .s-idle{width:180px;height:40px;max-height:40px;border-radius:24px;padding:0}
    .s-scan{width:300px;height:40px;max-height:40px;border-radius:24px;padding:0}
    .s-hot,.s-partial,.s-exists,.s-low{width:400px;height:auto;max-height:800px;border-radius:14px;padding:0}

    .pill{position:absolute;top:0;left:0;right:0;height:40px;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity 0.25s;cursor:pointer;padding:0 16px}
    .pill-dot{width:8px;height:8px;border-radius:50%;background:#00ff41;animation:pulse 2s ease-in-out infinite;flex-shrink:0}
    .pill-label{font-size:11px;font-weight:600;color:rgba(255,255,255,0.45);letter-spacing:0.12em;text-transform:uppercase}
    #island:not(.s-idle) .pill{opacity:0;pointer-events:none}

    .scan{position:absolute;top:0;left:0;right:0;height:40px;display:flex;align-items:center;justify-content:center;gap:10px;opacity:0;pointer-events:none;transition:opacity 0.25s;padding:0 16px}
    .s-scan .scan{opacity:1;pointer-events:all}.s-scan .pill{opacity:0}
    .scan-bars{display:flex;gap:3px;align-items:center}
    .scan-bar{width:3px;height:12px;background:#00ff41;animation:barPulse 0.8s ease-in-out infinite}
    .scan-bar:nth-child(1){height:10px;animation-delay:0s}
    .scan-bar:nth-child(2){height:16px;animation-delay:0.12s}
    .scan-bar:nth-child(3){height:8px;animation-delay:0.24s}
    .scan-bar:nth-child(4){height:14px;animation-delay:0.36s}
    .scan-bar:nth-child(5){height:6px;animation-delay:0.48s}
    .scan-text{font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:0.08em;text-transform:uppercase}

    .expanded{opacity:0;max-height:0;overflow-y:auto;padding:0;transition:opacity 0.3s 0.2s,max-height 0.5s,padding 0.3s;pointer-events:none}
    .s-hot .expanded,.s-partial .expanded,.s-exists .expanded,.s-low .expanded{opacity:1;max-height:600px;padding:16px 18px 18px;pointer-events:all}

    .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .badge{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase}
    .green{color:#00ff41}.red{color:#ff3333}.amber{color:#ffb700}.blue{color:#60a5fa}.purple{color:#a78bfa}.dim{color:rgba(255,255,255,0.2)}
    .rank{font-size:9px;font-weight:600;border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:3px 10px;color:rgba(255,255,255,0.35);letter-spacing:0.06em}

    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:10px}
    .grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-bottom:10px}
    .cell{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px}
    .cell-sm{padding:6px 8px}
    .cl{font-size:7.5px;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:3px}
    .cv{font-size:11px;font-weight:500;color:rgba(255,255,255,0.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cv-lg{font-size:16px;font-weight:700}
    .found{color:#00ff41}.missing{color:rgba(255,255,255,0.12);font-style:italic}.accent{color:#818cf8}

    .section{font-size:7.5px;color:rgba(255,255,255,0.12);text-transform:uppercase;letter-spacing:0.14em;margin:10px 0 6px;border-top:1px solid rgba(255,255,255,0.04);padding-top:8px}

    .price-box{background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:8px;padding:10px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
    .pr-label{font-size:7.5px;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.08em}
    .pr-val{font-size:11px;font-weight:600;color:#818cf8;margin-top:2px}
    .pr-suggest{font-size:14px;font-weight:700;color:#00ff41;margin-top:2px}

    .social-row{display:flex;gap:4px;margin-bottom:10px}
    .social-pill{font-size:8px;font-weight:600;color:rgba(255,255,255,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 10px;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;text-decoration:none;transition:all 0.15s}
    .social-pill:hover{border-color:#00ff41;color:#00ff41}

    .fb-row{display:flex;align-items:center;gap:8px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:8px;padding:8px 12px;margin-bottom:10px}
    .fb-dot{width:6px;height:6px;border-radius:50%;background:#60a5fa;animation:pulse 1.2s ease-in-out infinite;flex-shrink:0}
    .fb-text{font-size:9px;color:#60a5fa;letter-spacing:0.06em;text-transform:uppercase}
    .fb-row.ok{background:rgba(0,255,65,0.04);border-color:rgba(0,255,65,0.15)}
    .fb-row.ok .fb-dot{background:#00ff41;animation:none}.fb-row.ok .fb-text{color:#00ff41}

    .email-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:9px}
    .email-dir{width:14px;font-size:8px;font-weight:700}.sent{color:#60a5fa}.recv{color:#00ff41}
    .email-subj{flex:1;color:rgba(255,255,255,0.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 8px}
    .email-age{color:rgba(255,255,255,0.15);font-size:8px}
    .proj-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:9px}
    .proj-name{flex:1;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .proj-val{color:#00ff41;font-weight:600;margin-left:8px}

    .fu-bar{border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase}
    .fu-reply{background:rgba(0,255,65,0.06);border:1px solid rgba(0,255,65,0.18);color:#00ff41}
    .fu-followup{background:rgba(255,183,0,0.06);border:1px solid rgba(255,183,0,0.18);color:#ffb700}
    .fu-cold{background:rgba(255,51,51,0.06);border:1px solid rgba(255,51,51,0.18);color:#ff3333}
    .fu-active{background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.18);color:#60a5fa}
    .fu-dormant{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.2)}

    .btn-row{display:flex;gap:6px;margin-top:4px}
    .btn-primary{flex:2;background:transparent;color:#00ff41;border:1.5px solid #00ff41;border-radius:8px;padding:10px 12px;font-size:10px;font-weight:600;cursor:pointer;letter-spacing:0.08em;text-transform:uppercase;font-family:inherit;transition:all 0.15s}
    .btn-primary:hover{background:rgba(0,255,65,0.1)}.btn-primary:active{transform:scale(0.97)}
    .btn-ghost{flex:1;background:transparent;color:rgba(255,255,255,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;font-size:10px;cursor:pointer;letter-spacing:0.06em;text-transform:uppercase;font-family:inherit;transition:all 0.15s}
    .btn-ghost:hover{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5)}
    .btn-amber{border-color:#ffb700;color:#ffb700}.btn-amber:hover{background:rgba(255,183,0,0.1)}
    .btn-danger{border-color:#ff3333;color:#ff3333}.btn-danger:hover{background:rgba(255,51,51,0.1)}
    .dismiss{position:absolute;top:12px;right:14px;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.25);font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;transition:all 0.15s}
    .dismiss:hover{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6)}
    .state-label{font-size:7px;color:rgba(255,255,255,0.06);letter-spacing:0.12em;text-transform:uppercase;margin-top:10px}
    .pitch{font-size:8px;color:rgba(0,255,65,0.45);padding:6px 10px;background:rgba(0,255,65,0.03);border:1px solid rgba(0,255,65,0.08);border-radius:6px;letter-spacing:0.02em;margin-bottom:10px}
    @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.85)}50%{opacity:1;transform:scale(1)}}
    @keyframes barPulse{0%,100%{opacity:0.2;transform:scaleY(0.5)}50%{opacity:1;transform:scaleY(1)}}
  `;

  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + '...' : (s || ''); }
  function fmtMoney(v) { return v ? '$' + Number(v).toLocaleString() : '$0'; }

  function mount() {
    host = document.createElement('div');
    host.id = 'unibox-island-host';
    host.style.cssText = 'position:fixed!important;top:10px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;pointer-events:none!important;';
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
    islandEl = document.createElement('div');
    islandEl.id = 'island';
    islandEl.className = 's-idle';
    islandEl.innerHTML = '<div class="pill"><div class="pill-dot"></div><div class="pill-label">Unibox.os</div></div>' +
      '<div class="scan"><div class="scan-bars"><div class="scan-bar"></div><div class="scan-bar"></div><div class="scan-bar"></div><div class="scan-bar"></div><div class="scan-bar"></div></div><div class="scan-text" id="scan-text">recovering contact...</div></div>' +
      '<div class="expanded" id="expanded"></div>';
    shadow.appendChild(islandEl);
    islandEl.addEventListener('click', function(e) {
      if (islandEl.className === 's-idle' && lastRenderFn) expand();
      else if (e.target === islandEl && islandEl.className !== 's-idle' && islandEl.className !== 's-scan') contract();
    });
  }

  function setState(s) { islandEl.className = 's-' + s; }

  function scanning() {
    setState('scan');
    var steps = ['detecting page type...', 'recovering contact data...', 'analyzing pricing...', 'querying crm database...', 'calculating outsource potential...'];
    var i = 0;
    var el = shadow.getElementById('scan-text');
    return new Promise(function(resolve) {
      var iv = setInterval(function() {
        if (el) el.textContent = steps[i % steps.length];
        i++;
        if (i >= steps.length) { clearInterval(iv); setTimeout(resolve, 300); }
      }, 500);
    });
  }

  function contract() {
    setState('idle');
    var ev = shadow.getElementById('expanded');
    if (ev) ev.innerHTML = '';
    var pill = shadow.querySelector('.pill-label');
    if (pill && lastState) pill.textContent = '■ tap to expand';
  }

  function expand() {
    if (lastRenderFn && lastRenderArgs) lastRenderFn.apply(null, lastRenderArgs);
  }

  function _bind() {
    shadow.querySelectorAll('.dismiss,.btn-skip').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); contract(); }); });
  }

  function _bindCommit(data) {
    var btn = shadow.querySelector('.btn-commit');
    if (btn) btn.addEventListener('click', function() {
      chrome.runtime.sendMessage({ type: 'ADD_TO_CRM', data: data });
      btn.textContent = '■ COMMITTED';
      btn.style.borderColor = '#00ff41'; btn.style.color = '#00ff41'; btn.style.background = 'rgba(0,255,65,0.1)';
      setTimeout(contract, 1500);
    });
  }

  function buildPricingHTML(p) {
    if (!p) return '';
    return '<div class="price-box"><div><div class="pr-label">Their Packages</div><div class="pr-val">' + p.display + '</div></div><div style="text-align:right"><div class="pr-label">Our Price</div><div class="pr-suggest">' + (p.suggestedRange || p.suggestedDisplay) + '</div></div></div>' +
      '<div class="grid"><div class="cell cell-sm"><div class="cl">Tier</div><div class="cv ' + (p.affordability === 'HIGH' || p.affordability === 'VERY_HIGH' ? 'found' : 'accent') + '">' + (p.tier || '') + '</div></div><div class="cell cell-sm"><div class="cl">Can Afford</div><div class="cv ' + (p.affordability === 'HIGH' || p.affordability === 'VERY_HIGH' ? 'found' : 'accent') + '">' + (p.affordability || '') + '</div></div></div>' +
      '<div style="font-size:7.5px;color:rgba(255,255,255,0.2);margin-bottom:8px">' + esc(p.confidence || '') + '</div>' +
      (p.packages && p.packages.length > 0 ? '<div class="section">Suggested Packages (' + (p.editPercent || 15) + '%)</div>' + p.packages.map(function(pk) { return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03)"><span style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:0.05em">' + pk.name + '</span><span style="font-size:10px;font-weight:700;color:#00ff41">$' + pk.price + '</span></div>'; }).join('') : '');
  }

  function buildIntelHTML(bi) {
    if (!bi || !bi.estimatedWeddingsPerYear) return '';
    var c = bi.outsourcePotential === 'VERY_HIGH' || bi.outsourcePotential === 'HIGH' ? 'found' : bi.outsourcePotential === 'MEDIUM' ? 'accent' : 'amber';
    return '<div class="section">Outsource Potential</div>' +
      '<div class="grid3"><div class="cell cell-sm"><div class="cl">Weddings/yr</div><div class="cv cv-lg ' + c + '">' + bi.estimatedWeddingsPerYear + '</div></div>' +
      '<div class="cell cell-sm"><div class="cl">Proj/Mo</div><div class="cv cv-lg ' + c + '">' + (bi.estimatedProjectsPerMonth || 0) + '</div></div>' +
      '<div class="cell cell-sm"><div class="cl">Our Rev/yr</div><div class="cv cv-lg found">' + fmtMoney(bi.estimatedAnnualRevenue) + '</div></div></div>' +
      (bi.outreachAngle ? '<div class="pitch">' + esc(bi.outreachAngle) + '</div>' : '');
  }

  function showHot(data) {
    lastRenderFn = showHot; lastRenderArgs = [data]; lastState = 'hot';
    var ev = shadow.getElementById('expanded');
    var p = data.pricing;
    var social = data.social || {};
    var socials = '';
    if (social.instagram) socials += '<a href="' + social.instagram + '" target="_blank" class="social-pill">IG</a>';
    if (social.facebook) socials += '<a href="' + social.facebook + '" target="_blank" class="social-pill">FB</a>';
    if (social.youtube) socials += '<a href="' + social.youtube + '" target="_blank" class="social-pill">YT</a>';
    if (social.vimeo) socials += '<a href="' + social.vimeo + '" target="_blank" class="social-pill">VM</a>';
    socials += '<a href="https://' + esc(data.domain) + '" target="_blank" class="social-pill">WEB</a>';

    ev.innerHTML = '<button class="dismiss">x</button>' +
      '<div class="hdr"><div class="badge"><span class="green">■</span> HOT_LEAD</div><div class="rank">RANK: ' + data.score.score + '</div></div>' +
      '<div class="grid">' +
        '<div class="cell"><div class="cl">Subject</div><div class="cv">' + esc(data.name) + '</div></div>' +
        '<div class="cell"><div class="cl">Loc</div><div class="cv accent">' + esc(data.location || '—') + '</div></div>' +
        '<div class="cell"><div class="cl">Email</div><div class="cv ' + (data.email ? 'found' : 'missing') + '">' + (data.email ? esc(trunc(data.email, 25)) : 'NULL_PTR') + '</div></div>' +
        '<div class="cell"><div class="cl">Comms</div><div class="cv ' + (data.phone ? 'found' : 'missing') + '">' + (data.phone ? esc(data.phone) : 'NULL_PTR') + '</div></div>' +
      '</div>' +
      buildPricingHTML(p) +
      '<div class="social-row">' + socials + '</div>' +
      buildIntelHTML(data.businessIntel) +
      '<div class="btn-row"><button class="btn-ghost btn-skip">Skip</button><button class="btn-primary btn-commit">Commit to CRM</button></div>' +
      '<div class="state-label">03 // TARGET_FOUND_HIGH</div>';
    setState('hot'); _bind(); _bindCommit(data);
  }

  function showPartial(data, fbCallback, igCallback) {
    lastRenderFn = showPartial; lastRenderArgs = [data, fbCallback, igCallback]; lastState = 'partial';
    var ev = shadow.getElementById('expanded');
    ev.innerHTML = '<button class="dismiss">x</button>' +
      '<div class="hdr"><div class="badge"><span class="amber">■</span> WARM // INCOMPLETE</div><div class="rank">RANK: ' + data.score.score + '</div></div>' +
      '<div class="grid">' +
        '<div class="cell"><div class="cl">Subject</div><div class="cv">' + esc(data.name) + '</div></div>' +
        '<div class="cell"><div class="cl">Loc</div><div class="cv accent">' + esc(data.location || '—') + '</div></div>' +
        '<div class="cell"><div class="cl">Email</div><div class="cv missing" id="email-cell">NULL_PTR</div></div>' +
        '<div class="cell"><div class="cl">Comms</div><div class="cv missing" id="phone-cell">NULL_PTR</div></div>' +
      '</div>' +
      '<div class="fb-row" id="fb-row"><div class="fb-dot"></div><div class="fb-text">■ extracting from social...</div></div>' +
      buildPricingHTML(data.pricing) +
      buildIntelHTML(data.businessIntel) +
      '<div class="btn-row"><button class="btn-ghost btn-skip">Skip</button><button class="btn-primary btn-amber btn-commit">Commit Partial</button></div>' +
      '<div class="state-label">04 // TARGET_PARTIAL</div>';
    setState('partial'); _bind(); _bindCommit(data);
    if (fbCallback) fbCallback();
  }

  function showExists(lead) {
    lastRenderFn = showExists; lastRenderArgs = [lead]; lastState = 'exists';
    var ev = shadow.getElementById('expanded');

    var fuClass = 'fu-active', fuText = '● ACTIVE';
    if (lead.followUpStatus === 'REPLY_ASAP') { fuClass = 'fu-reply'; fuText = '▲ REPLY ASAP — replied ' + lead.daysSinceLastEmail + 'd ago'; }
    else if (lead.followUpStatus === 'REPLY_SOON') { fuClass = 'fu-reply'; fuText = '● REPLY SOON — replied ' + lead.daysSinceLastEmail + 'd ago'; }
    else if (lead.followUpStatus === 'FOLLOW_UP') { fuClass = 'fu-followup'; fuText = '▲ FOLLOW UP — sent ' + lead.daysSinceLastEmail + 'd ago'; }
    else if (lead.followUpStatus === 'GOING_COLD') { fuClass = 'fu-cold'; fuText = '▲ GOING COLD — ' + lead.daysSinceLastEmail + 'd silent'; }
    else if (lead.followUpStatus === 'DORMANT') { fuClass = 'fu-dormant'; fuText = '○ DORMANT — ' + lead.daysSinceLastEmail + 'd inactive'; }
    else if (lead.daysSinceLastEmail !== null && lead.daysSinceLastEmail !== undefined) { fuText = '● ACTIVE — ' + lead.daysSinceLastEmail + 'd ago'; }

    var emailsHtml = '';
    if (lead.recentEmails && lead.recentEmails.length > 0) {
      lead.recentEmails.forEach(function(e) {
        emailsHtml += '<div class="email-row"><span class="email-dir ' + (e.direction === 'SENT' ? 'sent' : 'recv') + '">' + (e.direction === 'SENT' ? '→' : '←') + '</span><span class="email-subj">' + esc(e.subject) + '</span><span class="email-age">' + e.daysAgo + 'd</span></div>';
      });
    }

    var projHtml = '';
    if (lead.projects && lead.projects.length > 0) {
      lead.projects.forEach(function(p) {
        projHtml += '<div class="proj-row"><span class="proj-name">' + esc(p.name) + '</span><span class="proj-val">' + fmtMoney(p.value) + '</span></div>';
      });
    }

    ev.innerHTML = '<button class="dismiss">x</button>' +
      '<div class="hdr"><div class="badge"><span class="green">■</span> RECORD_EXISTS</div><div class="rank">' + esc(lead.stage) + '</div></div>' +
      '<div class="fu-bar ' + fuClass + '">' + fuText + '</div>' +
      '<div class="grid">' +
        '<div class="cell"><div class="cl">Subject</div><div class="cv">' + esc(lead.name) + '</div></div>' +
        '<div class="cell"><div class="cl">Email</div><div class="cv found">' + esc(trunc(lead.email, 25)) + '</div></div>' +
      '</div>' +

      // Email intelligence (only show if they have emails)
      (lead.totalEmails > 0 ? '<div class="section">Email Intelligence</div>' +
        '<div class="grid4">' +
          '<div class="cell cell-sm"><div class="cl">Sent</div><div class="cv cv-lg blue">' + (lead.emailsSent || 0) + '</div></div>' +
          '<div class="cell cell-sm"><div class="cl">Recv</div><div class="cv cv-lg green">' + (lead.emailsReceived || 0) + '</div></div>' +
          '<div class="cell cell-sm"><div class="cl">Reply%</div><div class="cv cv-lg ' + (lead.replyRate > 30 ? 'green' : lead.replyRate > 10 ? 'amber' : 'red') + '">' + (lead.replyRate || 0) + '%</div></div>' +
          '<div class="cell cell-sm"><div class="cl">Opens</div><div class="cv cv-lg purple">' + (lead.openCount || 0) + '</div></div>' +
        '</div>' : '') +

      (emailsHtml ? '<div class="section">Recent Threads</div>' + emailsHtml : '') +
      (lead.totalProjects > 0 ? '<div class="section">Projects (' + lead.totalProjects + ') — ' + fmtMoney(lead.totalRevenue) + '</div>' + projHtml : '') +

      // Next deal — from CRM history OR website pricing
      (lead.totalProjects > 0 ? '<div class="section">Next Deal</div>' +
        '<div class="grid3"><div class="cell cell-sm"><div class="cl">Tier</div><div class="cv ' + (lead.clientTier === 'VIP' ? 'found' : lead.clientTier === 'PREMIUM' ? 'accent' : 'amber') + '">' + (lead.clientTier || 'NEW') + '</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Avg Deal</div><div class="cv">' + fmtMoney(lead.avgProjectValue) + '</div></div>' +
        '<div class="cell cell-sm"><div class="cl">Next Price</div><div class="cv cv-lg found">' + fmtMoney(lead.nextDealSuggested) + '</div></div></div>' +
        (lead.unpaidAmount > 0 ? '<div class="fu-bar fu-cold">UNPAID: ' + fmtMoney(lead.unpaidAmount) + ' — collect first</div>' : '') +
        '<div style="font-size:7.5px;color:rgba(255,255,255,0.2);margin-bottom:8px">' + esc(lead.pricingAdvice || '') + '</div>' :

        // No project history — use website pricing instead
        (lead.websitePricing ? '<div class="section">Website Pricing (no project history)</div>' + buildPricingHTML(lead.websitePricing) : '')) +

      // Business intel from website
      buildIntelHTML(lead.businessIntel) +

      '<div class="btn-row"><button class="btn-ghost btn-skip">Dismiss</button><button class="btn-primary" id="btn-open-db">Open Database</button></div>' +
      '<div class="state-label">05 // DATABASE_EXISTS — T-' + lead.addedDaysAgo + 'D</div>';

    setState('exists'); _bind();
    var openBtn = shadow.getElementById('btn-open-db');
    if (openBtn) openBtn.addEventListener('click', function() { window.open(lead.crmUrl, '_blank'); });
  }

  function showLow(data) {
    lastRenderFn = showLow; lastRenderArgs = [data]; lastState = 'low';
    var ev = shadow.getElementById('expanded');
    ev.innerHTML = '<button class="dismiss">x</button>' +
      '<div class="hdr"><div class="badge">MISMATCH_DETECTED <span class="amber">■</span> <span class="red">■</span></div></div>' +
      '<div class="grid"><div class="cell"><div class="cl">Subject</div><div class="cv dim">' + esc(data ? data.name : '—') + '</div></div><div class="cell"><div class="cl">Domain</div><div class="cv dim">' + esc(data ? data.domain : '—') + '</div></div></div>' +
      '<div class="btn-row"><button class="btn-ghost btn-danger btn-skip">Purge</button><button class="btn-primary btn-amber btn-commit">Force Add</button></div>' +
      '<div class="state-label">06 // LOW_CONFIDENCE</div>';
    setState('low'); _bind();
    if (data) _bindCommit(data);
  }

  function updateFbFound(email, phone) {
    var fbRow = shadow.getElementById('fb-row');
    if (fbRow) { fbRow.classList.add('ok'); fbRow.querySelector('.fb-text').textContent = 'FOUND: ' + (email || phone || 'data'); }
    if (email) { var ec = shadow.getElementById('email-cell'); if (ec) { ec.textContent = email; ec.classList.remove('missing'); ec.classList.add('found'); } }
    if (phone) { var pc = shadow.getElementById('phone-cell'); if (pc) { pc.textContent = phone; pc.classList.remove('missing'); pc.classList.add('found'); } }
  }

  return { mount: mount, scanning: scanning, showHot: showHot, showPartial: showPartial, showExists: showExists, showLow: showLow, contract: contract, expand: expand, updateFbFound: updateFbFound };
})();
