type EmailMessage = { to: string; subject: string; title: string; intro: string; actionLabel: string; actionUrl: string; footer?: string; idempotencyKey?: string };

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
export function appUrl(request?: Request) { return (process.env.APP_URL || (request ? new URL(request.url).origin : "http://localhost:3000")).replace(/\/$/, ""); }

export async function sendMovaEmail(message: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY; const from = process.env.EMAIL_FROM || "MOVA <onboarding@resend.dev>";
  if (!apiKey) return { sent: false, development: true };
  const title = escapeHtml(message.title); const intro = escapeHtml(message.intro); const actionUrl = escapeHtml(message.actionUrl); const actionLabel = escapeHtml(message.actionLabel); const footer = escapeHtml(message.footer || "Se non hai richiesto questa operazione, puoi ignorare questa email.");
  const html = `<!doctype html><html lang="it"><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#111b3c"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e7f0;border-radius:20px"><tr><td style="padding:32px"><div style="font-size:34px;font-weight:800;color:#1156ef">mova</div><div style="color:#63708c;margin-top:2px">Travel together</div><h1 style="font-size:25px;margin:30px 0 10px">${title}</h1><p style="line-height:1.6;color:#526079">${intro}</p><a href="${actionUrl}" style="display:inline-block;margin:16px 0;padding:13px 20px;border-radius:10px;background:#1156ef;color:#fff;text-decoration:none;font-weight:700">${actionLabel}</a><p style="margin-top:24px;color:#8892a8;font-size:12px;line-height:1.5">${footer}</p></td></tr></table></td></tr></table></body></html>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "User-Agent": "MOVA/0.1", ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}) }, body: JSON.stringify({ from, to: [message.to], subject: message.subject, html }) });
  if (!response.ok) { const detail = await response.text(); console.error("Invio email MOVA fallito", response.status, detail); return { sent: false, development: false }; }
  return { sent: true, development: false };
}
