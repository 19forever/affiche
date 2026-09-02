let allPosters = [];
let filteredPosters = [];
let currentLayout = 'grid';

let currentPage = 1;
let pageSize = 50;
let currentEra = '';

let activeViewerInstance = null;

const MISSING_POSTER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <rect width="300" height="400" fill="#181818"/>
  <rect x="20" y="20" width="260" height="360" rx="8" fill="none" stroke="#2a2a2a" stroke-width="2" stroke-dasharray="6 6"/>
  <text x="150" y="190" font-family="sans-serif" font-size="16" fill="#f59e0b" text-anchor="middle" font-weight="bold">AFFICHE</text>
  <text x="150" y="215" font-family="sans-serif" font-size="12" fill="#a0a0a0" text-anchor="middle">Sken zatím není k dispozici</text>
</svg>
`)}`;

function checkIsAdmin() {
  try {
    return localStorage.getItem('affiche_admin_mode') === 'true';
  } catch (e) {
    return false;
  }
}

window.lockAdminSession = async function() {
  if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
    await supabaseClient.auth.signOut();
  }
  localStorage.removeItem('affiche_admin_mode');
  window.location.reload();
};

window.handleAdminLogin = function() {
  window.location.href = 'edit_poster.html';
};

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadDataFromSupabase();
});

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 1;
      filterData();
    });
  }

  document.getElementById('searchClearBtn')?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    filterData();
  });

  document.getElementById('eraFilter')?.addEventListener('change', () => {
    currentEra = document.getElementById('eraFilter').value;
    currentPage = 1;
    filterData();
  });

  document.getElementById('sortFilter')?.addEventListener('change', () => {
    filterData();
  });

  document.getElementById('pageSizeFilter')?.addEventListener('change', (e) => {
    pageSize = e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10);
    currentPage = 1;
    renderPaginated();
  });

  document.getElementById('btnGrid')?.addEventListener('click', () => setLayout('grid'));
  document.getElementById('btnList')?.addEventListener('click', () => setLayout('list'));
}

async function loadDataFromSupabase() {
  try {
    if (typeof supabaseClient === 'undefined') {
      console.error("Supabase klient není připojen!");
      return;
    }

    const { data, error } = await supabaseClient
      .from('posters')
      .select('*')
      .eq('is_public', true);

    if (error) throw error;

    allPosters = data || [];
    populateEraFilter();
    updateAdminControls();
    filterData();
  } catch (err) {
    console.error("Chyba při načítání plakátů:", err.message);
  }
}

function updateAdminControls() {
  const isAdmin = checkIsAdmin();
  const adminEditorLink = document.getElementById('adminEditorLink');
  const adminLoginLink = document.getElementById('adminLoginLink');
  const adminLockBtn = document.getElementById('adminLockBtn');

  if (adminEditorLink) adminEditorLink.style.display = isAdmin ? 'inline-flex' : 'none';
  if (adminLockBtn) adminLockBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  if (adminLoginLink) adminLoginLink.style.display = isAdmin ? 'none' : 'inline-flex';
}

function populateEraFilter() {
  const select = document.getElementById('eraFilter');
  if (!select) return;

  const eras = new Set();
  allPosters.forEach(p => {
    if (p.period_era) eras.add(p.period_era.trim());
  });

  select.innerHTML = '<option value="">Všechna období</option>';
  Array.from(eras).sort().forEach(era => {
    const opt = document.createElement('option');
    opt.value = era;
    opt.textContent = era;
    select.appendChild(opt);
  });
}

function filterData() {
  const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const sort = document.getElementById('sortFilter')?.value || 'newest';

  let results = [...allPosters];

  if (query.length > 0) {
    results = results.filter(p => {
      const title = (p.title || '').toLowerCase();
      const author = (p.author || '').toLowerCase();
      const client = (p.client || '').toLowerCase();
      const product = (p.product_subject || '').toLowerCase();
      const note = (p.note || '').toLowerCase();
      const era = (p.period_era || '').toLowerCase();

      return title.includes(query) || 
             author.includes(query) || 
             client.includes(query) || 
             product.includes(query) || 
             note.includes(query) ||
             era.includes(query);
    });
  }

  if (currentEra) {
    results = results.filter(p => (p.period_era || '').toLowerCase() === currentEra.toLowerCase());
  }

  if (sort === 'oldest') {
    results.sort((a, b) => (a.year || 9999) - (b.year || 9999));
  } else if (sort === 'year_desc') {
    results.sort((a, b) => (b.year || 0) - (a.year || 0));
  } else {
    results.sort((a, b) => b.id - a.id);
  }

  filteredPosters = results;
  renderPaginated();
}

function renderPaginated() {
  let pageData = pageSize === 'ALL' ? filteredPosters : filteredPosters.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  renderPosters(pageData);
  renderPaginationControls();
}

function renderPosters(posters) {
  const grid = document.getElementById('postersContainer');
  if (!grid) return;
  grid.innerHTML = '';

  if (posters.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 40px;">Žádné plakáty neodpovídají zadaným kritériím.</p>';
    return;
  }

  const isAdmin = checkIsAdmin();

  posters.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'ticket-card';

    const detailFiles = (p.soubory_detaily || '').split(',').map(s => s.trim()).filter(Boolean);
    const detailCount = detailFiles.length;

    const detailBadgeHTML = detailCount > 0 
      ? `<div class="scan-count-badge" title="${detailCount} detailních snímků">🔍 ${detailCount}</div>`
      : '';

    const editBtnHTML = isAdmin 
      ? `<button class="icon-btn btn-action-edit" onclick="event.stopPropagation(); window.location.href='edit_poster.html?id=${p.id}'" title="Upravit plakát" style="position: absolute; bottom: 8px; right: 8px; z-index: 5;">✏️</button>`
      : '';

    const mainImgSrc = p.soubor_hlavni ? `./scans/${p.soubor_hlavni}` : MISSING_POSTER_SVG;
    const authorText = p.author ? p.author : 'Neznámý autor';
    const yearText = p.year_approx ? p.year_approx : (p.year ? p.year : '');

    card.onclick = () => openPosterGallery(p);

    card.innerHTML = `
      <div class="card-img-wrapper">
        ${detailBadgeHTML}
        <img src="${mainImgSrc}" loading="lazy" alt="${p.title}" onerror="this.onerror=null; this.src='${MISSING_POSTER_SVG}';">
      </div>
      <div class="card-content">
        <div class="card-meta-line1">
          <span class="card-date">${yearText}</span>
          <span class="category-badge">${p.period_era || 'Plakát'}</span>
        </div>
        <div class="card-location-line2" style="font-weight: 700; color: #fff; margin-top: 4px;">${p.title}</div>
        <div class="card-location-line2">${authorText}${p.client ? ` • ${p.client}` : ''}</div>
        ${editBtnHTML}
      </div>
    `;

    grid.appendChild(card);
  });
}

function renderPaginationControls() {
  const container = document.getElementById('paginationContainer');
  if (!container) return;
  container.innerHTML = '';
  if (pageSize === 'ALL' || filteredPosters.length <= pageSize) return;

  const totalPages = Math.ceil(filteredPosters.length / pageSize);

  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn'; 
  prevBtn.textContent = '◄ Předchozí';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => { 
    currentPage--; 
    renderPaginated(); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };
  container.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 10 && Math.abs(i - currentPage) > 3 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) {
        const dots = document.createElement('span'); 
        dots.textContent = '...'; 
        dots.style.color = 'var(--text-muted)';
        container.appendChild(dots);
      }
      continue;
    }
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`; 
    pageBtn.textContent = i;
    pageBtn.onclick = () => { 
      currentPage = i; 
      renderPaginated(); 
      window.scrollTo({ top: 0, behavior: 'smooth' }); 
    };
    container.appendChild(pageBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn'; 
  nextBtn.textContent = 'Další ►';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => { 
    currentPage++; 
    renderPaginated(); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };
  container.appendChild(nextBtn);
}

function setLayout(layout) {
  currentLayout = layout;
  const btnGrid = document.getElementById('btnGrid');
  const btnList = document.getElementById('btnList');
  const container = document.getElementById('postersContainer');

  if (btnGrid) btnGrid.className = `toggle-btn ${layout === 'grid' ? 'active' : ''}`;
  if (btnList) btnList.className = `toggle-btn ${layout === 'list' ? 'active' : ''}`;
  if (container) container.className = `tickets-container ${layout}-view`;

  renderPaginated();
}

function openPosterGallery(poster) {
  if (activeViewerInstance) {
    activeViewerInstance.destroy();
    activeViewerInstance = null;
  }

  const container = document.createElement('div');
  container.style.display = 'none';

  const mainImg = document.createElement('img');
  mainImg.src = poster.soubor_hlavni ? `./scans/${poster.soubor_hlavni}` : MISSING_POSTER_SVG;
  mainImg.alt = `${poster.title} - Hlavní náhled`;
  container.appendChild(mainImg);

  if (poster.soubory_detaily) {
    const details = poster.soubory_detaily.split(',').map(s => s.trim()).filter(Boolean);
    details.forEach((detFile, idx) => {
      const img = document.createElement('img');
      img.src = `./scans/${detFile}`;
      img.alt = `${poster.title} - Detail #${idx + 1}`;
      container.appendChild(img);
    });
  }

  document.body.appendChild(container);

  activeViewerInstance = new Viewer(container, {
    backdrop: true,
    hidden: function() {
      if (activeViewerInstance) {
        activeViewerInstance.destroy();
        activeViewerInstance = null;
      }
      if (container.parentNode) document.body.removeChild(container);
    },
    title: function() {
      const author = poster.author ? ` | Autor: ${poster.author}` : '';
      const client = poster.client ? ` | Klient: ${poster.client}` : '';
      return `${poster.title}${author}${client}`;
    }
  });

  activeViewerInstance.show();
}
