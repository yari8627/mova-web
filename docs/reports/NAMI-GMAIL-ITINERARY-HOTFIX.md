# Hotfix Gmail Bookings + Itinerario — candidato locale

Baseline: 0bdeb29, branch feature/nami-gmail-bookings. Nessun push/deploy o intervento Production.

## Stato dei sei interventi
1. PASS — Presentazione delle note già importate: ospiti, località e metadati di check-in/out/origine non si ripetono nei dettagli. Restano le istruzioni aggiuntive. Non viene eseguita alcuna riscrittura dei record esistenti; per nuovi candidati Airbnb non si genera la copia non etichettata degli ospiti.
2. PASS — Header della scheda con icona/titolo/badge in tre colonne; EMAIL a destra e seconda riga ordinata sotto 360 px. Conservati gli stili locali NAMI.
3. PASS — Causa del ritardo: Itinerario resta montato e caricava lo snapshot soltanto al cambio ID; ignorava l’evento mova-trip-snapshot. Ora riceve immediatamente lo snapshot aggiornato. Import confermato: un refetch per viaggio coinvolto; modifica/eliminazione: invalidazione e refetch dopo salvataggio. Nessun timer/polling. Un riordino con lista obsoleta ricostruisce i soli eventi delle prenotazioni correnti nella stessa transazione, evitando perdite/duplicati.
4. PASS — Proiezione server con HH:mm puro. Timeline riconosce anche i vecchi limiti testuali senza riscriverli automaticamente. Orari cronologici tra eventi di prenotazione e tappe manuali/Google; posizioni relative degli elementi senza ora conservate. Limiti e fuso nei dettagli. Editing dei soggiorni Gmail conserva Europe/Oslo e check-out; i metadati originari restano nelle note. Test 15:00 prima di 19:04 e drag senza cambi di orario o duplicati.
5. PASS — Quattro asset locali Airbnb/Booking.com/easyJet/Italo, con fonti/licenze in public/brands/README.md. Frame identico alle foto esistenti; object-fit contain, sfondo NAMI, Italo bianco su navy. Nessuna nuova richiesta esterna a runtime. Le normali foto delle attività rimangono sul ramo precedente.
6. BLOCKED per il caso reale — Non sono state lette email personali. La causa della specifica Booking del 22 novembre non è determinabile dal codice locale. Una fixture inoltrata attraversa Gmail list/fetch, filtro ricezione, MIME/HTML, parser, deduplicazione, anteprima, validazione e conferma con itinerario, senza PIN. Questo non attesta la correzione del caso reale.

## Diagnostica temporanea predisposta, NON distribuita/eseguita
Disattivata per default. Richiede entrambe NAMI_GMAIL_DIAGNOSTICS=1 e NAMI_GMAIL_DIAGNOSTIC_USER_ID uguale all’utente autenticato. Nessun ruolo/permesso OAuth nuovo. Nessun log, storage o contenuto email nella traccia. La risposta dell’endpoint autenticato contiene soltanto HMAC non reversibili con chiave casuale per richiesta e motivi tecnici da allowlist, massimo 100 voci. Identificativi non correlabili fra richieste.

Punti tracciati: pagina/paginazione ricerca, copertura del filtro (una sola query aggiuntiva ID-only, massimo 10 risultati della stessa finestra, senza ulteriori corpi/intestazioni), fetch eccessivo, ricezione esclusa, limiti/troncamento MIME, HTML nominato saltato, RFC822 non supportato, riferimento mancante, classificazione esclusa, duplicato o candidato in anteprima. Il motivo search_filter_or_pagination è intenzionalmente ambiguo: non prova da solo che il filtro abbia scartato una specifica email.

Prima di distribuire questo codice diagnostico, abilitarlo o farlo operare su Production occorre autorizzazione esplicita. Dopo il singolo riscontro, rimuovere/disattivare i due flag. Le tracce non includono PIN, subject, mittenti, testo, token o ID Gmail grezzi. La ricerca/importazione reale rimane esplicita; nessuna importazione automatica.

## Validazione locale
120 test pertinenti PASS (Gmail, pipeline sintetica completa Booking, note, orari Oslo/edit, cache/eventi, ordinamento, drag, completamento/permessi e deduplicazione/isolation); typecheck PASS; build PASS; diff check PASS. Verifica browser su fixture sintetica con componenti e CSS reali a 320/375/390 px: nessun overflow, badge a destra, quattro loghi caricati e frame uguali alle foto (48/58 px secondo breakpoint).

Nessuna nuova dipendenza o migrazione. Fix 1–5 pronti; rilascio completo dei sei problemi BLOCKED finché non viene autorizzato e raccolto il riscontro diagnostico sul caso Booking reale. Nessuna modifica a Web Push, Secret o OAuth esistenti. Documento operativo preesistente non incluso nel commit.
