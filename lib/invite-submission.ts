"use client";

export type InvitePhase = "idle" | "submitting" | "success" | "error" | "uncertain";
export type InviteFeedback = { phase: InvitePhase; message: string; checking?: boolean; resendOf?: string };
export type InviteDraft = { email: string; role: string };
export type InviteResult = { userId: string; participant: { id: string; name: string; email: string; role: string; status: string }; code: string; link: string; emailStatus?: string };

// One controller per mounted form; the synchronous lock covers click and Enter.
export function createInviteSubmission(options: {
  context: () => string;
  userId: () => string;
  tripId: () => string;
  onState: (state: InviteFeedback) => void;
  onSuccess: (result: InviteResult) => void;
  fetch?: typeof fetch;
  key?: () => string;
  timeoutMs?: number;
  checkTimeoutMs?: number;
}) {
  const transport = options.fetch || fetch;
  let busy = false, generation = 0, phase: InvitePhase = "idle";
  let operation: { signature: string; key: string; context: string; resendOf?: string; uncertain?: boolean } | null = null;
  const controllers = new Set<AbortController>();
  const publish = (state: InviteFeedback) => { phase = state.phase; options.onState(state); };
  async function request(payload: InviteDraft & { resendOf?: string }, key: string, intent: "send" | "status" | "resend", deadline: number) {
    const controller = new AbortController(); controllers.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        transport(`/api/trips/${options.tripId()}/invites`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ ...payload, intent }), signal: controller.signal })
          .then(async response => ({ ok: response.ok, status: response.status, value: await response.json() })),
        new Promise<never>((_, reject) => { controller.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }); timer = setTimeout(() => { controller.abort(); reject(new Error("uncertain")); }, deadline); }),
      ]);
    } finally { if (timer) clearTimeout(timer); controllers.delete(controller); }
  }
  function reset() {
    if (busy) return false;
    generation++; if (!operation?.uncertain) operation = null; publish({ phase: "idle", message: "" }); return true;
  }
  function cancel() {
    generation++; busy = false; operation = null;
    for (const controller of controllers) controller.abort(); controllers.clear();
  }
  async function submit(draft: InviteDraft, explicitResendOf?: string) {
    if (busy || !options.userId()) return;
    const payload = { email: draft.email.trim().toLowerCase(), role: draft.role };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { publish({ phase: "error", message: "Inserisci un indirizzo email valido." }); return; }
    const signature = JSON.stringify(payload), context = options.context(), owner = options.userId();
    if (operation?.context !== context) operation = null;
    if (phase === "success" && operation?.signature === signature) return;
    if (!operation || operation.signature !== signature || explicitResendOf && operation.resendOf !== explicitResendOf) operation = { signature, key: (options.key || (() => crypto.randomUUID()))(), context, resendOf: explicitResendOf };
    const key = operation.key, revision = generation;
    const current = () => revision === generation && context === options.context() && owner === options.userId();
    busy = true; publish({ phase: "submitting", message: "Invio in corso…" });
    const success = (result: InviteResult) => {
      if (!current() || result.userId !== owner) return false;
      if (operation) operation.uncertain = false;
      publish({ phase: "success", message: "Invito inviato" }); options.onSuccess(result); return true;
    };
    try {
      const response = await request({ ...payload, resendOf: operation.resendOf }, key, operation.resendOf ? "resend" : "send", options.timeoutMs ?? 18000);
      if (!current()) return;
      if (response.ok) {
        if (!success(response.value)) publish({ phase: "error", message: "La sessione è cambiata. Riapri la pagina prima di invitare." });
        return;
      }
      if ([400, 401, 403, 409, 410].includes(response.status)) { publish({ phase: "error", message: response.value.error || "Invito non disponibile. Verifica i dati e riprova.", resendOf: response.value.code === "RESEND_REQUIRED" ? response.value.resendOf : undefined }); return; }
      throw new Error("uncertain");
    } catch {
      if (!current()) return;
      if (operation) operation.uncertain = true;
      publish({ phase: "uncertain", message: "Verifica dell’invito in corso…", checking: true });
      try {
        const checked = await request(payload, key, "status", options.checkTimeoutMs ?? 8000);
        if (!current()) return;
        if (checked.ok && checked.value.found && success(checked.value)) return;
        if ([401, 403].includes(checked.status)) { publish({ phase: "error", message: "Accesso non più disponibile. Accedi nuovamente." }); return; }
      } catch { /* An interrupted connection is not proof of failure. */ }
      if (current()) publish({ phase: "uncertain", message: "Esito non ancora verificato. Puoi riprovare in sicurezza con lo stesso invito." });
    } finally {
      if (revision === generation) {
        busy = false;
        if (context !== options.context()) { operation = null; publish({ phase: "error", message: "La sessione è cambiata. Riapri la pagina prima di invitare." }); }
      }
    }
  }
  return { submit, reset, cancel, isBusy: () => busy };
}
