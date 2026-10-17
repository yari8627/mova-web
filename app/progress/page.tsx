"use client";
import styles from "./progress.module.css";
import brandStyles from "../components/trip-header.module.css";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Country } from "country-state-city";
import { feature } from "topojson-client";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";
import localeIt from "i18n-iso-countries/langs/it.json";
import { countries as countryMetadata, type TContinentCode, type TCountryCode } from "countries-list";
import { ArrowLeft, Check, Earth, LocateFixed, MapPin, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useAutocompleteKeyboard } from "../../lib/use-autocomplete-keyboard";

type Visit = { id: string; countryCode: string; visitedAt: string; source: "manual" | "position" | "trip" };
type MapCountry = { code: string; name: string; path: string };
type WorldTopology = { type: "Topology"; objects: { countries: object } };
type WorldFeature = { id?: string | number; geometry: Parameters<ReturnType<typeof geoPath>>[0] };
countries.registerLocale(localeIt);
const WORLD_COUNTRIES = 195;
const CONTINENTS: Array<{ code: Exclude<TContinentCode, "AN">; name: string; total: number }> = [
  { code: "EU", name: "Europa", total: 44 },
  { code: "AS", name: "Asia", total: 48 },
  { code: "AF", name: "Africa", total: 54 },
  { code: "NA", name: "Nord America", total: 23 },
  { code: "SA", name: "Sud America", total: 12 },
  { code: "OC", name: "Oceania", total: 14 },
];
const regionNames = new Intl.DisplayNames(["it"], { type: "region" });
const countryOptions = Country.getAllCountries().map((country) => ({ ...country, displayName: regionNames.of(country.isoCode) || country.name })).sort((a, b) => a.displayName.localeCompare(b.displayName, "it"));

function normalizeMapFeature(item: WorldFeature, code: string): WorldFeature {
  if (code !== "FR") return item;
  const geometry = item.geometry as unknown as { type: string; coordinates?: number[][][][] };
  if (geometry.type !== "MultiPolygon" || !geometry.coordinates) return item;

  const europeanTerritories = geometry.coordinates.filter((polygon) =>
    polygon[0]?.some(([longitude, latitude]) => longitude >= -6 && longitude <= 10 && latitude >= 41 && latitude <= 52),
  );
  return { ...item, geometry: { ...geometry, coordinates: europeanTerritories } as never };
}

export default function ProgressPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[]>([]); const [mapCountries, setMapCountries] = useState<MapCountry[]>([]); const [query, setQuery] = useState(""); const [message, setMessage] = useState(""); const [locating, setLocating] = useState(false);
  const [showAllVisits, setShowAllVisits] = useState(false);
  const visitedCodes = useMemo(() => new Set(visits.map((visit) => visit.countryCode)), [visits]);
  const alphabeticVisits = useMemo(() => [...visits].sort((a, b) => {
    const first = countries.getName(a.countryCode, "it") || a.countryCode;
    const second = countries.getName(b.countryCode, "it") || b.countryCode;
    return first.localeCompare(second, "it", { sensitivity: "base" });
  }), [visits]);
  const matches = useMemo(() => { const value = query.trim().toLocaleLowerCase("it"); if (value.length < 2) return []; return countryOptions.filter((country) => country.displayName.toLocaleLowerCase("it").includes(value) || country.name.toLocaleLowerCase().includes(value)).slice(0, 7); }, [query]);
  const countryKeyboard = useAutocompleteKeyboard({ itemCount: matches.length, isOpen: matches.length > 0, resetKey: query, onOpen: () => undefined, onClose: () => setQuery(""), onSelect: (index) => { const country = matches[index]; if (country) void addCountry(country.isoCode); } });
  const percentage = Math.min(100, visits.length / WORLD_COUNTRIES * 100);
  const continentProgress = useMemo(() => CONTINENTS.map((continent) => {
    const visited = visits.filter((visit) => countryMetadata[visit.countryCode as TCountryCode]?.continent === continent.code).length;
    return { ...continent, visited, percentage: Math.min(100, visited / continent.total * 100) };
  }), [visits]);

  useEffect(() => { fetch("/api/progress").then((response) => response.ok ? response.json() : []).then(setVisits).catch(() => undefined); fetch("/world-countries.json").then((response) => response.json()).then((topology: WorldTopology) => { const collection = feature(topology as never, topology.objects.countries as never) as unknown as { features: WorldFeature[] }; const projection = geoNaturalEarth1().fitExtent([[12, 12], [948, 488]], collection as never); const path = geoPath(projection); setMapCountries(collection.features.map((item) => { const numeric = String(item.id || "").padStart(3, "0"); const code = countries.numericToAlpha2(numeric) || ""; const displayFeature = normalizeMapFeature(item, code); return { code, name: countries.getName(code, "it") || code, path: path(displayFeature as never) || "" }; }).filter((item) => item.code && item.path)); }).catch(() => setMessage("La mappa non è temporaneamente disponibile.")); }, []);

  async function addCountry(code: string, source: "manual" | "position" = "manual") { const response = await fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryCode: code, source }) }); if (!response.ok) return; const saved = await response.json() as Visit; setVisits((current) => [saved, ...current.filter((item) => item.countryCode !== code)]); setQuery(""); setMessage(`${countries.getName(code, "it")} aggiunto ai Paesi visitati.`); }
  async function removeCountry(code: string) { const response = await fetch(`/api/progress?countryCode=${encodeURIComponent(code)}`, { method: "DELETE" }); if (response.ok) setVisits((current) => current.filter((item) => item.countryCode !== code)); }
  function detectCountry() { if (!navigator.geolocation) return setMessage("La posizione non è supportata su questo dispositivo."); setLocating(true); setMessage(""); navigator.geolocation.getCurrentPosition(async (position) => { const response = await fetch("/api/progress/detect-country", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }) }); const result = await response.json(); setLocating(false); if (!response.ok) return setMessage(result.error || "Paese non riconosciuto."); await addCountry(result.countryCode, "position"); }, () => { setLocating(false); setMessage("Permesso posizione non concesso o posizione non disponibile."); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 3600000 }); }

  return <main className={`progress-page ${styles.progress}`}>
    <header className="progress-topbar"><button className={`icon-button ${styles.back}`} onClick={() => router.push("/")} aria-label="Torna alla Home"><ArrowLeft size={20} /></button><button className={brandStyles.wordmarkButton} onClick={() => router.push("/")} aria-label="NAMI Travel, torna alla Home"><span>NAMI</span><small>TRAVEL</small></button></header>
    <section className="progress-heading"><div><p className="section-kicker">IL TUO DIARIO DI VIAGGIO</p><h1>Il tuo mondo</h1><p>Ogni Paese visitato è una storia da raccontare.</p></div></section>
    {message && <div className="progress-message" role="status">{message}</div>}
    <section className={styles.discovery} aria-label="Il mondo che hai scoperto">
      <div className={styles.countryTotal}><MapPin size={20} aria-hidden="true" /><div><strong>{visits.length}</strong><span>Paesi visitati su {WORLD_COUNTRIES}</span></div></div>
      <div className={styles.discoveryDetails}><div><strong>{percentage.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</strong><span>del mondo visitato</span></div><div><span>Ultimo Paese aggiunto</span><strong>{visits[0] ? countries.getName(visits[0].countryCode, "it") : "—"}</strong></div></div>
      <div className={styles.worldProgress} role="progressbar" aria-label="Mondo visitato" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${percentage.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`}><span style={{ width: `${percentage}%` }} /></div>
    </section>
    <div className="world-progress-layout">
      <section className="world-map-card"><header><div><p className="section-kicker">MAPPA MONDIALE</p><h2>La tua mappa</h2></div><div className="map-legend"><span></span> Visitati</div></header>
        <div className="world-map-wrap"><svg viewBox="0 0 960 500" role="group" aria-label="Mappa dei Paesi visitati">{mapCountries.map((country) => <path key={country.code} d={country.path} className={visitedCodes.has(country.code) ? "visited" : ""} role="button" tabIndex={0} aria-label={`${country.name}${visitedCodes.has(country.code) ? " · Visitato" : " · Aggiungi ai visitati"}`} onClick={() => addCountry(country.code)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void addCountry(country.code); } }}><title>{`${country.name}${visitedCodes.has(country.code) ? " · Visitato" : " · Clicca per aggiungere"}`}</title></path>)}</svg></div>
        <p>Seleziona un Paese sulla mappa per segnarlo come visitato.</p>
        <button className={`secondary-button ${styles.detect}`} onClick={detectCountry} disabled={locating}><LocateFixed size={18} /> {locating ? "Rilevamento…" : "Rileva il Paese in cui mi trovo"}</button>
        <p className="location-privacy">Attivando il rilevamento, la posizione viene usata una sola volta e inviata a OpenStreetMap per riconoscere il Paese. NAMI salva soltanto il codice del Paese, non le coordinate.</p>
      </section>
      <aside className="visited-panel"><div><p className="section-kicker">IL TUO PASSAPORTO</p><h2>I Paesi visitati <span className={styles.visitedCount}>{visits.length}</span></h2></div>
        <label className="progress-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={countryKeyboard.onKeyDown} placeholder="Cerca o aggiungi un Paese" aria-label="Cerca o aggiungi un Paese" role="combobox" aria-expanded={matches.length > 0} aria-controls="progress-country-options" aria-activedescendant={countryKeyboard.activeIndex >= 0 ? `progress-country-option-${countryKeyboard.activeIndex}` : undefined} /></label>
        {matches.length > 0 && <div className="progress-suggestions" id="progress-country-options" role="listbox">{matches.map((country, index) => <button id={`progress-country-option-${index}`} role="option" aria-selected={countryKeyboard.activeIndex === index} className={countryKeyboard.activeIndex === index ? "keyboard-active" : undefined} key={country.isoCode} onMouseEnter={() => countryKeyboard.setActiveIndex(index)} onClick={() => addCountry(country.isoCode)}><span>{country.flag}</span><strong>{country.displayName}</strong>{visitedCodes.has(country.isoCode) ? <Check size={16} aria-label="Già visitato" /> : <Plus size={16} />}</button>)}</div>}
        <div className="visited-list" id="visited-country-list">{(showAllVisits || query.trim() ? alphabeticVisits : alphabeticVisits.slice(0, 6)).map((visit) => { const country = Country.getCountryByCode(visit.countryCode); return <article key={visit.id}><span>{country?.flag || "🌍"}</span><div><strong>{countries.getName(visit.countryCode, "it") || visit.countryCode}</strong><small>{visit.source === "position" ? "Rilevato dalla posizione" : visit.source === "trip" ? "Da un viaggio NAMI" : "Aggiunto manualmente"}</small></div><button onClick={() => removeCountry(visit.countryCode)} aria-label={`Rimuovi ${visit.countryCode}`}><Trash2 size={16} /></button></article>; })}{!visits.length && <div className="visited-empty"><Check size={20} /><p>La tua mappa è pronta per il primo Paese.</p></div>}</div>
        {visits.length > 6 && !query.trim() && <button className={`secondary-button ${styles.showAll}`} onClick={() => setShowAllVisits(!showAllVisits)} aria-expanded={showAllVisits} aria-controls="visited-country-list">{showAllVisits ? "Mostra meno" : "Mostra tutti"}</button>}
      </aside>
    </div>
    <section className="continent-progress"><header><div><p className="section-kicker">PROGRESSI PER CONTINENTE</p><h2>Quanto mondo hai esplorato</h2></div><strong>{visits.length} / {WORLD_COUNTRIES}</strong></header><div className="continent-progress-grid">{continentProgress.map((continent) => <article key={continent.code}><div><strong>{continent.name}</strong><span>{continent.visited} su {continent.total} Paesi</span></div><div className="continent-progress-track" aria-label={`${continent.name}: ${continent.visited} Paesi visitati su ${continent.total}`}><span style={{ width: `${continent.percentage}%` }} /></div><small>{continent.percentage.toLocaleString("it-IT", { maximumFractionDigits: 0 })}%</small></article>)}</div></section>
  </main>;
}
