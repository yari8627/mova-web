import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";

type CatalogApp = { name: string; country: string; url: string; approved?: boolean };
type CheckRequest = { country?: string; apps?: Array<{ name: string; url: string }> };
const allowedHosts = new Set(["alipay.com", "www.alipay.com", "wechat.com", "www.wechat.com", "metroman.cn", "www.metroman.cn", "amap.com", "www.amap.com", "indrive.com", "www.indrive.com", "uber.com", "www.uber.com", "careem.com", "www.careem.com", "japantravel.navitime.com", "jreast.co.jp", "www.jreast.co.jp", "grab.com", "www.grab.com", "bolt.eu", "www.bolt.eu", "maps.google.com", "translate.google.com", "xe.com", "www.xe.com", "m.didi.cn", "go.goinc.jp"]);

async function checkUrl(item: { name: string; url: string }) {
  try {
    const target = new URL(item.url);
    if (target.protocol !== "https:" || !allowedHosts.has(target.hostname)) return { name: item.name, available: false };
    const response = await fetch(target, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000), next: { revalidate: 604800 } });
    return { name: item.name, available: response.ok || response.status === 405 };
  } catch { return { name: item.name, available: false }; }
}

export async function POST(request: Request) {
  if (!await currentUser()) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const body = await request.json() as CheckRequest;
  const apps = (body.apps || []).filter((item) => item.name && item.url).slice(0, 30);
  const checks = await Promise.all(apps.map(checkUrl));
  const candidates: CatalogApp[] = [];
  const feedUrl = process.env.TRAVEL_APPS_CATALOG_URL;
  if (feedUrl) {
    try {
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
      const feed = await response.json() as CatalogApp[];
      const existing = new Set(apps.map((item) => item.name.toLocaleLowerCase()));
      candidates.push(...feed.filter((item) => item.country === body.country && !item.approved && !existing.has(item.name.toLocaleLowerCase())).slice(0, 20));
    } catch { /* Mantiene il catalogo locale. */ }
  }
  return NextResponse.json({ checkedAt: new Date().toISOString(), checks, pendingCandidates: candidates.length });
}
