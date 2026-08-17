"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CreditCard,
  Languages,
  Map,
  MessageCircle,
  Navigation,
  Smartphone,
  TrainFront,
} from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";

type Trip = { id: string; country: string };
type TravelApp = {
  name: string;
  category: string;
  description: string;
  url: string;
  icon: string;
  essential?: boolean;
};
type CatalogStatus = {
  checkedAt: string;
  checks: Array<{ name: string; available: boolean }>;
  pendingCandidates: number;
};

const international: TravelApp[] = [
  {
    name: "Google Maps",
    category: "Mappe",
    description:
      "Mappe, luoghi salvati e navigazione; scarica prima le aree offline.",
    url: "https://maps.google.com/",
    icon: "GM",
    essential: true,
  },
  {
    name: "Google Traduttore",
    category: "Lingua",
    description:
      "Traduzioni di testo, voce e fotocamera con lingue scaricabili offline.",
    url: "https://translate.google.com/about/",
    icon: "GT",
  },
  {
    name: "XE Currency",
    category: "Valuta",
    description: "Conversione rapida dei prezzi nella valuta locale.",
    url: "https://www.xe.com/apps/",
    icon: "XE",
  },
];

const defaultTaxi: TravelApp = {
  name: "Uber",
  category: "Taxi e ride-hailing",
  description:
    "Prenotazione di corse dall’app; verifica la copertura nella città del viaggio.",
  url: "https://www.uber.com/global/en/cities/",
  icon: "U",
  essential: true,
};
const normalizeAppCountry = (country: string) => {
  const value = country.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (["korea del sud", "corea del sud", "south korea", "repubblica di corea", "republic of korea"].includes(value)) return "Corea del Sud";
  return country;
};
const taxiApps: Record<string, TravelApp> = {
  Cina: {
    name: "DiDi",
    category: "Taxi e ride-hailing",
    description:
      "Servizio locale per richiedere taxi e auto; offre anche assistenza in inglese nell’app dedicata alla Cina.",
    url: "https://m.didi.cn/",
    icon: "D",
    essential: true,
  },
  Egitto: {
    name: "inDrive",
    category: "Taxi e ride-hailing",
    description:
      "Corse urbane con proposta e conferma della tariffa prima del viaggio.",
    url: "https://indrive.com/",
    icon: "iD",
    essential: true,
  },
  Giappone: {
    name: "GO",
    category: "Taxi e ride-hailing",
    description:
      "App locale per chiamare taxi nelle principali aree del Giappone.",
    url: "https://go.goinc.jp/en",
    icon: "GO",
    essential: true,
  },
  Thailandia: {
    name: "Grab",
    category: "Taxi e ride-hailing",
    description:
      "Prenotazione di auto e taxi con tariffa mostrata direttamente nell’app.",
    url: "https://www.grab.com/th/en/transport/",
    icon: "G",
    essential: true,
  },
  "Corea del Sud": {
    name: "k.ride",
    category: "Taxi e ride-hailing",
    description: "Servizio taxi di Kakao Mobility pensato per i viaggiatori internazionali in Corea del Sud.",
    url: "https://kride.kakaomobility.com/",
    icon: "KR",
    essential: true,
  },
};

const countryApps: Record<string, TravelApp[]> = {
  Cina: [
    {
      name: "Alipay",
      category: "Pagamenti",
      description:
        "Pagamenti con QR code e servizi locali; configurala prima della partenza.",
      url: "https://www.alipay.com/",
      icon: "A",
      essential: true,
    },
    {
      name: "WeChat",
      category: "Comunicazione e pagamenti",
      description: "Messaggi, mini-program e pagamenti presso molti esercenti.",
      url: "https://www.wechat.com/",
      icon: "W",
      essential: true,
    },
    {
      name: "MetroMan",
      category: "Trasporti",
      description: "Percorsi e mappe metro offline per oltre 50 città cinesi.",
      url: "https://www.metroman.cn/en/apps",
      icon: "M",
      essential: true,
    },
    {
      name: "Amap",
      category: "Mappe",
      description:
        "Navigazione e trasporto pubblico con copertura locale dettagliata.",
      url: "https://www.amap.com/",
      icon: "AM",
    },
  ],
  Egitto: [
    {
      name: "inDrive",
      category: "Trasporti",
      description: "Corse urbane con proposta e conferma della tariffa.",
      url: "https://indrive.com/",
      icon: "iD",
      essential: true,
    },
    {
      name: "Uber",
      category: "Trasporti",
      description:
        "Corse con prezzo mostrato nell’app e pagamento configurabile.",
      url: "https://www.uber.com/eg/en/ride/",
      icon: "U",
      essential: true,
    },
    {
      name: "Careem",
      category: "Trasporti",
      description: "Corse e servizi locali disponibili nelle principali città.",
      url: "https://www.careem.com/",
      icon: "C",
    },
  ],
  Giappone: [
    {
      name: "Japan Travel by NAVITIME",
      category: "Trasporti",
      description:
        "Ricerca di treni, metro e percorsi pensata per chi visita il Giappone.",
      url: "https://japantravel.navitime.com/en/",
      icon: "JT",
      essential: true,
    },
    {
      name: "Suica",
      category: "Pagamenti e trasporti",
      description:
        "Carta IC per trasporti e piccoli pagamenti, disponibile anche in versione mobile.",
      url: "https://www.jreast.co.jp/multi/en/welcomesuica/welcomesuica_mobile.html",
      icon: "S",
      essential: true,
    },
  ],
  Thailandia: [
    {
      name: "Grab",
      category: "Trasporti e cibo",
      description:
        "Corse, consegne di cibo e servizi quotidiani in numerose città thailandesi.",
      url: "https://www.grab.com/th/en/",
      icon: "G",
      essential: true,
    },
    {
      name: "Bolt",
      category: "Trasporti",
      description:
        "Alternativa per prenotare auto e confrontare la disponibilità locale.",
      url: "https://bolt.eu/en/cities/bangkok/",
      icon: "B",
      essential: true,
    },
  ],
  "Corea del Sud": [
    { name: "NAVER Map", category: "Mappe", description: "Mappe locali, ricerca di luoghi, trasporto pubblico e navigazione con supporto multilingue.", url: "https://www.navercorp.com/en/service/map", icon: "NM", essential: true },
    { name: "Papago", category: "Lingua", description: "Traduzione di testo, voce e immagini particolarmente utile per la lingua coreana.", url: "https://papago.naver.com/", icon: "P", essential: true },
    { name: "KorailTalk", category: "Trasporti", description: "App ufficiale KORAIL per consultare e prenotare i treni, inclusi i collegamenti KTX.", url: "https://www.korail.go.kr/", icon: "KT", essential: true },
    { name: "KakaoTalk", category: "Comunicazione", description: "Messaggistica molto diffusa in Corea e utile per comunicare con strutture e contatti locali.", url: "https://www.kakaocorp.com/page/service/service/KakaoTalk", icon: "K" },
  ],
};

const categoryIcon = (category: string) =>
  category.includes("Pagamento") || category === "Valuta"
    ? CreditCard
    : category.includes("Trasport")
      ? TrainFront
      : category === "Mappe"
        ? Map
        : category === "Lingua"
          ? Languages
          : category.includes("Comunicazione")
            ? MessageCircle
            : Navigation;

export default function UsefulAppsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus | null>(
    null,
  );
  useEffect(() => {
    fetch(`/api/trips/${id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setTrip)
      .catch(() => undefined);
  }, [id]);
  const appCountry = useMemo(() => trip ? normalizeAppCountry(trip.country) : "", [trip]);
  const apps = useMemo(() => {
    if (!trip) return [];
    const taxi = taxiApps[appCountry] || defaultTaxi;
    return [
      taxi,
      ...(countryApps[appCountry] || []).filter(
        (app) => app.name !== taxi.name,
      ),
      ...international,
    ];
  }, [appCountry, trip]);
  const groups = useMemo(
    () => [...new Set(apps.map((app) => app.category))],
    [apps],
  );
  useEffect(() => {
    if (!trip || !apps.length || !appCountry) return;
    const cacheKey = `mova-app-catalog-${appCountry}`;
    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) setCatalogStatus(JSON.parse(cached) as CatalogStatus);
    } catch { /* La cache è opzionale. */ }
    let cancelled = false;
    const refresh = () => fetch("/api/travel-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: appCountry, apps: apps.map(({ name, url }) => ({ name, url })) }),
    }).then((response) => response.ok ? response.json() : null).then((result: CatalogStatus | null) => {
      if (!result || cancelled) return;
      setCatalogStatus(result);
      try { window.localStorage.setItem(cacheKey, JSON.stringify(result)); } catch { /* La cache è opzionale. */ }
    }).catch(() => undefined);
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const usedIdleCallback = typeof idleWindow.requestIdleCallback === "function";
    const handle = usedIdleCallback ? idleWindow.requestIdleCallback!(refresh, { timeout: 1800 }) : window.setTimeout(refresh, 350);
    return () => { cancelled = true; if (usedIdleCallback) idleWindow.cancelIdleCallback?.(handle); else window.clearTimeout(handle); };
  }, [appCountry, apps, trip]);

  return (
    <main className="trip-detail-shell">
      <header className="detail-topbar">
        <button
          className="detail-brand home-brand-button"
          onClick={() => router.push("/")}
        >
          mova
        </button>
      </header>
      <TripCover tripId={id} />
      <TripTabs tripId={id} />
      <section className="useful-apps-heading">
        <div className="useful-apps-icon">
          <Smartphone size={25} />
        </div>
        <div>
          <p className="section-kicker">PRIMA DI PARTIRE</p>
          <h1>App Utili {trip ? `in ${trip.country}` : "per il viaggio"}</h1>
          <p>
            Installa e configura le app essenziali prima della partenza, quando
            hai ancora una connessione stabile.
          </p>
          {catalogStatus && (
            <div className="catalog-health">
              <span>
                Catalogo controllato{" "}
                {new Intl.DateTimeFormat("it-IT", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(catalogStatus.checkedAt))}
              </span>
              {catalogStatus.pendingCandidates > 0 && (
                <span>
                  {catalogStatus.pendingCandidates} nuove{" "}
                  {catalogStatus.pendingCandidates === 1
                    ? "app candidata"
                    : "app candidate"}{" "}
                  in revisione
                </span>
              )}
            </div>
          )}
        </div>
      </section>
      <div className="useful-app-groups">
        {groups.map((category) => {
          const Icon = categoryIcon(category);
          return (
            <section key={category} className="useful-app-group">
              <header>
                <Icon size={20} />
                <h2>{category}</h2>
              </header>
              <div className="useful-app-grid">
                {apps
                  .filter((app) => app.category === category)
                  .map((app) => {
                    const check = catalogStatus?.checks.find(
                      (item) => item.name === app.name,
                    );
                    return (
                      <article className="useful-app-card" key={app.name}>
                        <div className="useful-app-logo">{app.icon}</div>
                        <div>
                          <div className="useful-app-name">
                            <h3>{app.name}</h3>
                            {app.essential && <span>Essenziale</span>}
                          </div>
                          <p>{app.description}</p>
                          {check && (
                            <small
                              className={
                                check.available ? "app-verified" : "app-review"
                              }
                            >
                              {check.available
                                ? "✓ Link ufficiale verificato"
                                : "Da ricontrollare prima della partenza"}
                            </small>
                          )}
                        </div>
                        <a href={app.url} target="_blank" rel="noreferrer">
                          Apri <ArrowUpRight size={16} />
                        </a>
                      </article>
                    );
                  })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="useful-app-note">
        Disponibilità e funzionalità possono cambiare. Verifica sempre
        requisiti, copertura e condizioni sul sito ufficiale prima della
        partenza.
      </p>
    </main>
  );
}
