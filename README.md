# Mova Web v0.1

Prima base funzionante del Web MVP di Mova.

## Funzioni incluse

- Home responsive
- Elenco viaggi
- Dashboard del viaggio
- Creazione guidata in 3 passi con validazione e riepilogo
- Tema visivo diverso per Paese
- Navigazione desktop e mobile
- Dati demo salvati nel browser con localStorage

## Avvio

Richiede Node.js 20 o superiore.

```bash
npm install
npm run dev
```

Aprire poi:

```text
http://localhost:3000
```

## Accesso con Google

Creare un client OAuth 2.0 di tipo **Applicazione web** in Google Cloud e aggiungere questo URI di reindirizzamento autorizzato:

```text
http://localhost:3000/api/auth/google/callback
```

Copiare `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` nel file `.env`, usando `.env.example` come riferimento. In produzione usare il dominio HTTPS effettivo.

## Email transazionali

MOVA usa Resend per verifica email, recupero password e inviti. Configurare nel file `.env`:

```text
APP_URL="http://localhost:3000"
RESEND_API_KEY="re_..."
EMAIL_FROM="MOVA <noreply@dominio-verificato.it>"
```

Senza chiave API, in sviluppo vengono mostrati i link di anteprima e nessuna email viene inviata.

## Stato del progetto

Questa versione usa dati locali e non contiene ancora backend, autenticazione o database.
Il prossimo incremento previsto è:

1. partecipanti e inviti;
2. itinerario giorno per giorno;
3. backend e persistenza dati.
