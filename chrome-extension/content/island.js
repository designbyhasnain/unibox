const Island = (() => {
  let host, shadow, islandEl;

  const SHADOW_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'SF Mono','Fira Code','Cascadia Code','Consolas',monospace; }

    #island {
      background: #0a0a0a;
      border: 1px solid rgba(255,255,255,0.08);
      overflow: hidden;
      cursor: pointer;
      position: relative;
      transition: width 0.5s cubic-bezier(0.32,0.72,0,1), height 0.5s cubic-bezier(0.32,0.72,0,1), border-radius 0.4s;
      box-shadow: 0 4px 40px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.06);
      pointer-events: all;
    }

    /* STATES */
    .s-idle    { width: 160px; height: 32px; border-radius: 20px; }
    .s-scan    { width: 260px; height: 32px; border-radius: 20px; }
    .s-hot     { width: 360px; height: auto; border-radius: 12px; }
    .s-partial { width: 360px; height: auto; border-radius: 12px; }
    .s-exists  { width: 340px; height: auto; border-radius: 12px; }
    .s-low     { width: 320px; height: auto; border-radius: 12px; }

    /* IDLE PILL */
    .pill { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:6px; transition:opacity 0.2s; }
    .pill-dot { width:6px; height:6px; border-radius:50%; background:#00ff41; animation:pulse 2.5s ease-in-out infinite; }
    .pill-label { font-size:10px; font-weight:500; color:rgba(255,255,255,0.4); letter-spacing:0.1em; text-transform:uppercase; }
    #island:not(.s-idle) .pill { opacity:0; pointer-events:none; }

    /* SCAN VIEW */
    .scan { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:8px; opacity:0; pointer-events:none; transition:opacity 0.2s; }
    .s-scan .scan { opacity:1; pointer-events:all; }
    .s-scan .pill { opacity:0; }
    .scan-bars { display:flex; gap:2px; align-items:center; }
    .scan-bar { width:3px; height:10px; background:#00ff41; animation:barPulse 0.8s ease-in-out infinite; }
    .scan-bar:nth-child(2) { animation-delay:0.1s; height:14px; }
    .scan-bar:nth-child(3) { animation-delay:0.2s; height:8px; }
    .scan-bar:nth-child(4) { animation-delay:0.3s; height:12px; }
    .scan-text { font-size:9px; color:rgba(255,255,255,0.35); letter-spacing:0.08em; text-transform:uppercase; }

    /* EXPANDED */
    .expanded { opacity:0; max-height:0; overflow:hidden; padding:0; transition:opacity 0.25s 0.15s, max-height 0.4s, padding 0.3s; pointer-events:none; }
    .s-hot .expanded, .s-partial .expanded, .s-exists .expanded, .s-low .expanded {
      opacity:1; max-height:600px; padding:14px 16px 16px; pointer-events:all;
    }

    /* HEADER */
    .hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
    .badge { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; }
    .dot-green { color:#00ff41; } .dot-red { color:#ff3333; } .dot-amber { color:#ffb700; }
    .rank { font-size:9px; font-weight:600; border:1px solid rgba(255,255,255,0.12); border-radius:4px; padding:2px 8px; color:rgba(255,255,255,0.4); letter-spacing:0.05em; }

    /* DATA GRID */
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px; }
    .cell { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:6px 8px; }
    .cell-label { font-size:7.5px; color:rgba(255,255,255,0.25); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:2px; }
    .cell-val { font-size:10px; font-weight:500; color:rgba(255,255,255,0.75); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .val-found { color:#00ff41; } .val-missing { color:rgba(255,255,255,0.15); font-style:italic; } .val-accent { color:#818cf8; }

    /* PRICING */
    .price-box { background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.15); border-radius:6px; padding:8px 10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; }
    .pr-label { font-size:7.5px; color:rgba(255,255,255,0.25); text-transform:uppercase; letter-spacing:0.08em; }
    .pr-val { font-size:10px; font-weight:600; color:#818cf8; margin-top:1px; }
    .pr-suggest { font-size:12px; font-weight:700; color:#00ff41; margin-top:1px; }

    /* SOCIAL PILLS */
    .social-row { display:flex; gap:4px; margin-bottom:10px; }
    .social-pill { font-size:8px; font-weight:600; color:rgba(255,255,255,0.35); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:3px 8px; letter-spacing:0.06em; text-transform:uppercase; cursor:pointer; text-decoration:none; transition:border-color 0.15s; }
    .social-pill:hover { border-color:rgba(255,255,255,0.3); color:rgba(255,255,255,0.6); }

    /* FB EXTRACTION ROW */
    .fb-row { display:flex; align-items:center; gap:7px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.15); border-radius:6px; padding:6px 10px; margin-bottom:10px; }
    .fb-dot { width:5px; height:5px; border-radius:50%; background:#60a5fa; animation:pulse 1.2s ease-in-out infinite; flex-shrink:0; }
    .fb-text { font-size:9px; color:#60a5fa; letter-spacing:0.05em; text-transform:uppercase; }
    .fb-row.ok { background:rgba(0,255,65,0.04); border-color:rgba(0,255,65,0.15); }
    .fb-row.ok .fb-dot { background:#00ff41; animation:none; }
    .fb-row.ok .fb-text { color:#00ff41; }

    /* CRM CARD */
    .crm-card { background:rgba(0,255,65,0.03); border:1px solid rgba(0,255,65,0.12); border-radius:6px; padding:8px 10px; margin-bottom:10px; }
    .crm-name { font-size:11px; font-weight:600; color:#00ff41; text-transform:uppercase; letter-spacing:0.05em; }
    .crm-meta { font-size:8.5px; color:rgba(255,255,255,0.25); margin-top:2px; letter-spacing:0.03em; }
    .crm-detail { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:4px; padding:6px 8px; margin-top:6px; }
    .crm-detail-row { font-size:8.5px; color:rgba(255,255,255,0.35); letter-spacing:0.04em; }
    .crm-detail-val { color:rgba(255,255,255,0.6); font-weight:600; }

    /* BUTTONS */
    .btn-row { display:flex; gap:5px; }
    .btn-primary { flex:2; background:transparent; color:#00ff41; border:1px solid #00ff41; border-radius:6px; padding:8px 10px; font-size:9px; font-weight:600; cursor:pointer; letter-spacing:0.08em; text-transform:uppercase; font-family:inherit; transition:background 0.15s, transform 0.1s; }
    .btn-primary:hover { background:rgba(0,255,65,0.1); }
    .btn-primary:active { transform:scale(0.96); }
    .btn-ghost { flex:1; background:transparent; color:rgba(255,255,255,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px 8px; font-size:9px; cursor:pointer; letter-spacing:0.06em; text-transform:uppercase; font-family:inherit; transition:background 0.15s; }
    .btn-ghost:hover { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.5); }
    .btn-danger { border-color:#ff3333; color:#ff3333; }
    .btn-danger:hover { background:rgba(255,51,51,0.1); }
    .btn-amber { border-color:#ffb700; color:#ffb700; }
    .btn-amber:hover { background:rgba(255,183,0,0.1); }

    /* DISMISS */
    .dismiss { position:absolute; top:10px; right:10px; width:16px; height:16px; border-radius:50%; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:rgba(255,255,255,0.2); font-size:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-family:inherit; transition:background 0.15s; }
    .dismiss:hover { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.5); }

    /* LOW CONFIDENCE */
    .low-class { font-size:9px; color:rgba(255,255,255,0.25); letter-spacing:0.05em; margin-bottom:8px; }
    .low-class span { color:rgba(255,255,255,0.5); font-weight:600; }

    /* STATE LABEL */
    .state-label { font-size:7px; color:rgba(255,255,255,0.1); letter-spacing:0.1em; text-transform:uppercase; margin-top:8px; }

    @keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.85)} 50%{opacity:1;transform:scale(1)} }
    @keyframes barPulse { 0%,100%{opacity:0.2;transform:scaleY(0.5)} 50%{opacity:1;transform:scaleY(1)} }
  `;

  function mount() {
    host = document.createElement('div');
    host.id = 'unibox-island-host';
    document.body.appendChild(host);

    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);

    islandEl = document.createElement('div');
    islandEl.id = 'island';
    islandEl.className = 's-idle';
    islandEl.innerHTML = `
      <div class="pill"><div class="pill-dot"></div><div class="pill-label">Unibox.os</div></div>
      <div class="scan"><div class="scan-bars"><div class="scan-bar"></div><div class="scan-bar"></div><div class="scan-bar"></div><div class="scan-bar"></div></div><div class="scan-text" id="scan-text">recovering contact...</div></div>
      <div class="expanded" id="expanded"></div>
    `;
    shadow.appendChild(islandEl);
  }

  function setState(s) { islandEl.className = 's-' + s; }

  function scanning() {
    setState('scan');
    const steps = ['detecting page type...', 'scraping contact data...', 'extracting pricing...', 'querying crm...'];
    let i = 0;
    const el = shadow.getElementById('scan-text');
    return new Promise(resolve => {
      const iv = setInterval(() => {
        if (el) el.textContent = steps[i % steps.length];
        i++;
        if (i >= steps.length) { clearInterval(iv); setTimeout(resolve, 300); }
      }, 450);
    });
  }

  function contract() {
    setState('idle');
    const ev = shadow.getElementById('expanded');
    if (ev) ev.innerHTML = '';
  }

  function _bindDismiss() {
    shadow.querySelectorAll('.dismiss, .btn-skip').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); contract(); }));
  }

  function showHot(data) {
    const ev = shadow.getElementById('expanded');
    const p = data.pricing;
    const social = data.social || {};
    ev.innerHTML = `
      <button class="dismiss">×</button>
      <div class="hdr">
        <div class="badge"><span class="dot-green">■</span> HOT_LEAD</div>
        <div class="rank">RANK: ${data.score.score}</div>
      </div>
      <div class="grid">
        <div class="cell"><div class="cell-label">Subject</div><div class="cell-val">${esc(data.name) || '—'}</div></div>
        <div class="cell"><div class="cell-label">Loc</div><div class="cell-val val-accent">${esc(data.location) || '—'}</div></div>
        <div class="cell"><div class="cell-label">Email</div><div class="cell-val ${data.email ? 'val-found' : 'val-missing'}">${data.email ? esc(trunc(data.email, 22)) : 'NULL_PTR'}</div></div>
        <div class="cell"><div class="cell-label">Comms</div><div class="cell-val ${data.phone ? 'val-found' : 'val-missing'}">${data.phone ? esc(data.phone) : 'NULL_PTR'}</div></div>
      </div>
      ${p ? `<div class="price-box"><div><div class="pr-label">Pkg_Est</div><div class="pr-val">${p.display}</div></div><div style="text-align:right"><div class="pr-label">Suggest</div><div class="pr-suggest">${p.suggestedDisplay}</div></div></div>` : ''}
      <div class="social-row">
        ${social.instagram ? `<a href="${social.instagram}" target="_blank" class="social-pill">IG</a>` : ''}
        ${social.facebook ? `<a href="${social.facebook}" target="_blank" class="social-pill">FB</a>` : ''}
        ${social.youtube ? `<a href="${social.youtube}" target="_blank" class="social-pill">YT</a>` : ''}
        ${social.vimeo ? `<a href="${social.vimeo}" target="_blank" class="social-pill">VM</a>` : ''}
        <a href="https://${data.domain}" target="_blank" class="social-pill">WEB</a>
      </div>
      <div class="btn-row">
        <button class="btn-ghost btn-skip">Skip</button>
        <button class="btn-primary btn-commit">Commit to CRM</button>
      </div>
      <div class="state-label">03 // TARGET_FOUND_HIGH</div>
    `;
    setState('hot');
    _bindDismiss();
    _bindCommit(data);
  }

  function showPartial(data, fbCallback) {
    const ev = shadow.getElementById('expanded');
    ev.innerHTML = `
      <button class="dismiss">×</button>
      <div class="hdr">
        <div class="badge"><span class="dot-amber">■</span> WARM // INCOMPLETE</div>
        <div class="rank">RANK: ${data.score.score}</div>
      </div>
      <div class="grid">
        <div class="cell"><div class="cell-label">Subject</div><div class="cell-val">${esc(data.name) || '—'}</div></div>
        <div class="cell"><div class="cell-label">Loc</div><div class="cell-val val-accent">${esc(data.location) || '—'}</div></div>
        <div class="cell"><div class="cell-label">Email</div><div class="cell-val val-missing" id="email-cell">NULL_PTR</div></div>
        <div class="cell"><div class="cell-label">Comms</div><div class="cell-val val-missing">NULL_PTR</div></div>
      </div>
      <div class="fb-row" id="fb-row">
        <div class="fb-dot"></div>
        <div class="fb-text">■ extracting from social...</div>
      </div>
      <div class="btn-row">
        <button class="btn-ghost btn-skip">Re-scan FB</button>
        <button class="btn-primary btn-amber btn-commit">Commit Partial</button>
      </div>
      <div class="state-label">04 // TARGET_PARTIAL</div>
    `;
    setState('partial');
    _bindDismiss();
    _bindCommit(data);
    if (fbCallback) fbCallback();
  }

  function showExists(lead) {
    const ev = shadow.getElementById('expanded');
    ev.innerHTML = `
      <button class="dismiss">×</button>
      <div class="hdr">
        <div class="badge"><span class="dot-green">■</span> RECORD_EXISTS</div>
      </div>
      <div class="crm-card">
        <div class="crm-name">${esc(lead.name)}</div>
        <div class="crm-meta">ENTRY: T-${lead.addedDaysAgo}D · STAGE: ${lead.stage} · ${esc(lead.email || '')}</div>
        <div class="crm-detail">
          <div class="crm-detail-row">LAST OP <span class="crm-detail-val">${lead.lastAction}</span></div>
          <div class="crm-detail-row">FOLLOW-UP <span class="crm-detail-val">${lead.nextFollowUp || 'NONE'}</span></div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn-ghost btn-skip">Log</button>
        <button class="btn-primary" id="btn-open-db">Open Database</button>
      </div>
      <div class="state-label">05 // DATABASE_EXISTS</div>
    `;
    setState('exists');
    _bindDismiss();
    const openBtn = shadow.getElementById('btn-open-db');
    if (openBtn) openBtn.addEventListener('click', () => window.open(lead.crmUrl, '_blank'));
  }

  function showLow(data) {
    const ev = shadow.getElementById('expanded');
    ev.innerHTML = `
      <button class="dismiss">×</button>
      <div class="hdr">
        <div class="badge">MISMATCH_DETECTED <span class="dot-amber">■</span> <span class="dot-red">■</span></div>
      </div>
      <div class="low-class">Class: <span>PHOTO_STUDIO</span></div>
      <div class="low-class">Video: <span>NONE</span></div>
      <div class="btn-row">
        <button class="btn-ghost btn-danger btn-skip">Purge</button>
        <button class="btn-primary btn-amber btn-commit">Force</button>
      </div>
      <div class="state-label">06 // LOW_CONFIDENCE</div>
    `;
    setState('low');
    _bindDismiss();
    if (data) _bindCommit(data);
  }

  function updateFbFound(email) {
    const fbRow = shadow.getElementById('fb-row');
    if (fbRow) { fbRow.classList.add('ok'); fbRow.querySelector('.fb-text').textContent = 'FOUND: ' + email; }
    const emailCell = shadow.getElementById('email-cell');
    if (emailCell) { emailCell.textContent = email; emailCell.classList.remove('val-missing'); emailCell.classList.add('val-found'); }
  }

  function _bindCommit(data) {
    const btn = shadow.querySelector('.btn-commit');
    if (btn) btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'ADD_TO_CRM', data });
      btn.textContent = '■ COMMITTED';
      btn.style.borderColor = '#00ff41';
      btn.style.color = '#00ff41';
      btn.style.background = 'rgba(0,255,65,0.1)';
      setTimeout(contract, 1500);
    });
  }

  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + '...' : s; }

  return { mount, scanning, showHot, showPartial, showExists, showLow, contract, updateFbFound };
})();
