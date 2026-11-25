# Diagnostica temporanea Gmail Import — P0

## Evidenze e limiti
Baseline analizzata: 67e4543. Nessuna ricerca Gmail reale eseguita.
La query usa termini di conferma/voucher e i mittenti Italo/easyJet in OR, non richiede un PDF. Esclude spam/cestino. Le date sono inclusive nel fuso del browser; il backend ricontrolla internalDate nell'intervallo [inizio, giorno successivo alla fine).
Le pagine dei corpi precedono la coda PDF. Le richieste sono sequenziali, massimo 20, 45 secondi per richiesta e 90 per ricerca; funzione Vercel 60 secondi. Google ha timeout 15 secondi, download allegato 2,5 secondi, worker 3,5 secondi e budget 2 PDF per richiesta. Nessun limite modificato.
Le candidate vengono unite e ordinate per ricezione; gli errori conservano i risultati precedenti. Il cambio filtro svuota i risultati. Il percorso esistente raggruppa fallimenti messaggi/PDF e timeout sotto lo stesso avviso: questo è dimostrato dal codice, ma NON dimostra perché le email reali siano assenti.
I test sintetici escludono una parzialità automatica per intervalli brevi e verificano corpi prima dei PDF, paginazione e deduplicazione. Non escludono differenze nei messaggi reali, timeout o errori Google reali.

## Una sola ricerca Production (dopo autorizzazione al deploy)
1. Accedere a NAMI con il proprio account; Prenotazioni → Importa da Gmail.
2. Impostare 18–19 novembre 2026. Aprire «Diagnostica temporanea (facoltativa)».
3. Premere «Autorizzo la diagnostica per la prossima ricerca», quindi «Cerca prenotazioni» UNA volta. Non aprire o salvare prenotazioni.
4. Attendere il termine. Aprire il riquadro diagnostico: condividere esclusivamente il JSON tecnico, non schermate contenenti schede/account.
5. Premere «Cancella diagnostica» e chiudere. Anche chiusura, cambio date o uscita dalla sezione eliminano i dati. L'attivazione si consuma all'avvio e non si applica alla ricerca successiva.

## Protezioni e interpretazione
Nessun nuovo endpoint, log, storage o servizio. Endpoint esistente autenticato, controllo origine e contesto utente esistenti invariati. `diagnostics: true` abilita solo la risposta della richiesta corrente; nessuna variabile/Secret necessario. Nessun account personale codificato.
Codice casuale ricerca e richiesta; versione commit; contatori aggregati, tempi e presenza cursori. La UI proietta una lista chiusa di numeri, UUID, SHA ed enum: non serializza candidate, errori, cursori o dati email. PDF e messaggi non vengono persistiti dalla diagnostica.
`request_timeout` / `total_timeout` / `page_limit` / `cursor_loop` / `client_abort` / `backend_error` identificano lo stop client, con HTTP e durata. Un HTTP 504 osservato prova un errore gateway, non da solo la causa interna Vercel. HTTP 0 non dimostra un guasto server.
Le risposte backend distinguono pagine Gmail residue e coda PDF, messaggi non riconosciuti, candidate per tipo prima della deduplica e ritornate dopo, duplicati, PDF elaborati/saltati/falliti e motivi controllati. I tempi sono millisecondi wall-clock; fetch paralleli non sono sommati.
Una ricerca incompleta non consente di attribuire il problema al parser di una specifica email. Il riepilogo non identifica singoli messaggi e non contiene oggetti, mittenti, nomi file, contenuti, riferimenti, hash o token. Dopo l'evidenza, proporre solo la correzione supportata e rimuovere la diagnostica temporanea.
