"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  BedDouble,
  CarFront,
  Check,
  Eye,
  FileCheck2,
  FileText,
  FolderSearch,
  Lightbulb,
  Lock,
  Plane,
  Plus,
  Ticket,
  Trash2,
  UploadCloud,
  WifiOff,
  X,
} from "lucide-react";
import { TripCover } from "../../../components/trip-cover";
import { TripTabs } from "../../../components/trip-tabs";
import { syncTripResource, syncTripSnapshot } from "../../../../lib/trip-sync";
import { useTripPermissions } from "../../../../lib/use-trip-permissions";

type TravelDocument = {
  id: string;
  name: string;
  category: "shared" | "personal";
  fileName: string;
  size: number;
  offline: boolean;
  createdById?: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  requirementKey?: string | null;
  bookingId?: string | null;
};
type EntryRequirement = { title: string; detail: string; required: boolean };
type Requirements = {
  visa: string;
  updated: string;
  source: string;
  items: EntryRequirement[];
  visaRequired?: boolean;
  passportCountry?: string;
  live?: boolean;
};
type PendingUpload = {
  file: File;
  category: TravelDocument["category"];
  requirement?: EntryRequirement;
};
const starterDocuments: TravelDocument[] = [
  {
    id: "passport",
    name: "Passaporto",
    category: "personal",
    fileName: "passaporto.pdf",
    size: 1200000,
    offline: true,
  },
  {
    id: "insurance",
    name: "Assicurazione di viaggio",
    category: "shared",
    fileName: "assicurazione.pdf",
    size: 1600000,
    offline: true,
  },
];
const localRequirements: Record<string, Requirements> = {
  Giappone: {
    visa: "Visto non richiesto fino a 90 giorni",
    updated: "1 aprile 2026",
    source: "https://www.viaggiaresicuri.it/find-country/country/JPN",
    items: [
      {
        title: "Passaporto in corso di validità",
        detail: "Necessario per l’ingresso nel Paese.",
        required: true,
      },
      {
        title: "Biglietto aereo di ritorno",
        detail: "Da possedere al momento dell’ingresso.",
        required: true,
      },
      {
        title: "Visto turistico",
        detail: "Non richiesto per soggiorni fino a 90 giorni ogni 180.",
        required: false,
      },
    ],
  },
  Thailandia: {
    visa: "Visto non richiesto fino a 60 giorni",
    updated: "12 maggio 2026",
    source: "https://www.viaggiaresicuri.it/find-country/country/THA",
    items: [
      {
        title: "Passaporto",
        detail:
          "Deve essere integro e in buono stato; verificare la validità residua sulla fonte ufficiale.",
        required: true,
      },
      {
        title: "Thailand Digital Arrival Card (TDAC)",
        detail:
          "Formalità digitale di ingresso da completare secondo le indicazioni ufficiali.",
        required: true,
      },
      {
        title: "Visto turistico",
        detail: "Non richiesto per soggiorni non superiori a 60 giorni.",
        required: false,
      },
      {
        title: "Assicurazione sanitaria",
        detail: "Fortemente raccomandata per l’intero soggiorno.",
        required: false,
      },
    ],
  },
  Egitto: {
    visa: "Visto obbligatorio",
    updated: "20 luglio 2026",
    source: "https://www.viaggiaresicuri.it/find-country/country/EGY",
    items: [
      {
        title: "Passaporto",
        detail: "Validità residua di almeno 6 mesi alla data di arrivo.",
        required: true,
      },
      {
        title: "Visto turistico",
        detail:
          "Obbligatorio; per turismo può essere richiesto all’arrivo per un massimo di 28 giorni.",
        required: true,
      },
      {
        title: "Alternativa: Carta d’identità elettronica",
        detail:
          "Solo turismo, valida per l’espatrio, oltre 6 mesi residui e accompagnata da 2 foto tessera.",
        required: false,
      },
      {
        title: "Due foto formato tessera",
        detail: "Necessarie se si entra con carta d’identità.",
        required: false,
      },
    ],
  },
  Italia: {
    visa: "Nessun requisito aggiuntivo",
    updated: "27 luglio 2026",
    source: "https://www.viaggiaresicuri.it/",
    items: [
      {
        title: "Documento di identità valido",
        detail: "Consigliato durante il viaggio.",
        required: true,
      },
      {
        title: "Tessera sanitaria",
        detail: "Consigliata per l’assistenza sanitaria.",
        required: false,
      },
    ],
  },
};
const formatSize = (bytes: number) =>
  bytes < 1000000
    ? `${Math.round(bytes / 1000)} KB`
    : `${(bytes / 1000000).toFixed(1)} MB`;

async function optimizePhoto(file: File) {
  if (!file.type.startsWith("image/") || file.size < 1_500_000) return file;
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Immagine non leggibile"));
      element.src = source;
    });
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(source);
  }
}
const requirementKey = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default function DocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const targetBookingId = useSearchParams().get("booking");
  const { canManage, role } = useTripPermissions(id);
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [category, setCategory] =
    useState<TravelDocument["category"]>("shared");
  const [country, setCountry] = useState("");
  const [liveRequirements, setLiveRequirements] = useState<Requirements | null>(
    null,
  );
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null,
  );
  const [documentTitle, setDocumentTitle] = useState("");
    const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  useEffect(() => {
    if (
      !targetBookingId ||
      !documents.some((document) => document.bookingId === targetBookingId)
    )
      return;
    const timer = window.setTimeout(
      () =>
        document
          .querySelector(`[data-booking-id="${CSS.escape(targetBookingId)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [documents, targetBookingId]);
  useEffect(() => {
    async function load() {
      const saved = window.localStorage.getItem(`mova-documents-${id}`);
      const cached = saved
        ? (JSON.parse(saved) as TravelDocument[])
        : starterDocuments;
      const trips = JSON.parse(
        window.localStorage.getItem("mova-trips") ?? "[]",
      ) as Array<{ id: string; country: string }>;
      const cachedCountry =
        trips.find((trip) => trip.id === id)?.country ??
        (id === "japan-2027"
          ? "Giappone"
          : id === "egypt-2027"
            ? "Egitto"
            : "");
      try {
        const response = await fetch(`/api/trips/${id}`);
        if (response.ok) {
          const remote = await response.json();
          setDocuments(remote.documents);
          setCountry(remote.country);
          window.localStorage.setItem(
            `mova-documents-${id}`,
            JSON.stringify(remote.documents),
          );
          const requirementResponse = await fetch(
            `/api/trips/${id}/requirements`,
          );
          if (requirementResponse.ok) {
            const result = await requirementResponse.json();
            if (result.configured && result.items?.length)
              setLiveRequirements({
                visa: result.visa,
                visaRequired: result.visaRequired,
                passportCountry: result.passportCountry,
                updated: result.updated,
                source: result.source,
                items: result.items,
                live: true,
              });
          }
          return;
        }
      } catch {
        /* Cache offline. */
      }
      setDocuments(cached);
      setCountry(cachedCountry);
    }
    void load();
  }, [id]);
  async function persist(next: TravelDocument[]) {
    const removed = documents.filter(
      (item) => !next.some((candidate) => candidate.id === item.id),
    );
    const changed = next.filter((item) => {
      const previous = documents.find((candidate) => candidate.id === item.id);
      return previous && previous.offline !== item.offline;
    });
    const responses = await Promise.all([
      ...removed.map((item) =>
        fetch(`/api/trips/${id}/documents/${item.id}`, { method: "DELETE" }),
      ),
      ...changed.map((item) =>
        fetch(`/api/trips/${id}/documents/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offline: item.offline }),
        }),
      ),
    ]);
    if (responses.some((response) => !response.ok)) return;
    setDocuments(next);
    window.localStorage.setItem(`mova-documents-${id}`, JSON.stringify(next));
    if (canManage && [...removed, ...changed].some((item) => !item.storageKey))
      syncTripResource(id, "documents", next);
  }
  function chooseFile(
    event: ChangeEvent<HTMLInputElement>,
    requirement?: EntryRequirement,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !role) return;
    const uploadCategory = requirement
      ? "personal"
      : role === "participant"
        ? "personal"
        : category;
    setPendingUpload({ file, category: uploadCategory, requirement });
    setDocumentTitle(requirement?.title || file.name.replace(/\.[^.]+$/, ""));
    setUploadError("");
  }
  async function addFile() {
    if (!pendingUpload || !documentTitle.trim()) return;
    setIsUploading(true);
    setUploadError("");
    try {
      const uploadFile = await optimizePhoto(pendingUpload.file);
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("name", documentTitle.trim());
      form.set("category", pendingUpload.category);
      if (pendingUpload.requirement) form.set("requirementKey", requirementKey(pendingUpload.requirement.title));
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 45000);
      const response = await fetch(`/api/trips/${id}/documents`, { method: "POST", body: form, signal: controller.signal });
      window.clearTimeout(timeout);
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || "Caricamento non riuscito. Riprova.");
      }
      const result = (await response.json()) as TravelDocument;
      const next = [
        ...documents.filter(
          (item) =>
            !pendingUpload.requirement ||
            item.requirementKey !== result.requirementKey,
        ),
        result,
      ];
      setDocuments(next);
      window.localStorage.setItem(`mova-documents-${id}`, JSON.stringify(next));
      setPendingUpload(null);
      setDocumentTitle("");
    } catch (error) {
      setUploadError(error instanceof DOMException && error.name === "AbortError" ? "Il caricamento sta impiegando troppo tempo. Controlla la connessione e riprova." : error instanceof Error ? error.message : "Caricamento non riuscito. Riprova.");
    } finally {
      setIsUploading(false);
    }
  }
  const shared = documents.filter((item) => item.category === "shared");
  const personal = documents.filter((item) => item.category === "personal");
  const requirements = liveRequirements ?? localRequirements[country];
  const isRequirementComplete = (item: EntryRequirement) =>
    documents.some(
      (document) =>
        document.requirementKey === requirementKey(item.title) ||
        document.name.toLowerCase() === item.title.toLowerCase(),
    );
  const requiredItems =
    requirements?.items.filter((item) => item.required) || [];
  const completedRequired = requiredItems.filter(isRequirementComplete).length;
  return (
    <main className="trip-detail-shell documents-shell">
      <header className="detail-topbar">
        <button
          className="detail-brand home-brand-button"
          onClick={() => router.push("/")}
          aria-label="Torna alla Home"
        >
          mova
        </button>
        {role && (
          <label
            className="primary-button file-button"
            onClick={() => {
              if (!canManage) setCategory("personal");
            }}
          >
            <Plus size={18} /> {canManage ? "Aggiungi" : "Documento personale"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={chooseFile}
            />
          </label>
        )}
      </header>
      <TripCover tripId={id} />
      <div className="expenses-title">
        <p className="section-kicker">ARCHIVIO</p>
        <h1>Documenti</h1>
        <p>Tutto ciò che serve prima e durante il viaggio.</p>
      </div>
      <TripTabs tripId={id} />
      <section className="document-utility-tip">
        <div className="document-tip-icon">
          <FolderSearch size={27} />
        </div>
        <div>
          <p className="section-kicker">IL TUO ARCHIVIO DI VIAGGIO</p>
          <h2>Non perdere più una conferma</h2>
          <p>
            Salva qui PDF, voucher e biglietti che altrimenti resterebbero
            dispersi tra email e download. Per esempio: parcheggio aeroportuale,
            volo, hotel, transfer, assicurazione o ingresso a un’attività.
          </p>
          <div className="document-example-chips">
            <span>
              <CarFront size={15} /> Parcheggi
            </span>
            <span>
              <Plane size={15} /> Voli
            </span>
            <span>
              <BedDouble size={15} /> Hotel
            </span>
            <span>
              <Ticket size={15} /> Biglietti
            </span>
          </div>
        </div>
        <label
          className="primary-button file-button"
          onClick={() => setCategory("shared")}
        >
          <UploadCloud size={18} /> Carica nel gruppo
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={chooseFile} />
        </label>
      </section>
      <div className="document-privacy-hint">
        <Lightbulb size={19} />
        <p>
          <strong>Quale sezione scegliere?</strong> Usa{" "}
          <b>Documenti del gruppo</b> per prenotazioni utili a tutti. Usa{" "}
          <b>Solo per te</b> per passaporto, carta d’identità e documenti che
          non vuoi condividere.
        </p>
      </div>
      {requirements ? (
        <section className="entry-requirements">
          <div className="requirements-heading">
            <div>
              <p className="section-kicker">
                INGRESSO IN {country.toLocaleUpperCase("it")}
              </p>
              <h2>
                Requisiti per passaporto{" "}
                {requirements.passportCountry || "italiano"}
              </h2>
              {requirements.live && (
                <span className="requirements-live">
                  Dati aggiornati automaticamente
                </span>
              )}
            </div>
            <span
              className={
                requirements.visaRequired === false ||
                requirements.visa.startsWith("Visto non") ||
                requirements.visa.startsWith("Nessun")
                  ? "visa-free"
                  : "visa-required"
              }
            >
              {requirements.visa}
            </span>
          </div>
          <div className="requirements-list">
            {requirements.items.map((item) => (
              <article
                key={item.title}
                className={
                  isRequirementComplete(item) ? "requirement-complete" : ""
                }
              >
                <span className={item.required ? "required" : "optional"}>
                  {item.required ? "Richiesto" : "Condizionale"}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <label className="requirement-upload">
                  {isRequirementComplete(item) ? (
                    <>
                      <Check size={14} /> Caricato
                    </>
                  ) : (
                    <>
                      <UploadCloud size={14} /> Carica
                    </>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(event) => chooseFile(event, item)}
                  />
                </label>
              </article>
            ))}
          </div>
          <footer>
            <span>
              Aggiornato:{" "}
              {new Date(requirements.updated).toString() === "Invalid Date"
                ? requirements.updated
                : new Intl.DateTimeFormat("it-IT", {
                    dateStyle: "medium",
                  }).format(new Date(requirements.updated))}
            </span>
            <a href={requirements.source} target="_blank" rel="noreferrer">
              Verifica la fonte ufficiale ↗
            </a>
          </footer>
        </section>
      ) : (
        country && (
          <section className="entry-requirements requirements-fallback">
            <h2>Requisiti per {country}</h2>
            <p>
              La scheda dettagliata non è ancora disponibile in MOVA. Verifica
              sempre i requisiti aggiornati sulla fonte ufficiale.
            </p>
            <a
              href="https://www.viaggiaresicuri.it/"
              target="_blank"
              rel="noreferrer"
              className="primary-button"
            >
              Apri Viaggiare Sicuri
            </a>
          </section>
        )
      )}
      <div className="documents-layout">
        <section className="documents-panel">
          <div className="document-category-heading">
            <div>
              <p className="section-kicker">CONDIVISI</p>
              <h2>Documenti del gruppo</h2>
              <small>
                Voucher e conferme che possono servire a tutti i partecipanti.
              </small>
            </div>
            <label
              className="secondary-button file-button"
              onClick={() => setCategory("shared")}
            >
              <UploadCloud size={18} /> Carica
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={chooseFile}
              />
            </label>
          </div>
          <div className="document-list">
            {shared.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                onToggle={() =>
                  persist(
                    documents.map((item) =>
                      item.id === document.id
                        ? { ...item, offline: !item.offline }
                        : item,
                    ),
                  )
                }
                onDelete={() =>
                  persist(documents.filter((item) => item.id !== document.id))
                }
              />
            ))}
          </div>
          <div className="document-category-heading second">
            <div>
              <p className="section-kicker">PERSONALI</p>
              <h2>Solo per te</h2>
              <small>
                Documenti riservati, visibili esclusivamente dal tuo account.
              </small>
            </div>
            <label
              className="secondary-button file-button"
              onClick={() => setCategory("personal")}
            >
              <UploadCloud size={18} /> Carica
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={chooseFile}
              />
            </label>
          </div>
          <div className="document-list">
            {personal.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                onToggle={() =>
                  persist(
                    documents.map((item) =>
                      item.id === document.id
                        ? { ...item, offline: !item.offline }
                        : item,
                    ),
                  )
                }
                onDelete={() =>
                  persist(documents.filter((item) => item.id !== document.id))
                }
              />
            ))}
          </div>
        </section>
        <aside className="document-checklist">
          <div className="invite-icon">
            <FileCheck2 size={27} />
          </div>
          <h2>Checklist ingresso</h2>
          <p>
            {country || "Destinazione"} · {completedRequired}/
            {requiredItems.length} obbligatori
          </p>
          <div className="checklist-progress">
            <span
              style={{
                width: `${requiredItems.length ? (completedRequired / requiredItems.length) * 100 : 0}%`,
              }}
            />
          </div>
          {(requirements?.items ?? []).map((item) => {
            const complete = isRequirementComplete(item);
            return (
              <div className="checklist-item" key={item.title}>
                <span className={complete ? "checked" : ""}>
                  {complete && <Check size={14} />}
                </span>
                {item.title}
              </div>
            );
          })}
        </aside>
      </div>
      {pendingUpload && (
        <div className="modal-backdrop" onMouseDown={() => setPendingUpload(null)}>
          <div
            className="modal document-upload-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-upload-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="section-kicker">NUOVO DOCUMENTO</p>
                <h2 id="document-upload-title">Dettagli del Documento</h2>
              </div>
              <button className="icon-button" onClick={() => setPendingUpload(null)} aria-label="Chiudi">
                <X size={20} />
              </button>
            </div>
            <form className="trip-form" onSubmit={(event) => { event.preventDefault(); void addFile(); }}>
              <label>
                Titolo del Documento
                <input
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                  placeholder="Es. Conferma Hotel Tokyo"
                  required
                />
              </label>
              <div className="document-selected-file">
                <FileText size={20} />
                <div><strong>{pendingUpload.file.name}</strong><span>{formatSize(pendingUpload.file.size)}</span></div>
              </div>
              {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setPendingUpload(null)}>Annulla</button>
                <button type="submit" className="primary-button" disabled={isUploading || !documentTitle.trim()}>
                  <UploadCloud size={18} /> {isUploading ? "Caricamento..." : "Carica Documento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
function DocumentKindIcon({ name }: { name: string }) {
  const value = name.toLowerCase();
  if (value.includes("parchegg") || value.includes("parking"))
    return <CarFront size={20} />;
  if (
    value.includes("volo") ||
    value.includes("flight") ||
    value.includes("aereo")
  )
    return <Plane size={20} />;
  if (value.includes("hotel") || value.includes("alloggio"))
    return <BedDouble size={20} />;
  if (value.includes("bigliett") || value.includes("ticket"))
    return <Ticket size={20} />;
  return <FileText size={20} />;
}
function DocumentRow({
  document,
  onToggle,
  onDelete,
}: {
  document: TravelDocument;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const previewUrl = `/api/documents/${document.id}/download?preview=1`;
  return (
    <article data-booking-id={document.bookingId || undefined}>
      <div className="document-icon">
        <DocumentKindIcon name={`${document.name} ${document.fileName}`} />
      </div>
      <div>
        <strong>{document.name}</strong>
        <span className="document-original-name">
          {document.fileName} · {formatSize(document.size)}
          {document.bookingId ? " · Collegato a una prenotazione" : ""}
        </span>
        <span>{formatSize(document.size)}{document.bookingId ? " · Collegato a una prenotazione" : ""}</span>
      </div>
      {document.category === "personal" && (
        <Lock size={16} className="document-lock" />
      )}
      {document.storageKey && (
        <a
          className="document-open-link"
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Eye size={16} /> Apri
        </a>
      )}
      <button
        className={`offline-button ${document.offline ? "active" : ""}`}
        onClick={onToggle}
      >
        <WifiOff size={16} /> {document.offline ? "Offline" : "Solo online"}
      </button>
      <button
        className="row-delete"
        onClick={onDelete}
        aria-label={`Elimina ${document.name}`}
      >
        <Trash2 size={17} />
      </button>
    </article>
  );
}
