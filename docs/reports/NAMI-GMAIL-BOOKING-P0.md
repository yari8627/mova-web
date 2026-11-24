# Booking P0: conferma e indirizzo

Baseline 71998f2. Blocco dimostrato: una riga selezionata senza tripId incontra la validazione frontend prima di POST import. Il contatore (1) indica solo selezione, non completezza. L’indirizzo non è obbligatorio per salvare; data e offset e viaggio restano necessari. La validazione del fuso interviene dopo il viaggio. Nessuna validazione eliminata.

Errore ora vicino alla conferma, con role alert, focus e scorrimento; il messaggio indica esplicitamente il campo Viaggio. Errori API e risultati non importati conservano selezione e draft. Il successo chiude il dialogo solo dopo risposta server e sincronizzazione snapshot, come prima; idempotenza e proiezione itinerario restano invariate.

Estesa estrazione postale Booking per indirizzo spezzato fino a cinque blocchi consecutivi, con CAP e Paese espliciti. Fixture sintetica riproduce via/civico/CAP/località/Paese divisi. Nessun indirizzo reale codificato. Oslo e suggerimento per Paese/date riutilizzano la logica esistente. Non è dimostrato che il formato della mail reale corrisponda alla fixture: nessuna lettura personale eseguita.

118 test pertinenti PASS: pipeline server con ricerca/anteprima/conferma/salvataggio simulati, UI selezione/payload/successo/chiusura, viaggio e fuso mancanti, geografia facoltativa, errore API applicativo, duplicati e sincronizzazione esistenti. Typecheck PASS. Nessuna importazione reale, push, deploy o modifica Production.
