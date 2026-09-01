document.addEventListener('DOMContentLoaded', async () => {
  checkSession();
});

// Kontrola přihlášeného uživatele v Supabase
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

// Přihlášení
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

// Odhlášení
async function handleLogout() {
  await supabaseClient.auth.signOut();
  checkSession();
}

// Uložení záznamu do databáze
async function savePoster(e) {
  e.preventDefault();

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

  const id = document.getElementById('posterId').value;

  try {
    let result;
    if (id) {
      // Úprava stávajícího
      result = await supabaseClient.from('posters').update(payload).eq('id', id);
    } else {
      // Nový plakát
      result = await supabaseClient.from('posters').insert([payload]);
    }

    if (result.error) throw result.error;

    alert('Plakát byl úspěšně uložen!');
    window.location.href = 'index.html';
  } catch (err) {
    alert('Chyba při ukládání: ' + err.message);
  }
}
