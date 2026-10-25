export type AcceptFeedback = { phase: "idle" | "accepting" | "checking" | "success" | "error" | "uncertain"; message: string };
export type AcceptedInvite = { accepted: true; tripId: string; userId: string };

// Like invite-submission, one controller owns the synchronous lock for a mounted
// operation. A timeout is uncertain: GET verifies status before offering a retry.
export function createInviteAcceptance(options: {
  code: string;
  userId: string;
  tripId: string;
  onState: (state: AcceptFeedback) => void;
  onSuccess: (result: AcceptedInvite) => void;
  fetch?: typeof fetch;
  timeoutMs?: number;
  checkTimeoutMs?: number;
}) {
  const transport = options.fetch || fetch;
  let busy = false, done = false, cancelled = false, uncertain = false;
  const controllers = new Set<AbortController>();
  const publish = (state: AcceptFeedback) => { if (!cancelled) options.onState(state); };
  async function request(method: "POST" | "GET", timeout: number) {
    const controller = new AbortController(); controllers.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        transport(`/api/invites/${encodeURIComponent(options.code)}${method === "POST" ? "/accept" : ""}`, { method, cache: "no-store", signal: controller.signal })
          .then(async response => ({ ok: response.ok, status: response.status, value: await response.json() })),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("interrupted")), { once: true });
          timer = setTimeout(() => controller.abort(), timeout);
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); controllers.delete(controller); }
  }
  function success(result: AcceptedInvite) {
    if (cancelled) return;
    if (result.accepted !== true || result.userId !== options.userId || result.tripId !== options.tripId) throw new Error("Unexpected acceptance");
    done = true; uncertain = false;
    publish({ phase: "success", message: "Invito accettato!" });
    options.onSuccess(result);
  }
  async function check() {
    publish({ phase: "checking", message: "Verifica dell’accettazione in corso…" });
    try {
      const checked = await request("GET", options.checkTimeoutMs ?? 8000);
      if (cancelled) return;
      if (checked.ok && checked.value.user?.id === options.userId && checked.value.trip?.id === options.tripId) {
        if (checked.value.canAccess) {
          success({ accepted: true, userId: options.userId, tripId: options.tripId }); return;
        }
        if (checked.value.status === "pending" && !checked.value.expired && checked.value.code === options.code) {
          // A still-running first POST is safe to retry: the endpoint atomically
          // claims the same invite and cannot duplicate participation/notification.
          uncertain = false;
          publish({ phase: "error", message: "Accettazione non ancora confermata. Puoi riprovare in sicurezza." }); return;
        }
        uncertain = false;
        publish({ phase: "error", message: "L’invito non è più utilizzabile. Richiedi un nuovo invito al proprietario." }); return;
      }
      if ([401, 403, 404, 410].includes(checked.status) || checked.ok && checked.value.user?.id !== options.userId) {
        uncertain = false;
        publish({ phase: "error", message: "Accesso non disponibile. Verifica l’account o riapri l’invito." }); return;
      }
    } catch { /* Loss of a response is not proof of a failed acceptance. */ }
    publish({ phase: "uncertain", message: "Esito non ancora verificato. Controlla lo stato prima di riprovare." });
  }
  async function accept() {
    if (busy || done || cancelled) return;
    busy = true;
    try {
      if (uncertain) { await check(); return; }
      publish({ phase: "accepting", message: "Accettazione in corso…" });
      try {
        const response = await request("POST", options.timeoutMs ?? 18000);
        if (cancelled) return;
        if (response.ok) { success(response.value); return; }
        if ([400, 401, 403, 404, 409, 410].includes(response.status)) {
          publish({ phase: "error", message: response.value.error || "Invito non disponibile. Verifica l’account e riprova." }); return;
        }
        throw new Error("Uncertain response");
      } catch {
        if (cancelled) return;
        uncertain = true;
        await check();
      }
    } finally { busy = false; }
  }
  return {
    accept,
    isBusy: () => busy,
    cancel() { cancelled = true; for (const controller of controllers) controller.abort(); controllers.clear(); },
  };
}
