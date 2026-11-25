type PreviewIdentity={key:string;identityKey?:string};
/** Keep edits and selection on the first copy. Distinct segments/events have distinct identities. */
export function mergeGmailPreviews<T extends PreviewIdentity>(previous:T[],incoming:T[]):T[]{
 const seen=new Set<string>(),out:T[]=[];
 for(const row of [...previous,...incoming]){const prior=out.findIndex(r=>r.key===row.key);if(prior>=0 && out[prior].identityKey!==row.identityKey){seen.delete(out[prior].identityKey || out[prior].key);out.splice(prior,1);}const id=row.identityKey || row.key;if(!seen.has(id)){seen.add(id);out.push(row);}}
 return out;
}
