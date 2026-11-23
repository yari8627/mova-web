# Gmail Bookings — hotfix P0 locale

Baseline: fd60ebc, branch feature/nami-gmail-bookings.

## Cause e correzioni
1. Lo storico import_record conserva booking_id senza foreign key per consentire il sync manuale che sostituisce le righe mantenendo gli ID. Preview e conferma trattavano anche mapping orfani come duplicati. La preview verifica l’esistenza effettiva; la conferma recupera esclusivamente mapping corrispondenti orfani del medesimo utente/account, sotto lock e nella transazione del salvataggio. Nessuna pulizia globale. I duplicati vengono controllati in tutti i viaggi gestibili, con indicazione del viaggio in anteprima; mapping vivi non accessibili non vengono cancellati né esposti.
2. Il filtro riferimenti accettava un solo token alla fine della riga. Un numero Booking raggruppato in span/spazi o seguito dal PIN nella medesima riga veniva escluso prima dell’anteprima. Fixture sintetica: baseline 0 candidati, hotfix 1. Supportati riferimento numerico Booking, nome nell’oggetto di conferma, blocchi Arrivo/Partenza HTML e orari qualificati. Newsletter/citazioni senza conferma effettiva escluse; contatori aggregati delle categorie di esclusione, senza dati personali. PIN rimosso dai dati estratti. Nessuna lettura della mail personale: la causa specifica della mail reale resta da riscontrare dopo il rilascio.
3. La stessa variabile notice era usata nella ricerca e fuori dal pannello; Annulla chiudeva il pannello senza svuotarla. Notifica di salvataggio separata, generata solo dopo risposta server positiva; Annulla/X/Escape e cambio sezione svuotano il solo stato transitorio. Il parametro di successo tra viaggi viene consumato e tolto dall’URL per non ricomparire al refresh. Errori mantengono la bozza.

## Validazione
- 92 test pertinenti PASS: 87 Gmail parser/server/UI e 5 regressioni date prenotazioni.
- Inclusi importazione/eliminazione/reimportazione, replay, concorrenza, viaggi diversi, isolamento utenti/account, mapping vivi e storico estraneo preservati, preview obsoleta, Booking originale/inoltrata e Airbnb inoltrata, newsletter e falso annullamento, finestra ricezione 21–23 novembre, PIN assente, chiusura/errore/navigazione/ricreazione componente.
- Typecheck PASS; build locale PASS; git diff --check PASS.
- Nessuna migrazione, dipendenza, configurazione OAuth o Secret necessaria.
- Nessun push/deploy o modifica a dati Production. Documento operativo preesistente non incluso nel commit.
