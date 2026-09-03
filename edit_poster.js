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
  showStatus('🔄 Načítám data ze Supabase...', 'gold');
  try {
    const { data, error } = await supabaseClient
      .from('posters')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    fullDbData = data || [];
    showStatus(`✅ Načteno ${fullDbData.length} plakátů.`, 'green');

    populateRecordSelect();
    populateEraDatalist(); // <-- SEM PŘIDAT VOLÁNÍ NAŠEPTÁVAČE

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

  showStatus('🚀 Ukládám do databáze...', 'gold');

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
    populateEraDatalist(); // <-- SEM VLOŽIT VOLÁNÍ
    
    showStatus('✅ Záznam úspěšně uložen do Supabase!', 'green');
  } catch (err) {
    console.error("Chyba při ukládání:", err);
    showStatus('❌ Chyba při ukládání: ' + err.message, 'red');
  }
}

async function addNewRecord() {
  saveCurrentFormToMemory();

  // Vytvoříme plnohodnotný výchozí objekt se všemi poli (stejně jako u duplikace)
  const newRecord = {
    title: 'Nový plakát',
    author: '',
    client: '',
    product_subject: '',
    period_era: 'Art Deco',
    year: null,
    year_approx: '',
    printer: '',
    dimensions: '',
    soubor_hlavni: '',
    soubory_detaily: '',
    note: '',
    is_public: true
  };

  showStatus('➕ Vytvářím nový záznam v Supabase...', 'gold');

  try {
    const { data, error } = await supabaseClient
      .from('posters')
      .insert([newRecord])
      .select();

    if (error) {
      console.error("Supabase Insert Error:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error("Databáze nevrátila vytvořený záznam.");
    }

    // Přidáme nový záznam do lokálního pole a přepneme na něj formulář
    fullDbData.push(data[0]);
    populateRecordSelect();
    loadRecordByIndex(fullDbData.length - 1);

    showStatus(`✅ Vytvořen nový plakát #${data[0].id}`, 'green');
  } catch (err) {
    console.error("Chyba při vytváření záznamu:", err);
    showStatus('❌ Chyba při vytváření: ' + (err.message || 'Neznámá chyba'), 'red');
  }
}

async function duplicateCurrentRecord() {
  if (currentRecordIndex < 0 || !fullDbData[currentRecordIndex]) return;
  saveCurrentFormToMemory();

  const current = fullDbData[currentRecordIndex];
  const { id, ...clone } = current;
  clone.title = (clone.title || '') + ' (Kopie)';

  showStatus('📋 Duplikuji plakát...', 'gold');
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

  showStatus(`🗑️ Mažu plakát #${record.id}...`, 'gold');
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
    el.style.backgroundColor = 'rgba(212, 175, 55, 0.2)';
    el.style.border = '1px solid #d4af37';
    el.style.color = '#d4af37';
  }
}

/* INBOX NEPŘIŘAZENÝCH SKENŮ Z GITHUB API + KŘÍŽOVÁ KONTROLA SE SUPABASE */
async function scanUnassignedImages() {
  const container = document.getElementById('unassignedScansList');
  const scanBtn = document.getElementById('btnScanFolder');
  if (!container) return;

  if (scanBtn) scanBtn.disabled = true;
  container.innerHTML = '<div style="font-size: 0.8rem; color: var(--accent-gold); text-align: center; padding: 10px;">🔍 Prohledávám adresář /scans/ přes GitHub API...</div>';

  try {
    // NASTAVTE SPRÁVNOU CESTU K VAŠEMU GITHUB REPOZITÁŘI (uživatel/repo):
    const githubRepoUrl = 'https://api.github.com/repos/19forever/affiche/contents/scans';

    const res = await fetch(githubRepoUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!res.ok) {
      throw new Error(`GitHub API vrátilo status ${res.status}: ${res.statusText}`);
    }

    const files = await res.json();
    if (!Array.isArray(files)) {
      throw new Error('Neočekávaná odpověď z GitHub API.');
    }

    // Projdeme všechny plakáty v databázi a posbíráme použité skeny
    const assignedSet = new Set();
    if (Array.isArray(fullDbData)) {
      fullDbData.forEach(row => {
        if (!row) return;

        // Kontrola hlavního skenu
        if (row.soubor_hlavni && typeof row.soubor_hlavni === 'string') {
          assignedSet.add(row.soubor_hlavni.trim().toLowerCase());
        }

        // Kontrola detailních skenů
        if (row.soubory_detaily && typeof row.soubory_detaily === 'string') {
          row.soubory_detaily.split(',').forEach(part => {
            const trimmed = part.trim();
            if (trimmed) assignedSet.add(trimmed.toLowerCase());
          });
        }
      });
    }

    const imageExtRegex = /\.(jpe?g|png|webp|gif|bmp)$/i;
    const unassigned = files.filter(f => {
      if (f.type !== 'file') return false;
      if (!imageExtRegex.test(f.name)) return false;
      return !assignedSet.has(f.name.toLowerCase());
    });

    container.innerHTML = '';
    const countBadge = document.getElementById('unassignedCountBadge');
    if (countBadge) {
      countBadge.textContent = unassigned.length;
      countBadge.style.display = 'inline-block';
    }

    if (unassigned.length === 0) {
      container.innerHTML = '<div style="font-size: 0.8rem; color: #4ade80; text-align: center; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 4px;">🎉 Všechny obrázky ve složce /scans/ jsou přiřazeny k plakátům!</div>';
      showStatus('✅ Žádné nepřiřazené skeny nenalezeny.', 'green');
      return;
    }

    showStatus(`📂 Nalezeno ${unassigned.length} nepřiřazených skenů.`, 'gold');

    unassigned.forEach(item => {
      const card = document.createElement('div');
      card.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px;';

      const leftDiv = document.createElement('div');
      leftDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;';

      const imgSrc = item.download_url || `./scans/${encodeURIComponent(item.name)}`;
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = item.name;
      img.style.cssText = 'width: 42px; height: 56px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color); background: #000; flex-shrink: 0; cursor: pointer;';
      img.onerror = function() {
        this.src = `./scans/${encodeURIComponent(item.name)}`;
      };

      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.name;
      nameSpan.title = item.name;
      nameSpan.style.cssText = 'font-size: 0.75rem; color: var(--text-main); word-break: break-all; line-height: 1.2; font-family: monospace; flex: 1;';

      leftDiv.appendChild(img);
      leftDiv.appendChild(nameSpan);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-action btn-green';
      btn.title = 'Vytvořit nový plakát z tohoto skenu';
      btn.style.cssText = 'width: 32px; height: 32px; padding: 0; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 4px;';
      btn.textContent = '➕';
      btn.onclick = function() {
        createRecordFromScan(item.name);
      };

      card.appendChild(leftDiv);
      card.appendChild(btn);
      container.appendChild(card);
    });

  } catch (err) {
    console.error("Chyba při skenování složky:", err);
    container.innerHTML = `<div style="font-size: 0.75rem; color: #f87171; padding: 8px; background: rgba(220,38,38,0.1); border-radius: 4px;">❌ ${err.message}</div>`;
    showStatus('❌ Chyba při skenování složky /scans/: ' + err.message, 'red');
  } finally {
    if (scanBtn) scanBtn.disabled = false;
  }
}

async function createRecordFromScan(filename) {
  if (!filename) return;
  saveCurrentFormToMemory();

  // Vytvoříme objekt BEZ sloupce id, aby databáze přiřadila autoincrement ID
  const newRecord = {
    title: filename.replace(/\.[^/.]+$/, "").replace(/_/g, " "), // Název podle souboru
    author: '',
    client: '',
    product_subject: '',
    period_era: 'Art Deco',
    year: null,
    year_approx: '',
    printer: '',
    dimensions: '',
    soubor_hlavni: filename,
    soubory_detaily: '',
    note: '',
    is_public: true
  };

  showStatus(`➕ Vytvářím nový plakát v Supabase pro sken ${filename}...`, 'gold');
  try {
    const { data, error } = await supabaseClient
      .from('posters')
      .insert([newRecord])
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error("Databáze nevrátila vytvořený záznam.");
    }

    fullDbData.push(data[0]);
    populateRecordSelect();
    loadRecordByIndex(fullDbData.length - 1);
    
    // Obnovíme seznam nepřiřazených skenů
    scanUnassignedImages();
    
    showStatus(`✅ Vytvořen nový plakát #${data[0].id} pro sken ${filename}`, 'green');
  } catch (err) {
    showStatus('❌ Chyba při vytváření záznamu: ' + err.message, 'red');
  }
}

// Naplnění našeptávače unikátními styly z databáze
function populateEraDatalist() {
  const datalist = document.getElementById('erasList');
  if (!datalist) return;

  datalist.innerHTML = '';
  const erasSet = new Set();

  if (Array.isArray(fullDbData)) {
    fullDbData.forEach(r => {
      const era = (r.period_era || '').trim();
      if (era) erasSet.add(era);
    });
  }

  Array.from(erasSet).sort().forEach(era => {
    const opt = document.createElement('option');
    opt.value = era;
    opt.textContent = era; // Zajišťuje správné vykreslení nabídky
    datalist.appendChild(opt);
  });
}
