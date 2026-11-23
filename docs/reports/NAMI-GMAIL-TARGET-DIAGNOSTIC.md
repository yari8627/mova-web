# Diagnostica mirata Booking — locale

Baseline f7ba7a5. Nessuna lettura Gmail reale, importazione, migrazione o modifica Production durante questo intervento.

Riutilizza POST /api/gmail/search e il riquadro temporaneo. Solo il pilota autorizzato dai due flag server esistenti vede il pulsante. Ogni esecuzione richiede diagnoseTarget: true; non parte aprendo la schermata o con la ricerca normale. Nessun nuovo flag, endpoint o scope OAuth.

Il selettore fisso server usa nome struttura nell’oggetto e dominio Booking nel periodo 21–23 novembre 2026 incluso, Europe/Rome. La ricerca di identificazione restituisce solo ID (massimo due): zero produce target_not_found; più risultati o una pagina successiva producono target_ambiguous. Non viene scelto arbitrariamente un messaggio.

Per un risultato univoco, percorre la query Production invariata fino al bersaglio, al massimo dieci pagine/cento messaggi. Le pagine precedenti servono a riprodurre la deduplicazione nell’ordine della ricerca. Se il bersaglio non compare a paginazione conclusa: search_filter_excluded. Se il limite viene raggiunto: search_limit_reached, esito inconcludente. Un errore di recupero rende il risultato inconcludente.

Il messaggio e gli eventuali precedenti attraversano le stesse funzioni MIME/parser/qualità/identità/ledger; nessuna modifica a queste regole. missing_reference conserva gli eventuali motivi MIME; repeated_preview indica soppressione, duplicate_preview indica anteprima già presente, candidate_preview indica generazione consentita. Non esegue la validazione di salvataggio, che richiede conferma ed è fuori dallo scopo della diagnosi dell’anteprima.

La risposta diagnostica contiene solo targetDiagnostic: {target, stage, reason}. Nessun ID, hash, token firmato, contenuto, soggetto, indirizzo, codice o PIN. Non vengono generati candidati importabili per questa richiesta. La vecchia lista di hash non viene più esposta. Il risultato resta soltanto nello stato volatile del dialogo per permetterne la lettura; chiusura/cambio date/rimozione del pannello lo cancella. Nessun log, storage o persistenza server.

L’eventuale normale rinnovo dell’access token è limitato alla memoria della richiesta diagnostica, senza aggiornare la connessione nel database; il comportamento della ricerca normale resta invariato. Nessuna modifica alle impostazioni OAuth o Secret.

La causa della Booking reale resta da accertare dopo autorizzazione alla pubblicazione e una singola esecuzione mirata. Nessun deploy incluso in questo commit.

Validazione locale: 114 test pertinenti, typecheck e build Next.js PASS. Solo fixture sintetiche e API simulate. Nessuna email reale usata come fixture.
