# Booking: indirizzo, fuso e suggerimento coordinati

Baseline a62e567. Nessuna email reale letta e nessuna modifica Production. L’utente conferma riconoscimento del riferimento ma indirizzo/fuso/viaggio vuoti; non è stato fornito il messaggio esatto dell’errore finale.

Nel codice, l’indirizzo Booking dipendeva dall’etichetta Indirizzo/Address. Un indirizzo postale non etichettato nei blocchi HTML rimaneva vuoto: senza Paese non veniva applicato Oslo, mailInstant restava vuoto, suggestTrip non aveva luogo/date utili e le validazioni client/server impedivano la conferma. La catena è riprodotta con fixture sintetiche. Non viene affermato che sia escluso qualsiasi altro errore sul caso reale.

Aggiunto riconoscimento conservativo di indirizzi postali testuali in blocchi HTML, link e righe adiacenti: via/civico, CAP/località e Paese esplicito. Rifiuta indirizzi concorrenti, contenuti solo immagine e testi identificabili come footer/fatturazione. Nessuna lettura del contenuto di link o immagini. Il parser mantiene dopo/entro; le date numeriche italiane funzionano anche in etichette inline e celle separate. Il convertitore IANA esistente ricava l’offset dalla data, mantenendo i controlli su ore inesistenti/ambigue.

Il suggerimento usa Paese canonico (codice, inglese, italiano, nome locale tramite dipendenza countries-list già presente), località e intervallo di date. Conflitti di Paese escludono il candidato; parità fra viaggi compatibili non seleziona arbitrariamente. Nessun nome di viaggio o alloggio personale codificato. Nessuna validazione rimossa e nessuna importazione automatica.

Test sintetici coprono indirizzo senza etichetta, HTML inline/tabellare, Europe/Oslo e limiti del soggiorno, suggerimenti in Paesi diversi, date incompatibili/ambiguità e percorso anteprima → conferma esplicita → salvataggio simulato. Tutti i dati e le API sono sintetici; non viene modificato alcun database.

Validazione finale: 114/114 test pertinenti Gmail parser/server/UI PASS; typecheck, build Next.js e diff check PASS.
