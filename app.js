let allPosters = [];
let filteredPosters = [];
let activeViewerInstance = null;

// Náhradní SVG obrázek, pokud chybí sken
const MISSING_POSTER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <rect width="300" height="400" fill="#181818"/>
  <rect x="20" y="20" width="260" height="360" rx="8" fill="none" stroke="#2a2a2a" stroke-width="2" stroke-dasharray="6 6"/>
  <text x="150" y="190" font-family="sans-serif" font-size="16" fill="#d4af37" text-anchor="middle" font-weight="bold">AFFICHE</text>
  <text x="150" y="215" font-family="sans-serif" font-size="12" fill="#a0a0a0" text-anchor="middle">Sken zatím není k dispozici</text>
</svg>
`)}`;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadPostersFromSupabase();
});

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', filterPosters);
  }

  document.getElementById('eraFilter')?.addEventListener('change', filterPosters);
  document.getElementById('sortFilter')?.addEventListener('change', filterPosters);
}

// Načtení dat z tabulky 'posters' v Supabase
async function loadPostersFromSupabase() {
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
    filterPosters();
  } catch (err) {
    console.error("Chyba při načítání plakátů:", err.message);
  }
}

function filterPosters() {
  const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const selectedEra = document.getElementById('eraFilter')?.value || '';
  const sort = document.getElementById('sortFilter')?.value || 'newest';

  filteredPosters = allPosters.filter(p => {
    const title = (p.title || '').toLowerCase();
    const author = (p.author || '').toLowerCase();
    const client = (p.client || '').toLowerCase();
    const product = (p.product_subject || '').toLowerCase();
    const note = (p.note || '').toLowerCase();
    const period = (p.period_era || '').toLowerCase();

    const matchesSearch = !query || 
      title.includes(query) || 
      author.includes(query) || 
      client.includes(query) || 
      product.includes(query) || 
      note.includes(query);

    const matchesEra = !selectedEra || period === selectedEra.toLowerCase();

    return matchesSearch && matchesEra;
  });

  // Řazení
  if (sort === 'year_asc') {
    filteredPosters.sort((a, b) => (a.year || 9999) - (b.year || 9999));
  } else if (sort === 'year_desc') {
    filteredPosters.sort((a, b) => (b.year || 0) - (a.year || 0));
  } else {
    // Nejsnovější přidané (podle ID / timestampu)
    filteredPosters.sort((a, b) => b.id - a.id);
  }

  renderPosters(filteredPosters);
}

function renderPosters(posters) {
  const grid = document.getElementById('postersGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (posters.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 40px;">Žádné plakáty neodpovídají zadaným kritériím.</p>';
    return;
  }

  posters.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'poster-card';

    // Detaily
    const detailFiles = (p.soubory_detaily || '').split(',').map(s => s.trim()).filter(Boolean);
    const detailCount = detailFiles.length;

    const detailBadgeHTML = detailCount > 0 
      ? `<div class="detail-badge" title="${detailCount} detailních snímků">🔍 ${detailCount} ${detailCount === 1 ? 'detail' : 'detaily'}</div>`
      : '';

    const mainImgSrc = p.soubor_hlavni ? `./scans/${p.soubor_hlavni}` : MISSING_POSTER_SVG;
    const authorText = p.author ? p.author : 'Neznámý autor';
    const yearText = p.year_approx ? p.year_approx : (p.year ? p.year : '');

    card.onclick = () => openPosterGallery(p);

    card.innerHTML = `
      <div class="poster-img-wrapper">
        ${detailBadgeHTML}
        <img src="${mainImgSrc}" loading="lazy" alt="${p.title}" onerror="this.onerror=null; this.src='${MISSING_POSTER_SVG}';">
      </div>
      <div class="poster-info">
        <div class="poster-title">${p.title}</div>
        <div class="poster-meta">
          <span class="poster-author">${authorText}</span>
          ${yearText ? ` • <span>${yearText}</span>` : ''}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// Otevření celé galerie (hlavní sken + detaily) ve Viewer.js
function openPosterGallery(poster) {
  if (activeViewerInstance) {
    activeViewerInstance.destroy();
    activeViewerInstance = null;
  }

  const container = document.createElement('div');
  container.style.display = 'none';

  // 1. Hlavní obrázek
  const mainImg = document.createElement('img');
  mainImg.src = poster.soubor_hlavni ? `./scans/${poster.soubor_hlavni}` : MISSING_POSTER_SVG;
  mainImg.alt = `${poster.title} - Hlavní náhled`;
  container.appendChild(mainImg);

  // 2. Detaily
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
