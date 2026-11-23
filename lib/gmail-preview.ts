type PreviewIdentity={key:string;identityKey?:string};
/** Keep edits and selection on the first copy. Distinct segments/events have distinct identities. */
export function mergeGmailPreviews<T extends PreviewIdentity>(previous:T[],incoming:T[]):T[]{
 const seen=new Set<string>(),out:T[]=[];
 for(const row of [...previous,...incoming]){const id=row.identityKey || row.key;if(!seen.has(id)){seen.add(id);out.push(row);}}
 return out;
}
