# NAMI — Importazione Prenotazioni da Gmail

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
node --test scripts/gmail-bookings.test.cjs scripts/gmail-ui.test.cjs scripts/booking-datetime.test.cjs scripts/auth-ui.test.cjs scripts/profile-ui.test.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
```

86/86 test PASS: 57 Gmail, 4 UI Gmail e 25 regressioni Prenotazioni/auth/profilo.
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

## Correzioni estrazione e anteprima, 22 novembre 2026

Baseline Production `6ead26b`. Le correzioni seguenti sono preparate localmente;
push e deploy richiedono l'autorizzazione del titolare. Nessuna modifica OAuth,
schema, Secret o Web Push; nessuna importazione reale in questa verifica.

- Il browser invia il proprio fuso IANA e giorni di ricezione, entrambi inclusi.
  Il server costruisce i confini locali, anche nei cambi d'ora legale, usa epoch
  nella query Gmail e filtra nuovamente ciascun messaggio tramite internalDate.
  Senza fuso o data di ricezione verificabile non presume UTC né la data del
  messaggio inoltrato. Il cursore cifrato è legato anche al fuso; cambiando periodo
  vengono azzerati schede, conteggio e paginazione. Conteggi distinti per pagina
  e complessivi delle email effettivamente esaminate nell'intervallo.
- Il parser legge parti plain e HTML disponibili, JSON-LD e campi testuali
  espliciti. Titolo per categoria e tratta/struttura; nessun oggetto email come
  titolo di ripiego. Operatore distinto dalla struttura. Domini autenticati e
  riferimenti del fornitore nel corpo/forward identificano i provider riconosciuti;
  il solo nome nel mittente non basta. Località ripulite da email/intestazioni.
- Date nominate IT/EN, date numeriche non ambigue e intervalli di soggiorno sono
  conservati anche parzialmente. Nessun anno da timestamp dell'email, ora di
  check-in convenzionale o fuso presunto. Le cifre di prenotazione restano richieste.
  Il modello Booking esistente richiede un istante: date-only degli alloggi sono
  visibili in anteprima, ma ora/fuso vanno confermati prima del salvataggio.
  Una fine rilevata ma incompleta non può essere omessa silenziosamente.
- Eventi di cancellazione/modifica richiedono una comunicazione esplicita, non
  condizioni di cancellazione gratuita o comandi di gestione. Stato incerto
  distinto, inizialmente pending; avvisi deduplicati. Le cancellazioni restano
  non importabili e non eliminano dati esistenti.
- Riepilogo compatto: tipo, titolo, operatore, date, località, codice e stato.
  Viaggio e selezione restano visibili; modifica e origine email sono espandibili.
  Controlli separati data/ora/fuso, input a 16 px. Verificati con dati sintetici
  a 320 e 390 px, senza overflow, modifica dell'ora con conservazione della data,
  associazione viaggio e conferma esplicita; nessun collaudo Safari fisico attestato.

Il riconoscimento è deterministico e non garantisce tutti i layout dei provider:
informazioni senza contesto affidabile restano da completare. PDF non analizzati.
Il rilascio proposto è fix forward sullo stesso progetto, senza nuove migrazioni
o configurazioni. Dopo autorizzazione: fast-forward del solo commit candidato,
Ready/alias Production e prova manuale del filtro e dell'anteprima prima di importare.

## Fix Airbnb e filtri iPhone, successivo a c79b22d

La baseline Production è `c79b22d`; questo fix resta locale fino all'autorizzazione.

Causa verificata sulla struttura del messaggio, senza archiviarne il contenuto:
le parti plain/HTML disponibili sono entro i limiti già esistenti e non richiedono
OCR. Il nome è in un h2 senza etichetta, mentre check-in/out sono blocchi di tabella
con righe vuote tra giorno della settimana, data completa e limite orario. Il parser
precedente leggeva una sola riga e non riconosceva l'abbreviazione italiana `gen`.
L'indirizzo era seguito da un comando di navigazione, da escludere dall'estrazione.

- Priorità alla scheda HTML Airbnb: titolo della struttura esatto, località dal
  titolo del soggiorno, indirizzo completo nel campo geografico esistente, ospiti
  nelle note e riepilogo. Conservate le alternative MIME; processati anche forward
  message/rfc822 già disponibili come albero MIME, senza aprire PDF o immagini.
- Confini di paragrafi, titoli e celle preservati; campi su righe separate e mesi
  IT abbreviati riconosciuti. Il timestamp del forward non fornisce anno o date.
- `dopo le ore` e `entro le ore` restano limiti, visibili in anteprima e nelle note
  salvate. Il rendering delle sole prenotazioni Airbnb importate usa tali limiti,
  senza mostrarli come appuntamenti esatti. Nessuna modifica al modello database.
- Con Norway/Norvegia/Norge esplicito nell'indirizzo si deriva Europe/Oslo tramite
  Intl; non si usa il fuso del dispositivo come fuso dell'alloggio. Ore locali
  inesistenti/ambigue e indirizzi senza una zona riconosciuta non vengono presunti.
  Il messaggio verificato fornisce dati sufficienti: nessun nuovo passaggio manuale.
- Se i dati sono completi, nessun avviso generico di dati mancanti. Se mancano dati
  testuali ed esistono immagini, viene spiegato che i pixel non vengono analizzati.
- Filtri in griglia con minmax(0,1fr), min-width:0, max-width:100% e border-box;
  sotto 420 px sono sovrapposti. Contenimento dei due input e assenza di overflow
  verificati a 320, 375 e 390 px nel browser; Safari su iPhone fisico non attestato.

Prova reale del parser esclusivamente in memoria: nove riscontri positivi su nome,
operatore, indirizzo, località, ospiti, riferimento, check-in, check-out e assenza
di avvisi. Nessuna email reale salvata in file, fixture o log; nei test e screenshot
sono usati nomi, indirizzi, date e riferimenti interamente sintetici.

86 test, typecheck e build PASS. Regressioni incluse per MIME/forward, HTML Airbnb,
ora legale, semantica dopo/entro, salvataggio e deduplicazione. Filtro di ricezione,
cursori, chiavi dedupe, OAuth, database e notifiche restano invariati. Nessun push,
deploy o importazione reale autorizzati da questa preparazione.

`gmail.readonly` è restricted. Testing con utenti autorizzati e distribuzione
pubblica hanno requisiti diversi: verifica dell'app/scope e, ove applicabile per
il trattamento server-side, assessment di sicurezza richiesto da Google. Le app
esterne in Testing possono ricevere refresh token con durata limitata a sette giorni.
Riferimenti ufficiali:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/auth/web-server
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification


## PDF testuali — Release locale
L’azione Cerca esamina messaggi candidati per parole di conferma/voucher o mittenti di viaggio noti, senza includere indiscriminatamente ogni filename:pdf. Nessun nuovo scope. Sono considerati solo allegati MIME application/pdf con estensione PDF; intestazione e trailer devono essere validi. Recupero per ID Gmail soltanto, nessun link documento. I PDF non vengono persistiti.

Limiti: 1 MB reale per PDF, 10 pagine, 100.000 caratteri, 2 allegati per messaggio e per richiesta. Il cursore cifrato conserva i messaggi da arricchire: quelli rimandati al termine del budget non sono scartati. Continuano a valere 20 richieste/90 secondi totali di ricerca, senza aumento dei limiti. Download 2,5 s, estrazione 3,5 s in worker con heap 96 MB, terminazione forzata e stdout/stderr non pubblicati. Preflight Flate limitato a 2 MB per stream e 5 MB totali; massimo 200 stream; filtri concatenati o non supportati sono rifiutati. Nessun rendering, JavaScript, XFA, OCR o fetch di risorse documento. Il client concede fino a 45 s per pagina (90 s totali); resta entro il maxDuration server di 60 s e dichiara parziali i risultati se restano messaggi o allegati necessari non esaminati. I corpi già completi non richiedono arricchimento PDF e non diventano parziali per un allegato illeggibile.

Precedenza: dati già estratti dal corpo/strutturati conservati. Un allegato con stesso riferimento, tipologia e provider compatibile integra soltanto campi vuoti o segnaposto; conflitti mostrati come avvisi con il valore alternativo, stato Da verificare. Nessuna scelta silenziosa. Riferimenti diversi e segmenti di trasporto con tratte/orari distinti restano distinti. Se un PDF non fornisce un riferimento riconoscibile dal parser esistente non viene associato per sola somiglianza. Fatture/brochure senza conferma sono escluse. PDF illeggibili, protetti o scansionati non bloccano i dati del corpo; producono esame parziale dichiarato.

PDF.js 6.5.438, richiesto Node >=22.13 o >=24. Worker e dipendenze sono inclusi esplicitamente nel tracing Next. Dati da PDF transitano solo in memoria e nei normali draft/token di anteprima, con redazione PIN già esistente. Il documento originale e il testo completo non sono salvati né registrati. OCR e gestione completa di modifiche/cancellazioni restano esclusi.


### Correzione regressione ricerca PDF
Il limite della richiesta PDF ora rimanda al cursore esistente i messaggi necessari rimanenti, preservando la successiva pagina Gmail. Un arricchimento con la stessa chiave sorgente sostituisce la scheda preliminare anziché affiancarla. Errori di recupero di un singolo messaggio conservano le altre candidate e segnalano l’esame parziale. Oggetto Italo Conferma Acquisto + PDF con evidenze di viaggio e riferimento valido sono sufficienti per analizzare il biglietto anche quando il PDF non ripete la parola conferma. Nessun allentamento dei campi minimi o delle protezioni del worker.
Queste cause sono riprodotte con fixture sintetiche; l’associazione alle singole email Production non viene attestata senza una traccia reale autorizzata.
