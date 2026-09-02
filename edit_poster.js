let fullDbData = [];
let currentRecordIndex = -1;
let viewerInstance = null;

const fields = [
  'id', 'title', 'author', 'client', 'year', 'year_approx', 
  'period_era', 'product_subject', 'printer', 'dimensions', 
  'soubor_hlavni', 'soubory_detaily', 'note'
];

function getField(name) {
  return document.getElementById('edit_' + name);
}

async function checkAuthSession() {
  const modal = document.getElementById('gateModal');
  if (typeof supabaseClient === 'undefined' || !supabaseClient.auth) {
    if (modal) modal.style.display = 'flex';
    return false;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    if (modal) modal.style.display = 'none';
    localStorage.setItem('affiche_admin_mode', 'true');
    return true;
  } else {
    if (modal) modal.style.display = 'flex';
    localStorage.removeItem('affiche_admin_mode');
    return false;
  }
}

async function handleSupabaseLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errEl = document.getElementById('loginError');

  if (errEl) errEl.style.display = 'none';

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (errEl) {
      errEl.textContent = '❌ Chyba přihlášení: ' + error.message;
      errEl.style.display = 'block';
    }
  } else {
    localStorage.setItem('affiche_admin_mode', 'true');
    await checkAuthSession();
    await loadDataFromSupabase();
  }
}

async function lockAdminSession() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
    await supabaseClient.auth.signOut();
  }
  localStorage.removeItem('affiche_admin_mode');
  window.location.href = 'index.html';
}

window.addEventListener('DOMContentLoaded', async () => {
  const isAuthenticated = await checkAuthSession();
  if (isAuthenticated) {
    await loadDataFromSupabase();
  }
});

async function loadDataFromSupabase() {
  showStatus('🔄 Načítám data ze Supabase...', 'yellow');
  try {
    const { data, error } = await supabaseClient
      .from('posters')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    fullDbData = data || [];
    showStatus(`✅ Načteno ${fullDbData.length} plakátů.`, 'green');

    populateRecordSelect();

    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    let initialIndex = 0;

    if (targetId) {
      const foundIdx = fullDbData.findIndex(r => String(r.id) === String(targetId));
      if (foundIdx !== -1) initialIndex = foundIdx;
    }

    loadRecordByIndex(initialIndex);
  } catch (err) {
    console.error("Chyba Supabase:", err);
    showStatus('❌ Chyba při načítání: ' + err.message, 'red');
  }
}

function populateRecordSelect() {
  const select = document.getElementById('recordSelect');
  if (!select) return;
  select.innerHTML = '';

  fullDbData.forEach((row, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `#${row.id} - ${row.title || 'Bez názvu'}`;
    select.appendChild(opt);
  });
}

function loadRecordByIndex(index) {
  if (!fullDbData || fullDbData.length === 0) return;
  if (index < 0) index = 0;
  if (index >= fullDbData.length) index = fullDbData.length - 1;

  currentRecordIndex = index;
  const r = fullDbData[index] || {};

  document.getElementById('recordCounter').textContent = `Plakát ${index + 1} z ${fullDbData.length}`;
  document.getElementById('recordIdTitle').textContent = r.id ? `#${r.id}` : 'Nový';

  const select = document.getElementById('recordSelect');
  if (select) select.value = index;

  document.getElementById('prevBtn').disabled = (index <= 0);
  document.getElementById('nextBtn').disabled = (index >= fullDbData.length - 1);

  fields.forEach(f => {
    const el = getField(f);
    if (el) {
      el.value = r[f] !== undefined && r[f] !== null ? String(r[f]).trim() : '';
    }
  });

  updateImageFromInput();
}

function navigateRecord(delta) {
  saveCurrentFormToMemory();
  if (currentRecordIndex + delta >= 0 && currentRecordIndex + delta < fullDbData.length) {
    loadRecordByIndex(currentRecordIndex + delta);
  }
}

function jumpToSelectedRecord() {
  saveCurrentFormToMemory();
  const select = document.getElementById('recordSelect');
  if (select && select.value !== '') {
    loadRecordByIndex(parseInt(select.value, 10));
  }
}

function saveCurrentFormToMemory() {
  if (currentRecordIndex < 0 || !fullDbData[currentRecordIndex]) return;
  fields.forEach(f => {
    const el = getField(f);
    if (el) {
      fullDbData[currentRecordIndex][f] = el.value.trim();
    }
  });
}

function updateImageFromInput() {
  const mainFile = getField('soubor_hlavni')?.value.trim();
  const previewImg = document.getElementById('previewImg');
  const thumbList = document.getElementById('thumbList');
  if (!previewImg || !thumbList) return;

  thumbList.innerHTML = '';

  if (!mainFile) {
    previewImg.src = '';
    return;
  }

  previewImg.src = `./scans/${mainFile}`;
  previewImg.onerror = function() { this.src = ''; };

  if (viewerInstance) viewerInstance.destroy();
  viewerInstance = new Viewer(previewImg);

  const detailFiles = (getField('soubory_detaily')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const allFiles = [mainFile, ...detailFiles];

  allFiles.forEach((f, idx) => {
    const thumb = document.createElement('img');
    thumb.className = `thumb-item ${idx === 0 ? 'active' : ''}`;
    thumb.src = `./scans/${f}`;
    thumb.onerror = function() { this.src = ''; };
    thumb.onclick = () => {
      previewImg.src = `./scans/${f}`;
      document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('active'));
      thumb.classList.add('active');
    };
    thumbList.appendChild(thumb);
  });
}

async function saveCurrentRecordToSupabase() {
  saveCurrentFormToMemory();
  const record = fullDbData[currentRecordIndex];
  if (!record) return;

  showStatus('🚀 Ukládám do databáze...', 'yellow');

  const payload = {
    ...record,
    year: record.year ? parseInt(record.year, 10) : null,
    is_public: true
  };

  try {
    const { data, error } = await supabaseClient
      .from('posters')
      .upsert(payload)
      .select();

    if (error) throw error;

    if (data && data.length > 0) {
      fullDbData[currentRecordIndex] = data[0];
    }

    populateRecordSelect();
    showStatus('✅ Záznam úspěšně uložen do Supabase!', 'green');
  } catch (err) {
    console.error("Chyba při ukládání:", err);
    showStatus('❌ Chyba při ukládání: ' + err.message, 'red');
  }
}

async function addNewRecord() {
  saveCurrentFormToMemory();
  const newRecord = { title: 'Nový plakát', period_era: 'Art Deco', is_public: true };

  showStatus('➕ Vytvářím nový záznam...', 'yellow');
  try {
    const { data, error } = await supabaseClient
      .from('posters')
      .insert([newRecord])
      .select();

    if (error) throw error;

    fullDbData.push(data[0]);
    populateRecordSelect();
    loadRecordByIndex(fullDbData.length - 1);
    showStatus(`✅ Vytvořen nový plakát #${data[0].id}`, 'green');
  } catch (err) {
    showStatus('❌ Chyba při vytváření: ' + err.message, 'red');
  }
}

async function duplicateCurrentRecord() {
  if (currentRecordIndex < 0 || !fullDbData[currentRecordIndex]) return;
  saveCurrentFormToMemory();

  const current = fullDbData[currentRecordIndex];
  const { id, ...clone } = current;
  clone.title = (clone.title || '') + ' (Kopie)';

  showStatus('📋 Duplikuji plakát...', 'yellow');
  try {
    const { data, error } = await supabaseClient
      .from('posters')
      .insert([clone])
      .select();

    if (error) throw error;

    fullDbData.push(data[0]);
    populateRecordSelect();
    loadRecordByIndex(fullDbData.length - 1);
    showStatus(`✅ Duplikováno jako nový plakát #${data[0].id}`, 'green');
  } catch (err) {
    showStatus('❌ Chyba při duplikaci: ' + err.message, 'red');
  }
}

async function deleteCurrentRecord() {
  if (currentRecordIndex < 0 || !fullDbData[currentRecordIndex]) return;
  const record = fullDbData[currentRecordIndex];

  if (!confirm(`Opravdu chcete SMAZAT plakát #${record.id} (${record.title})?`)) return;

  showStatus(`🗑️ Mažu plakát #${record.id}...`, 'yellow');
  try {
    const { error } = await supabaseClient
      .from('posters')
      .delete()
      .eq('id', record.id);

    if (error) throw error;

    fullDbData.splice(currentRecordIndex, 1);
    populateRecordSelect();
    loadRecordByIndex(Math.max(0, currentRecordIndex - 1));
    showStatus(`🗑️ Plakát #${record.id} byl smazán.`, 'green');
  } catch (err) {
    showStatus('❌ Chyba při mazání: ' + err.message, 'red');
  }
}

function showStatus(msg, color) {
  const el = document.getElementById('statusMessage');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (color === 'green') {
    el.style.backgroundColor = 'rgba(22, 163, 74, 0.2)';
    el.style.border = '1px solid #16a34a';
    el.style.color = '#4ade80';
  } else if (color === 'red') {
    el.style.backgroundColor = 'rgba(220, 38, 38, 0.2)';
    el.style.border = '1px solid #dc2626';
    el.style.color = '#f87171';
  } else {
    el.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
    el.style.border = '1px solid #f59e0b';
    el.style.color = '#fbbf24';
  }
}
