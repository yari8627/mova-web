import { NextResponse } from "next/server";
import { City, Country } from "country-state-city";
import { currentUser } from "../../../lib/auth";
import { canonicalCountryName } from "../../../lib/country-names";

const regionNames = new Intl.DisplayNames(["it"], { type: "region" });
const countries = Country.getAllCountries().map((country) => ({
  isoCode: country.isoCode,
  name: country.name,
  displayName: canonicalCountryName(country.isoCode, regionNames.of(country.isoCode) ?? country.name),
  flag: country.flag,
}));

const localizedCityNames: Record<string, Record<string, string>> = {
  IT: {
    Florence: "Firenze",
    Rome: "Roma",
    Venice: "Venezia",
    Milan: "Milano",
    Naples: "Napoli",
    Turin: "Torino",
    Genoa: "Genova",
    Padua: "Padova",
  },
};

function searchable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
}

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") === "city" ? "city" : "country";
  const query = searchable((params.get("q") || "").trim());
  if (!query) return NextResponse.json([]);

  if (kind === "country") {
    return NextResponse.json(countries
      .filter((country) => searchable(country.displayName).includes(query) || searchable(country.name).includes(query))
      .sort((a, b) => Number(!searchable(a.displayName).startsWith(query)) - Number(!searchable(b.displayName).startsWith(query)) || a.displayName.localeCompare(b.displayName, "it"))
      .slice(0, 8), { headers: { "Cache-Control": "private, max-age=3600" } });
  }

  const countryCode = (params.get("countryCode") || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return NextResponse.json([]);
  return NextResponse.json((City.getCitiesOfCountry(countryCode) || [])
    .map((city) => ({ ...city, displayName: localizedCityNames[countryCode]?.[city.name] || city.name }))
    .filter((city) => searchable(city.name).includes(query) || searchable(city.displayName).includes(query))
    .sort((a, b) => Number(!searchable(a.displayName).startsWith(query)) - Number(!searchable(b.displayName).startsWith(query)) || a.displayName.localeCompare(b.displayName, "it"))
    .slice(0, 8)
    .map((city) => ({ name: city.displayName, stateCode: city.stateCode })), { headers: { "Cache-Control": "private, max-age=3600" } });
}
