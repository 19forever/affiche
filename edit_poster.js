let featureExtractor = null;
let tokenizer = null;
let textModel = null;
let visionModel = null;

document.addEventListener('DOMContentLoaded', async () => {
  await checkSession();
  preloadClipModel();
  loadPosterForEdit();
});

// 1. Kontrola relace a správa autorizace
async function checkSession() {
  if (typeof supabaseClient === 'undefined') return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (session) {
    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('editorForm').style.display = 'block';
  } else {
    document.getElementById('loginGate').style.display = 'block';
    document.getElementById('editorForm').style.display = 'none';
  }
}

async function handleLogin() {
  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  const errDiv = document.getElementById('loginError');
  errDiv.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    errDiv.textContent = 'Chyba přihlášení: ' + error.message;
  } else {
    checkSession();
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  checkSession();
}

// 2. Načtení dat stávajícího plakátu při úpravě podle URL (?id=...)
async function loadPosterForEdit() {
  const urlParams = new URLSearchParams(window.location.search);
  const posterId = urlParams.get('id');

  if (!posterId) return;

  document.getElementById('formTitle').textContent = '✏️ Upravit plakát #' + posterId;
  document.getElementById('posterId').value = posterId;

  try {
    const { data, error } = await supabaseClient
      .from('posters')
      .select('*')
      .eq('id', posterId)
      .single();

    if (error) throw error;
    if (!data) return;

    document.getElementById('title').value = data.title || '';
    document.getElementById('author').value = data.author || '';
    document.getElementById('client').value = data.client || '';
    document.getElementById('year').value = data.year || '';
    document.getElementById('year_approx').value = data.year_approx || '';
    document.getElementById('period_era').value = data.period_era || 'Art Deco';
    document.getElementById('product_subject').value = data.product_subject || '';
    document.getElementById('printer').value = data.printer || '';
    document.getElementById('dimensions').value = data.dimensions || '';
    document.getElementById('soubor_hlavni').value = data.soubor_hlavni || '';
    document.getElementById('soubory_detaily').value = data.soubory_detaily || '';
    document.getElementById('note').value = data.note || '';

  } catch (err) {
    console.error("Chyba při načítání plakátu k úpravě:", err.message);
  }
}

// 3. Příprava AI CLIP Modelu (Transformers.js)
async function preloadClipModel() {
  try {
    if (window.transformers) {
      const { AutoTokenizer, CLIPTextModelWithProjection, AutoProcessor, CLIPVisionModelWithProjection } = window.transformers;
      
      tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-ViT-B-32');
      textModel = await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-ViT-B-32');
      featureExtractor = await AutoProcessor.from_pretrained('Xenova/clip-ViT-B-32');
      visionModel = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-ViT-B-32');
    }
  } catch (err) {
    console.warn("AI Model se načte při ukládání souboru.", err);
  }
}

// Vytvoření AI vektoru z lokálně vybraného obrázku
async function generateImageEmbeddingFromFile(file) {
  try {
    if (!window.transformers || !file) return null;
    const { RawImage, AutoProcessor, CLIPVisionModelWithProjection } = window.transformers;

    if (!featureExtractor) featureExtractor = await AutoProcessor.from_pretrained('Xenova/clip-ViT-B-32');
    if (!visionModel) visionModel = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-ViT-B-32');

    const image = await RawImage.fromURL(URL.createObjectURL(file));
    const imageInputs = await featureExtractor(image);
    const { image_embeds } = await visionModel(imageInputs);

    return Array.from(image_embeds.data);
  } catch (err) {
    console.error("Chyba při zpracování obrázku pro AI:", err);
    return null;
  }
}

// Záložní vytvoření AI vektoru z textových polí plakátu
async function generateTextEmbeddingForPoster(text) {
  try {
    if (!window.transformers || !text.trim()) return null;
    const { AutoTokenizer, CLIPTextModelWithProjection } = window.transformers;

    if (!tokenizer) tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-ViT-B-32');
    if (!textModel) textModel = await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-ViT-B-32');

    const textInputs = tokenizer([text], { padding: true, truncation: true });
    const { text_embeds } = await textModel(textInputs);

    return Array.from(text_embeds.data);
  } catch (err) {
    console.error("Chyba při generování textového vektoru:", err);
    return null;
  }
}

// 4. Hlavní uložení záznamu do databáze
async function savePoster(e) {
  e.preventDefault();

  const submitBtn = document.querySelector('.btn-submit');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '🔄 Generuji AI vektor (může trvat pár sekund)...';

  const fileInput = document.getElementById('file_input');
  const selectedFile = fileInput && fileInput.files ? fileInput.files[0] : null;

  let embeddingVector = null;

  // A. Pokus o vygenerování ze souboru
  if (selectedFile) {
    embeddingVector = await generateImageEmbeddingFromFile(selectedFile);
  }

  // B. Záložní pokus z textových údajů
  if (!embeddingVector) {
    const textContext = [
      document.getElementById('title').value,
      document.getElementById('author').value,
      document.getElementById('client').value,
      document.getElementById('product_subject').value,
      document.getElementById('note').value
    ].filter(Boolean).join(' ');

    embeddingVector = await generateTextEmbeddingForPoster(textContext);
  }

  const payload = {
    title: document.getElementById('title').value,
    author: document.getElementById('author').value,
    client: document.getElementById('client').value,
    year: document.getElementById('year').value ? parseInt(document.getElementById('year').value, 10) : null,
    year_approx: document.getElementById('year_approx').value,
    period_era: document.getElementById('period_era').value,
    product_subject: document.getElementById('product_subject').value,
    printer: document.getElementById('printer').value,
    dimensions: document.getElementById('dimensions').value,
    soubor_hlavni: document.getElementById('soubor_hlavni').value.trim(),
    soubory_detaily: document.getElementById('soubory_detaily').value.trim(),
    note: document.getElementById('note').value,
    is_public: true
  };

  if (embeddingVector && embeddingVector.length === 512) {
    payload.embedding = embeddingVector;
  }

  const id = document.getElementById('posterId').value;

  try {
    let result;
    if (id) {
      result = await supabaseClient.from('posters').update(payload).eq('id', id);
    } else {
      result = await supabaseClient.from('posters').insert([payload]);
    }

    if (result.error) throw result.error;

    alert('Plakát úspěšně uložen!\nAI Vektor: ' + (payload.embedding ? 'VYGENEROVÁN' : 'NEVYGENEROVÁN'));
    window.location.href = 'index.html';
  } catch (err) {
    alert('Chyba při ukládání: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}
