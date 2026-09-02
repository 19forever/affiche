let allPosters = [];
let filteredPosters = [];
let activeViewerInstance = null;
let isUserAdmin = false;

// AI Modely pro textové vyhledávání
let tokenizer = null;
let textModel = null;

// Náhradní SVG obrázek pro chybějící sken
const MISSING_POSTER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <rect width="300" height="400" fill="#181818"/>
  <rect x="20" y="20" width="260" height="360" rx="8" fill="none" stroke="#2a2a2a" stroke-width="2" stroke-dasharray="6 6"/>
  <text x="150" y="190" font-family="sans-serif" font-size="16" fill="#d4af37" text-anchor="middle" font-weight="bold">AFFICHE</text>
  <text x="150" y="215" font-family="sans-serif" font-size="12" fill="#a0a0a0" text-anchor="middle">Sken zatím není k dispozici</text>
</svg>
`)}`;

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  setupEventListeners();
  loadPostersFromSupabase();
  preloadTextEmbeddingModel();
});

// Ověření stavu přihlášeného admina
async function checkAdminAuth() {
  if (typeof supabaseClient === 'undefined') return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  isUserAdmin = !!session;

  const editorBtn = document.getElementById('adminEditorBtn');
  const loginBtn = document.getElementById('adminLoginBtn');
  const logoutBtn = document.getElementById('adminLogoutBtn');

  if (editorBtn) editorBtn.style.display = isUserAdmin ? 'inline-block' : 'none';
  if (logoutBtn) logoutBtn.style.display = isUserAdmin ? 'inline-block' : 'none';
  if (loginBtn) loginBtn.style.display = isUserAdmin ? 'none' : 'inline-block';
}

async function handleLogout() {
  if (typeof supabaseClient !== 'undefined') {
    await supabaseClient.auth.signOut();
    window.location.reload();
  }
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        filterPosters();
      }, 300);
    });
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

// Příprava CLIP modelu pro generování vektoru z textového dotazu
async function preloadTextEmbeddingModel() {
  try {
    const tf = window.transformers;
    if (tf) {
      tf.env.allowLocalModels = false;

      tokenizer = await tf.AutoTokenizer.from_pretrained('Xenova/clip-ViT-B-32');
      textModel = await tf.CLIPTextModelWithProjection.from_pretrained('Xenova/clip-ViT-B-32');
      console.log("AI Vyhledávací model připraven.");
    }
  } catch (err) {
    console.warn("AI model pro vyhledávání se načte při prvním dotazu.", err);
  }
}

// Převod textového dotazu na vektor
async function generateTextEmbedding(text) {
  try {
    const tf = window.transformers;
    if (!tf || !text.trim()) return null;

    tf.env.allowLocalModels = false;

    if (!tokenizer) tokenizer = await tf.AutoTokenizer.from_pretrained('Xenova/clip-ViT-B-32');
    if (!textModel) textModel = await tf.CLIPTextModelWithProjection.from_pretrained('Xenova/clip-ViT-B-32');

    const textInputs = tokenizer([text], { padding: true, truncation: true });
    const { text_embeds } = await textModel(textInputs);

    return Array.from(text_embeds.data);
  } catch (err) {
    console.error("Chyba při generování AI vektoru z textu:", err);
    return null;
  }
}

// Hlavní vyhledávací a filtrovací logika
async function filterPosters() {
  const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const selectedEra = document.getElementById('eraFilter')?.value || '';
  const sort = document.getElementById('sortFilter')?.value || 'newest';

  let results = [...allPosters];

  if (query.length > 0) {
    let aiMatchedIds = null;

    if (query.length > 2) {
      try {
        const queryVector = await generateTextEmbedding(query);
        if (queryVector) {
          const { data, error } = await supabaseClient.rpc('match_posters', {
            query_embedding: queryVector,
            match_threshold: 0.1,
            match_count: 50
          });

          if (!error && data && data.length > 0) {
            aiMatchedIds = new Set(data.map(item => item.id));
          }
        }
      } catch (e) {
        console.warn("AI vyhledávání vynecháno, používám textové hledání.", e);
      }
    }

    results = results.filter(p => {
      const title = (p.title || '').toLowerCase();
      const author = (p.author || '').toLowerCase();
      const client = (p.client || '').toLowerCase();
      const product = (p.product_subject || '').toLowerCase();
      const note = (p.note || '').toLowerCase();
      const era = (p.period_era || '').toLowerCase();

      const textMatch = title.includes(query) || 
                        author.includes(query) || 
                        client.includes(query) || 
                        product.includes(query) || 
                        note.includes(query) ||
                        era.includes(query);

      const aiMatch = aiMatchedIds ? aiMatchedIds.has(p.id) : false;

      return textMatch || aiMatch;
    });
  }

  if (selectedEra) {
    results = results.filter(p => (p.period_era || '').toLowerCase() === selectedEra.toLowerCase());
  }

  if (sort === 'year_asc') {
    results.sort((a, b) => (a.year || 9999) - (b.year || 9999));
  } else if (sort === 'year_desc') {
    results.sort((a, b) => (b.year || 0) - (a.year || 0));
  } else {
    results.sort((a, b) => b.id - a.id);
  }

  filteredPosters = results;
  renderPosters(filteredPosters);
}

// Vykreslení karet v mřížce
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

    const detailFiles = (p.soubory_detaily || '').split(',').map(s => s.trim()).filter(Boolean);
    const detailCount = detailFiles.length;

    const detailBadgeHTML = detailCount > 0 
      ? `<div class="detail-badge" title="${detailCount} detailních snímků">🔍 ${detailCount} ${detailCount === 1 ? 'detail' : 'detaily'}</div>`
      : '';

    const editBtnHTML = isUserAdmin 
      ? `<button class="card-edit-btn" onclick="event.stopPropagation(); window.location.href='edit_poster.html?id=${p.id}'" title="Upravit plakát">✏️ Upravit</button>`
      : '';

    const mainImgSrc = p.soubor_hlavni ? `./scans/${p.soubor_hlavni}` : MISSING_POSTER_SVG;
    const authorText = p.author ? p.author : 'Neznámý autor';
    const yearText = p.year_approx ? p.year_approx : (p.year ? p.year : '');

    card.onclick = () => openPosterGallery(p);

    card.innerHTML = `
      <div class="poster-img-wrapper">
        ${detailBadgeHTML}
        ${editBtnHTML}
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

// Prohlížeč obrázků (Viewer.js)
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
