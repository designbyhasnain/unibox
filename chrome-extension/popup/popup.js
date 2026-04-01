
let scrapedData = null;

function showState(id) {
  document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('state-' + id);
  if (el) el.classList.add('active');
  document.getElementById('logoutBtn').style.display = (id !== 'login') ? '' : 'none';
}

function sendMsg(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

async function startScan() {
  showState('scanning');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { showState('nodata'); return; }
    // Inject content script if not already
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
    } catch {}
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' });
    if (!result?.success || !result.data) { showState('nodata'); return; }
    scrapedData = result.data;
    const d = scrapedData;
    if (!d.name && !d.email && !d.phone) { showState('nodata'); return; }
    document.getElementById('fieldName').value = d.name || '';
    document.getElementById('fieldEmail').value = d.email || '';
    document.getElementById('fieldPhone').value = d.phone || '';
    document.getElementById('fieldCompany').value = d.company || '';
    document.getElementById('fieldWebsite').value = d.website || '';
    document.getElementById('fieldSource').textContent = d.source || 'Extension';
    showState('results');
    // Check duplicates
    const check = document.getElementById('duplicateCheck');
    const resultDiv = document.getElementById('duplicateResult');
    const newForm = document.getElementById('newClientForm');
    check.style.display = '';
    resultDiv.style.display = 'none';
    newForm.style.display = 'none';
    const searchKey = d.email ? { email: d.email } : d.phone ? { phone: d.phone } : d.name ? { name: d.name } : null;
    if (!searchKey) { check.style.display = 'none'; newForm.style.display = ''; return; }
    const exists = await sendMsg({ type: 'CHECK_CLIENT', data: searchKey });
    check.style.display = 'none';
    if (exists?.exists && exists.client) {
      showExistsState(exists.client);
    } else {
      newForm.style.display = '';
    }
  } catch (err) {
    console.error('Scan error:', err);
    showState('nodata');
  }
}

function showExistsState(client) {
  showState('exists');
  document.getElementById('existsInfo').innerHTML =
    '<div style="padding:8px 0"><p><strong>' + (client.name||'Unknown') + '</strong></p>' +
    '<p style="color:#6b7280;font-size:12px">' + (client.email||'') + '</p>' +
    '<p style="color:#6b7280;font-size:12px">Stage: ' + (client.pipeline_stage||'Lead') + '</p>' +
    (client.source ? '<p style="margin-top:4px"><span class="badge badge-blue">' + client.source + '</span></p>' : '') +
    '</div>';
  document.getElementById('viewClientLink').href = 'https://txb-unibox.vercel.app/clients/' + client.id;
}

document.addEventListener('DOMContentLoaded', async () => {
  const { apiKey } = await sendMsg({ type: 'GET_API_KEY' });
  if (!apiKey) { showState('login'); return; }
  showState('scanning');
  const user = await sendMsg({ type: 'VERIFY_KEY', apiKey });
  if (!user?.id) { showState('login'); return; }
  startScan();
});

document.getElementById('connectBtn').addEventListener('click', async () => {
  const key = document.getElementById('apiKeyInput').value.trim();
  const err = document.getElementById('loginError');
  err.textContent = '';
  if (!key.startsWith('unibox_ext_')) { err.textContent = 'Key must start with unibox_ext_'; return; }
  const user = await sendMsg({ type: 'VERIFY_KEY', apiKey: key });
  if (!user?.id) { err.textContent = 'Invalid API key'; return; }
  await sendMsg({ type: 'SAVE_API_KEY', apiKey: key });
  startScan();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sendMsg({ type: 'LOGOUT' });
  showState('login');
});

document.getElementById('addBtn').addEventListener('click', async () => {
  const btn = document.getElementById('addBtn');
  const err = document.getElementById('addError');
  btn.disabled = true;
  err.textContent = '';
  const data = {
    name: document.getElementById('fieldName').value.trim(),
    email: document.getElementById('fieldEmail').value.trim() || undefined,
    phone: document.getElementById('fieldPhone').value.trim() || undefined,
    company: document.getElementById('fieldCompany').value.trim() || undefined,
    source: scrapedData?.source || 'Extension',
    sourceUrl: scrapedData?.sourceUrl || '',
    notes: document.getElementById('fieldNotes').value.trim() || undefined
  };
  if (!data.name && !data.email) { err.textContent = 'Name or email required'; btn.disabled = false; return; }
  const result = await sendMsg({ type: 'CREATE_CLIENT', data });
  if (result?.success && result.client) {
    showState('success');
    document.getElementById('viewNewClient').href = 'https://txb-unibox.vercel.app/clients/' + result.client.id;
  } else if (result?.exists) {
    showExistsState(result.client);
  } else {
    err.textContent = result?.error || 'Failed to save';
    btn.disabled = false;
  }
});

['scanAgainBtn', 'scanAgainBtn2', 'scanAgainBtn3'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', startScan);
});
