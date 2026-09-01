let featureExtractor = null;
let tokenizer = null;
let textModel = null;
let visionModel = null;

document.addEventListener('DOMContentLoaded', async () => {
  checkSession();
  preloadClipModel();
});

// 1. Kontrola přihlášení a správa relace
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

// 2. Příprava AI CLIP Modelu (Transformers.js v prohlížeči)
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
    console.warn("AI Model se nepodařilo načíst v popředí, zkusíme to při ukládání:", err);
  }
}

// Generování vektoru z obrázku
async function generateImageEmbedding(imageUrl) {
  try {
    if (!window.transformers) return null;
    const { RawImage, AutoProcessor, CLIPVisionModelWithProjection } = window.transformers;

    if (!featureExtractor) featureExtractor = await AutoProcessor.from_pretrained('Xenova/clip-ViT-B-32');
    if (!visionModel) visionModel = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-ViT-B-32');

    const image = await RawImage.fromURL(imageUrl);
    const imageInputs = await featureExtractor(image);
    const { image_embeds } = await visionModel(imageInputs);

    return Array.from(image_embeds.data);
  } catch (err) {
    console.error("Chyba při generování AI vektoru z obrázku:", err);
    return null;
  }
}

// 3. Uložení plakátu do databáze (včetně AI Vektoru)
async function savePoster(e) {
  e.preventDefault();

  const submitBtn = document.querySelector('.btn-submit');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '🔄 Zpracovávám a generuji AI vektor...';

  const mainImgFileName = document.getElementById('soubor_hlavni').value.trim();
  const mainImgUrl = `./scans/${mainImgFileName}`;

  // Pokus o vygenerování AI embeddingu z hlavního skenu
  let embeddingVector = null;
  if (mainImgFileName) {
    embeddingVector = await generateImageEmbedding(mainImgUrl);
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
    soubor_hlavni: mainImgFileName,
    soubory_detaily: document.getElementById('soubory_detaily').value.trim(),
    note: document.getElementById('note').value,
    is_public: true
  };

  if (embeddingVector) {
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

    alert('Plakát byl úspěšně uložen do databáze' + (embeddingVector ? ' včetně AI vektoru!' : '.'));
    window.location.href = 'index.html';
  } catch (err) {
    alert('Chyba při ukládání: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}
