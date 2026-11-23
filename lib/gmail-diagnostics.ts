import { createHmac, randomBytes } from "crypto";
const allowed=new Set(["insufficient_details","repeated_preview","search_page_complete","search_more_pages","search_filter_or_pagination","fetch_oversized","receipt_excluded","candidate_preview","duplicate_preview","missing_reference","unknown_booking_type","unconfirmed_booking_message","mime_text_absent","mime_body_limit","mime_part_limit","mime_text_attachment_skipped","mime_rfc822_unsupported","mime_text_truncated"]);
/** Off by default, scoped to a single explicitly configured user. No logs or persistent trace. */
export function gmailDiagnosticTrace(userId:string,env=process.env){
 const enabled=env.NAMI_GMAIL_DIAGNOSTICS==="1" && !!env.NAMI_GMAIL_DIAGNOSTIC_USER_ID && env.NAMI_GMAIL_DIAGNOSTIC_USER_ID===userId;
 const key=enabled?randomBytes(32):null;
 const entries:{id:string;reason:string}[]=[];
 return {enabled,entries,record(id:string,reason:string){if(key && allowed.has(reason) && entries.length<100)entries.push({id:createHmac("sha256",key).update(id).digest("hex"),reason});}};
}
