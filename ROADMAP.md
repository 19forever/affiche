# Roadmap: Projekt Sbírky Reklamních Plakátů

Aplikace pro správu a prezentaci sbírky vintage reklamních plakátů s pokročilým vyhledáváním. Sestaveno na boitem odzkoušené architektury (Supabase, Vanilla JS, CSS Grid, Viewer.js) s rozšířením pro vertikální náhledy a AI sémantické vyhledávání.

---

## Fáze 1: Databázová infrastruktura & Schema
- [x] Definice datového modelu pro plakáty
- [ ] Vytvoření tabulky `posters` v Supabase
- [ ] Aktivace rozšíření `pgvector` pro ukládání AI embeddingů
- [ ] Nastavení bezpečnostních RLS politik (veřejné čtení, úpravy pouze pro admina)
- [ ] Příprava SQL vyhledávací funkce (`match_posters`) pro vektorové porovnávání

---

## Fáze 2: Adaptace Frontendu (UX/UI & Mřížka)
- [ ] Úprava CSS mřížky pro vertikální formáty (poměr stran 3:4 / 2:3)
- [ ] Návrh karty plakátu s akční lištou (Autor, Klient, Tiskárna, Rozměry, Technika, Poznámka)
- [ ] Implementace logiky pro hlavní sken + pole detailních snímků
- [ ] Přidání odznaku s počtem detailních snímků na náhledový obrázek (např. `🔍 3 detaily`)
- [ ] Propojení Viewer.js s podporou přímého skoku na detailní makro snímky

---

## Fáze 3: AI Vektorové Vyhledávání (pgvector & Embeddings)
- [ ] Integrace modelu (např. CLIP / Transformers.js) pro převod dotazu a obrázků na vektory
- [ ] Implementace sémantického vyhlašování přes RPC funkci v Supabase (hledání podle témat, barvy či atmosféry – např. *"moře"*, *"červená"*, *"secesní"*)
- [ ] Propojení AI vyhledávače s hlavním vyhledávacím polem v rozhraní

---

## Fáze 4: Administrační rozhraní & Editor
- [ ] Úprava formuláře pro zadávání nového plakátu (autor, obdobík, technika, tiskárna, rozměry)
- [ ] Automatické generování vektorového otisku (embeddingu) při uložení nového plakátu
- [ ] Zabezpečení relace přes admin přístup
