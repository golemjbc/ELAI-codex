# ELAI – AI jídelníček

Chatovací asistentka na plánování a zápis jídelníčku. Uživatel jí píše, co jedl/plánuje,
ona si to pamatuje a případně navrhuje jídla podle historie. Osobnost a pravidla pro
zápis jsou definované v [`data/prompt.txt`](data/prompt.txt), celková architektura v
[`docs/architektura.txt`](docs/architektura.txt).

## Jak to funguje

- **`frontend/`** – statická webová appka (HTML/JS/CSS, žádný framework), instalovatelná
  jako PWA (`manifest.json`, `sw.js`). Volá backend přes REST (`app.js`, konstanta
  `API_BASE`).
- **`backend/`** – Azure Function v Pythonu (`function_app.py`). Nic sama nepočítá –
  jen načte data, poskládá prompt pro OpenAI, uloží odpověď zpátky.
- **`data/`** – ukázková/referenční data ve stejném formátu, v jakém je backend čte
  a zapisuje. **Skutečná provozní data appky žijí v Azure Blob Storage**, tyhle soubory
  jsou jen lokální kopie pro vývoj a referenci:
  - `main.json` – seznam jídel, tagy, poznámky
  - `history.json` – co se doopravdy jedlo (datum, jídlo, typ)
  - `session.json` – dnešní/poslední konverzace
  - `prompt.txt` – systémový prompt (osobnost + pravidla zápisu) posílaný AI

### Tok jednoho dotazu

1. Frontend pošle zprávu na `/api/chat`.
2. Backend načte `main.json`, posledních pár záznamů z `history.json`, dnešní `session.json`.
3. Poskládá prompt (systémové instrukce + main data + historie + konverzace) a zavolá
   OpenAI (`gpt-5-mini`).
4. AI vrátí striktní JSON: `reply` (text pro uživatele) + `actions` (co zapsat: nový
   záznam historie / nové jídlo / poznámka).
5. Backend zapíše, co AI řekla, zpátky do JSON souborů na Blob Storage a vrátí odpověď.

## Nastavení backendu

Zkopíruj `backend/local.settings.json.example` do `backend/local.settings.json`
a doplň skutečné hodnoty (connection string k Azure Storage, název kontejneru, OpenAI
klíč). Tenhle soubor se necommituje (viz `backend/.gitignore`).

```
cd backend
pip install -r requirements.txt
func start
```

## Historie tohoto repa (proč to tak vypadá)

Tahle větev (`cely-projekt-reorganizace`) sjednocuje kód, který dřív žil roztroušený
na disku ve více téměř identických kopiích:

- Existovaly **dvě GitHub repa**: `golemjbc/jidelak` (starší frontend, beze změn od
  19. 2. 2026) a `golemjbc/ELAI-codex` (tohle repo – novější, aktivně upravovaný
  frontend). Tahle větev vychází z `ELAI-codex`, protože byl novější a kompletnější
  (PWA s ikonami, service workerem, vlastním CSS).
- **Backend nebyl vůbec pod gitem.** Existovaly dvě skoro identické kopie
  (`jidelak/function_app.py` a `codex/Azure_backend/function_app.py`) – lišily se
  jen v tom, jak je nastavený název blob kontejneru (natvrdo `"jidla"` vs. přes
  proměnnou prostředí `AZURE_STORAGE_CONTAINER_NAME`). Do repa je zařazená ta druhá
  varianta (`backend/`), protože konfigurace přes proměnnou prostředí je bezpečnější
  a flexibilnější – ale **nebylo možné bez přístupu do Azure ověřit, která kopie je
  ve skutečnosti nasazená jako produkční Function App.** Pokud víš, která to je, dej
  vědět, ať se to případně přehodí.
- Kompletní původní stav (obě zálohy backendu, obě verze frontendu, historická root
  data) zůstává beze změny na disku v `Jidelnicek_zaloha_2026-07-24/` vedle projektu
  – nic z toho nebylo smazáno, jen se nekopírovalo do gitu.

## Staré / nepoužívané (jen pro referenci)

- `golemjbc/jidelak` (GitHub) – starý frontend, samostatné repo, nedotčené.
- Lokálně na disku: `codex/kontejner/` (ukázková data pro alternativní kontejner),
  root soubory `main.json`/`history.json`/`session.json`/`index.html` (nejstarší
  prototyp z 17.–19. 2. 2026).
