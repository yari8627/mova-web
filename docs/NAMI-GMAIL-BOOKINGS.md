# NAMI — Importazione Prenotazioni da Gmail, MVP locale

## Base e perimetro

Branch `feature/nami-gmail-bookings`, base `ec05ec5c163bc4a045564fa8cf1198c7518a0327`.
Il 22 novembre 2026 GitHub main e Vercel Production Overview sono stati verificati
su questa stessa revisione, deployment `HW62vHEkdvvNfFv5kHJifoc23i39`, Ready,
dominio `mova-web-flax.vercel.app`. Il main locale divergente non è stato alterato.
Worktree dedicato; nessun contenuto del branch Web Push è stato importato o modificato.

MVP: collegamento Gmail distinto dal login NAMI, ricerca manuale paginata,
parser strutturato JSON-LD e fallback testuale IT/EN, anteprima modificabile,
associazione a un viaggio esistente, conferma esplicita e deduplicazione persistente.
L'anteprima ammette soltanto messaggi con un riferimento esplicito: PNR, codice/
numero di prenotazione o conferma, numero di biglietto, oppure un identificativo
valido nella prenotazione strutturata. Date, prezzi, telefoni e numeri di volo
non bastano. Anche una conferma autentica viene esclusa se il riferimento è
presente soltanto in un allegato PDF, che questa versione non legge.
Voli, hotel, treni/bus/traghetti, noleggio auto e attività sono rappresentati con
le categorie Booking già presenti. Numero volo, intestatario/ospiti e dettagli
aggiuntivi vengono riportati nelle note quando riconoscibili. Non vengono inventati
orari o fusi: i dati ambigui richiedono correzione manuale in formato ISO con offset.
Le date vengono salvate come istanti; Prenotazioni le visualizza nel fuso del
dispositivo e le note conservano gli orari originali esplicitamente confermati.

Le cancellazioni sono segnalate e non importabili: l'utente verifica la prenotazione
esistente attraverso i normali comandi. Le modifiche richiedono la scelta esplicita
del record da aggiornare e una revisione ancora corrispondente all'anteprima.
Nessuna creazione di viaggi, modifica di spese/itinerari, AI esterna, PDF, watch,
push Gmail/NAMI, scheduler o importazione automatica.

## Configurazione locale, da eseguire manualmente

1. Usare un database PostgreSQL locale isolato con lo schema NAMI della baseline.
   Non usare `nami_push_test`, MOVA o credenziali Vercel. La riga DATABASE_URL storica
   SQLite in `.env.example` non è adatta: il datasource effettivo è PostgreSQL.
2. Revisionare/applicare **solo su quel database isolato** la proposta additiva
   `docs/proposals/gmail-bookings.sql`. Non usare `prisma db push` né migrazioni
   storiche SQLite. Non sono modificati Booking, Trip, User o AuthSession.
3. Nello stesso Google Cloud project di sviluppo abilitare Gmail API, configurare
   il client OAuth web e la schermata di consenso con utenti di test autorizzati.
   È consigliato un progetto di sviluppo separato da quello del login Production.
4. Registrare esattamente `http://localhost:3000/api/gmail/callback` per lo sviluppo;
   host/porta devono corrispondere a `NAMI_GMAIL_ORIGIN`. Per il futuro sito HTTPS,
   registrare una callback distinta. Non cambiare la callback del login esistente.
5. Configurare localmente `NAMI_GMAIL_CLIENT_ID`, `NAMI_GMAIL_CLIENT_SECRET`,
   `NAMI_GMAIL_ORIGIN`, `NAMI_GMAIL_TOKEN_KEYS` (JSON di chiavi casuali AES di 32 byte
   in base64url), `NAMI_GMAIL_KEY_VERSION` e `NAMI_GMAIL_ENABLED=1`.
   Nessuna chiave operativa è stata generata o configurata da questa implementazione.
   Non usare prefissi NEXT_PUBLIC; conservare le vecchie versioni durante rotazione.
6. Avviare Next con le normali sessioni NAMI locali. In Prenotazioni scegliere
   Importa da Gmail → Collega Gmail → consenso → Cerca prenotazioni. Il periodo
   iniziale è di dodici mesi, modificabile fino a cinque anni per richiesta.
   Ogni pagina legge al massimo dieci messaggi; altre pagine richiedono un click.
7. Verificare campi e viaggio, selezionare al massimo 50 righe, premere Conferma
   importazione. Ogni riga viene salvata atomicamente e il riepilogo distingue
   importate, aggiornate, saltate/escluse e non importate. Una riga fallita non
   nasconde le righe già confermate e non viene marcata come importata.

La configurazione manca intenzionalmente nel worktree e l'integrazione è OFF.
Non sono stati letti o copiati Secret, file .env operativi o messaggi personali.

## Sicurezza e persistenza

- Richiesto solo `gmail.readonly` oltre a openid/email per identificare l'account.
  Il login Google NAMI preesistente e le sue variabili restano invariati.
- OAuth state casuale monouso (hash nel DB, scadenza dieci minuti), cookie HttpOnly
  SameSite Lax con path dedicato, PKCE S256, binding a utente e vera sessione NAMI,
  callback/origine fissa. Token cifrati AES-256-GCM con AAD per utente/collegamento.
- Tutte le API richiedono una sessione NAMI; le scritture verificano Origin.
  Refresh/access token, verifier e corpi delle email non vengono inviati al client
  né registrati dall'app. I log del futuro provider/database devono evitare payload
  OAuth, query parametriche e corpi delle richieste sensibili.
- Preview e cursori sono cifrati/autenticati con finalità, utente, epoch del
  collegamento e scadenza. Nessun testo completo delle email è conservato in DB;
  il browser riceve solo intestazioni e dati estratti per l'anteprima in memoria.
  HTML non viene renderizzato. Limiti su dimensioni, profondità MIME e timeout.
- Tabelle private in `nami_gmail`, nessun grant ai ruoli browser/provider, nessun
  ruolo nuovo o BYPASSRLS. Tutte le query contengono parametri di utente e account
  server-side. Con migration owner distinto dal server role occorre concedere
  esplicitamente solo USAGE e DML al ruolo applicativo; niente grant a PUBLIC.
- Ledger con unicità persistente per utente/account/messaggio-segmento e fingerprint,
  reference key per segnalare modifiche, lock transazionale per account e lock
  esclusivo sul viaggio per serializzare anche importazioni di co-organizzatori. Il ruolo
  sul viaggio è ricontrollato durante il commit. Aggiornamenti controllano anche
  l'impronta della prenotazione mostrata in anteprima.
- `booking_id` del ledger è un riferimento logico stabile: il sync manuale storico
  cancella/ricrea righe con gli stessi ID. Una FK ON DELETE SET NULL perderebbe
  il legame anche durante una semplice modifica manuale. Il target è verificato
  nella transazione d'importazione; gli ID/hashes restano nel ledger dopo una
  cancellazione manuale per impedire la reimportazione silenziosa dello stesso messaggio.
- Scollega elimina subito token e stati OAuth dell'utente e tenta la revoca Google.
  Un errore di rete viene esplicitamente riportato: revoca remota da verificare
  nell'account Google. Il ledger minimale resta per deduplicare un eventuale ricollegamento
  dello stesso account. La cancellazione User lo elimina per FK ON DELETE CASCADE.

## Prove riproducibili

```powershell
node --test scripts/gmail-bookings.test.cjs scripts/booking-datetime.test.cjs scripts/auth-ui.test.cjs scripts/profile-ui.test.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
```

62/62 test PASS: 37 Gmail più 25 regressioni Prenotazioni/auth/profilo.
I test usano email sintetiche, Google simulato e un adapter transazionale in memoria;
non attestano l'esecuzione della proposta su PostgreSQL reale né il comportamento
di due connessioni PostgreSQL. La build non applica SQL e non richiede Gmail.

Fixture UI isolata, con il componente React effettivo e API finte:

```powershell
node scripts/gmail-browser-fixture.cjs
node node_modules/next/dist/bin/next dev .tools/gmail-ui-fixture --hostname 127.0.0.1 --port 3197
```

Provati: apertura, ricerca, annullamento con zero conferme, modifica, scelta viaggio,
conferma singola, riepilogo. Layout 320/390/1440 px senza overflow, campi 16 px,
due colonne desktop e portal che esce dal contenitore trasformato della fixture.
Non equivale a collaudo Safari iPhone fisico o Google OAuth reale.

## Prerequisiti per un futuro rilascio

Mancano collaudo OAuth/Gmail con utenti di test, applicazione SQL su PostgreSQL
isolato e prova di concorrenza reale, poi prova sulla PWA iPhone. Nessun rilascio
Production è autorizzato o eseguito.

`gmail.readonly` è restricted. Testing con utenti autorizzati e distribuzione
pubblica hanno requisiti diversi: verifica dell'app/scope e, ove applicabile per
il trattamento server-side, assessment di sicurezza richiesto da Google. Le app
esterne in Testing possono ricevere refresh token con durata limitata a sette giorni.
Riferimenti ufficiali:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/auth/web-server
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
