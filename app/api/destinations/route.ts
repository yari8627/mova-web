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

export async function GET(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") === "city" ? "city" : "country";
  const query = (params.get("q") || "").trim().toLocaleLowerCase("it");
  if (!query) return NextResponse.json([]);

  if (kind === "country") {
    return NextResponse.json(countries
      .filter((country) => country.displayName.toLocaleLowerCase("it").includes(query) || country.name.toLocaleLowerCase("it").includes(query))
      .sort((a, b) => Number(!a.displayName.toLocaleLowerCase("it").startsWith(query)) - Number(!b.displayName.toLocaleLowerCase("it").startsWith(query)) || a.displayName.localeCompare(b.displayName, "it"))
      .slice(0, 8), { headers: { "Cache-Control": "private, max-age=3600" } });
  }

  const countryCode = (params.get("countryCode") || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return NextResponse.json([]);
  return NextResponse.json((City.getCitiesOfCountry(countryCode) || [])
    .filter((city) => city.name.toLocaleLowerCase("it").includes(query))
    .sort((a, b) => Number(!a.name.toLocaleLowerCase("it").startsWith(query)) - Number(!b.name.toLocaleLowerCase("it").startsWith(query)) || a.name.localeCompare(b.name, "it"))
    .slice(0, 8)
    .map((city) => ({ name: city.name, stateCode: city.stateCode })), { headers: { "Cache-Control": "private, max-age=3600" } });
}
