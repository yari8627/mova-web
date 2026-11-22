# Gmail Bookings 2.0 — candidato locale P0/P1

## Ambito consegnato
- Parser Airbnb consolidato e parser Booking.com/easyJet/Italo per dati strutturati e blocchi HTML/testo etichettati, anche inoltrati. Nessuna inferenza di anno dal timestamp email. Fusi solo da offset espliciti, paese dell’alloggio o aeroporti/stazioni conosciuti; dati insufficienti restano da verificare.
- Proiezione Prenotazioni → Itinerario condivisa con le modifiche manuali: stessa transazione, ID stabili, aggiornamento e rimozione dei soli eventi obsoleti della prenotazione. Conservati i limiti orari Airbnb e gli offset della fonte anche nei successivi salvataggi manuali.
- Suggerimento viaggio con intervallo compatibile e città, nome, paese/alias geografici espliciti. Scelta precompilata soltanto per vincitore unico; alias limitati, nessun geocoding esterno.
- Schede salvate compatte; note originali conservate, dettagli espandibili, ospiti visibili. Modifica, allegati e cancellazione manuale invariati.
- Anteprima compatta esistente riutilizzata; selezione multipla e conferma esplicita conservate. Pulsante primario con SVG ufficiale Google locale.
- Ricerca iniziale: oggi e due giorni precedenti, estremi inclusi nel fuso locale (Europe/Rome verificato). Filtri restano sulle date di ricezione.
- Al salvataggio riuscito: invalidazione cache dei viaggi coinvolti, aggiornamento elenco e chiusura importazione. Singolo viaggio diverso: navigazione alla sua sezione Prenotazioni. Più viaggi: riepilogo nominativo nella sezione corrente. Errori: anteprima e modifiche mantenute.
- Itinerario: foto del sistema esistente per identità/foto già associate; altrimenti placeholder con icona di categoria, senza nuova ricerca fotografica per prenotazioni prive di identità affidabile.

## Non incluso (P2)
- Estrazione PDF testuali, limiti di allegati e confronto corpo/PDF.
- Confronto prima/dopo completo per modifiche/cancellazioni. Restano attivi il riconoscimento esistente, la conferma per aggiornamenti e il blocco delle cancellazioni: nessuna eliminazione automatica.
Questi elementi non sono dichiarati implementati. Il candidato è un rilascio parziale P0/P1, non la consegna completa di tutte le richieste 2.0.

## Rilascio
Nessuna nuova dipendenza, migrazione, variabile o Secret. Richiede le colonne e relazioni Activity/Booking già previste dallo schema esistente, incluso sortOrder. Nessun push/deploy in questa attività; autorizzazione separata necessaria. Production, OAuth, database e Web Push non modificati.

## Backlog futuro
**Dashboard intelligente del viaggio**: prossimi voli, check-in, prenotazioni, documenti e informazioni mancanti. Registrata soltanto, non implementata.

## Validazione locale
98 test pertinenti superati (66 parser/server Gmail, 7 UI Gmail, 25 regressioni date/auth/profilo); typecheck e build PASS. Browser con fixture sintetica a 320/375/390/1440 px: nessun overflow; conferma importazione e riepilogo verificati. Test automatici coprono deduplicazione, isolamento, aggiornamenti, rollback atomico e mantenimento della bozza in caso di errore. Nessun database TEST o Production utilizzato.
