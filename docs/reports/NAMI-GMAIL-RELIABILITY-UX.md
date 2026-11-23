# Gmail Import — affidabilità e UX, candidato locale

Baseline: 3e644ee; branch feature/nami-gmail-bookings. Documento operativo preesistente preservato, nessun push/deploy o intervento Production.

## Booking.com reale: limite ancora aperto
Non sono state lette o conservate email personali durante i test locali. Non è disponibile in questo lavoro un riscontro della diagnostica sulla specifica conferma del 22 novembre: la causa reale non è attestata e non viene dichiarata risolta. Il filtro Gmail non è stato modificato sulla base di ipotesi.

È riutilizzata la diagnostica temporanea già implementata: stesso flag, stesso vincolo all’utente autorizzato, stesse tracce HMAC effimere senza corpi, subject, PIN, token o ID Gmail grezzi. La risposta già esistente viene ora mostrata in una sezione espandibile dopo la ricerca, solo quando il server la rende disponibile. Aggiunti soltanto i motivi tecnici insufficient_details e repeated_preview; nessuna seconda diagnostica o nuovo flag.

Controllo finale necessario dopo autorizzazione: account autorizzato, periodo 21/11/2026–23/11/2026, Europe/Rome; avviare Cerca prenotazioni, seguire Esamina altre email se presente e aprire Diagnostica temporanea. Riscontrare lo stadio di esclusione senza copiare contenuti email. Non confermare importazioni. search_filter_or_pagination non prova da solo che la specifica Booking sia stata esclusa dal filtro: occorre completare le pagine. Disattivare i flag temporanei dopo il riscontro autorizzato.

La fixture Booking inoltrata continua a attraversare l’intera pipeline fino a validazione e salvataggio sintetico; questo non sostituisce il riscontro reale.

## Correzioni
- Treni: identità basata su riferimento, provider, stazioni, numero servizio, partenza effettiva, passeggeri e posto/carrozza disponibili. Fingerprint senza timestamp dell’email né variazioni del testo grezzo dell’orario. Tratte, servizi o passeggeri distinti conservati. Aggiornamenti espliciti richiedono ancora scelta della prenotazione e revisione firmata; nessun aggiornamento automatico.
- Anteprima: ripetizioni identiche raggruppate nella pagina e fra pagine con memoria limitata nel cursore cifrato; ulteriore merge client per identità che preserva selezione e modifiche. Il salvataggio verifica i segmenti anche sui record esistenti, sotto le protezioni concorrenti precedenti. Nessuna migrazione delle tabelle esistenti.
- Qualità: Importabile / Da verificare / Non riconosciuta. Almeno due evidenze indipendenti oltre al riferimento per proporre la scheda; conferme incerte richiedono più evidenze. Nessuna scheda basata sul solo PNR/parola chiave. Messaggi insufficienti separati tramite contatori aggregati. Il server rifiuta titoli segnaposto e trasporti senza operatore/stazioni o aeroporti anche su conferma esplicita.
- Schermata iniziale: titolo, istruzione breve, periodo e ricerca. Collegamento solo se necessario; informazioni account e scollegamento in area secondaria chiusa. Conteggi, schede, esclusi e pulsante di conferma compaiono dopo la ricerca. Mai salvataggi automatici.
- Date: ultime tre date civili, intervallo incluso e modificabile; layout in colonna su mobile, contenimento di celle/input e controllo nativo WebKit. Date conservate durante ricerca e paginazione. Nessun riepilogo residuo dopo Annulla.

## Validazione
110 test pertinenti unici superati fra suite finale e ricontrolli dei soli casi corretti: parser/server/UI Gmail, Booking sintetica end-to-end, deduplicazione ferroviaria e paginazione, conservazione passeggeri/tratte, aggiornamento esplicito, anteprime insufficienti, date/isolemento/idempotenza, regressioni precedenti di itinerario e date. Typecheck PASS, build PASS, diff check PASS.
Browser con componenti reali e API sintetiche: 320/375/390 px, nessun overflow; input dentro contenitori; selezione dello stesso giorno su entrambi i campi conservata dopo ricerca; Annulla senza messaggi residui. Safari/iPhone fisico non verificato.

Nessuna dipendenza, migrazione o modifica Secret/OAuth/Web Push. Fix locali pronti; risultato completo Production BLOCKED sul caso Booking reale finché non viene raccolta la traccia autorizzata. Nessuna garanzia di identità quando i dati del segmento/passeggero non sono presenti: i casi credibili restano da verificare.
