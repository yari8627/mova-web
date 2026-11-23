# Booking: etichetta breve Conferma

Baseline 015a57f. Il pilota ha riportato target=true, parser, missing_reference. Il codice accettava Numero/Codice di conferma e Conferma n., ma non Conferma:.

Aggiunto riconoscimento dell’etichetta breve solo per provider Booking.com, con numero di 8–14 cifre, separatori espliciti, gruppi separati da spazi/punti, elementi HTML e righe separate. Esclusi PIN, date, telefoni, numeri senza etichetta e provider diversi. La normalizzazione aggiuntiva resta locale all’estrazione Booking. Estesa soltanto la redazione PIN condivisa per numeri divisi tra span o righe, senza esporli nei draft o nei token di anteprima.

Fixture interamente sintetica: email inoltrata, Conferma e codice in celle/span, PIN vicino spezzato tra span. Percorso MIME → parser → ricerca/anteprima → validazione del draft: Importabile; nessuna importazione reale. Test di regressione invariati per filtro Gmail, deduplicazione e associazione viaggio.

Rimossa diagnostica temporanea dalla UI e dal server, incluso selettore personale e modulo dedicato. Le vecchie richieste diagnoseTarget sono respinte prima dell’accesso Gmail. Nessuna modifica ai Secret: gli eventuali vecchi flag non sono più letti dal codice.

Nessuna email reale letta, nessun database modificato, nessun push/deploy. La verifica sintetica non sostituisce la conferma del risultato sull’email reale dopo rilascio autorizzato.

Validazione: 108/108 test Gmail parser/server/UI PASS, inclusi falsi positivi, PIN segmentato, anteprima sintetica e rimozione diagnostica. Typecheck, build Next.js e diff check PASS.
