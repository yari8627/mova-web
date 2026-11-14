"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { matchInviteContacts, type InviteContact } from "../../../../lib/invite-contact-suggestions";
import styles from "./participants.module.css";

type Props = { tripId: string; userId: string; enabled: boolean; disabled: boolean; value: string; excluded: string[]; onChange: (email: string) => void };
export function InviteContactField({ tripId, userId, enabled, disabled, value, excluded, onChange }: Props) {
  const fieldId = useId(), listId = `${fieldId}-contacts`, scope = `${userId}:${tripId}`;
  const [result, setResult] = useState<{ scope: string; contacts: InviteContact[]; status: "loading" | "ready" | "error" }>({ scope: "", contacts: [], status: "loading" });
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (!enabled || !userId) return;
    let current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    setResult({ scope, contacts: [], status: "loading" }); setActive(-1); setOpen(true);
    void fetch(`/api/travel-companions?${new URLSearchParams({ scope: "invite", tripId })}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Suggerimenti non disponibili");
      const data = await response.json();
      if (data.userId !== userId || data.tripId !== tripId || !Array.isArray(data.contacts) || !data.contacts.every((contact: InviteContact) => contact && typeof contact.email === "string" && typeof contact.name === "string")) throw new Error("Contesto cambiato");
      if (current) setResult({ scope, contacts: data.contacts, status: "ready" });
    }).catch(() => { if (current) setResult({ scope, contacts: [], status: "error" }); }).finally(() => clearTimeout(timer));
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [tripId, userId, enabled, scope]);

  const contacts = enabled && result.scope === scope ? matchInviteContacts(result.contacts, value, excluded) : [];
  const expanded = open && !disabled && contacts.length > 0;
  const status = result.scope === scope ? result.status : "loading";
  function select(index: number) {
    if (!enabled || disabled || !contacts[index]) return;
    onChange(contacts[index].email); setOpen(false); setActive(-1);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!enabled || disabled) return;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && contacts.length) {
      event.preventDefault(); setOpen(true);
      setActive(event.key === "ArrowDown" ? (!expanded || active >= contacts.length - 1 ? 0 : active + 1) : (!expanded || active <= 0 ? contacts.length - 1 : active - 1));
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault(); event.stopPropagation(); if (active >= 0) select(active);
    } else if (event.key === "Escape" && open && value.trim().length >= 2) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1);
    } else if (event.key === "Tab") { setOpen(false); setActive(-1); }
  }
  return <div className={styles.contactField} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
    <label htmlFor={fieldId}>Nome o email</label>
    <input id={fieldId} type="email" autoComplete="off" disabled={disabled || !enabled} value={value} required placeholder="Cerca un nome o inserisci l’email"
      role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && active >= 0 && active < contacts.length ? `${listId}-${active}` : undefined}
      onFocus={() => setOpen(true)} onKeyDown={onKeyDown} onChange={event => { setActive(-1); setOpen(true); onChange(event.target.value); }} />
    {expanded && <ul id={listId} role="listbox" aria-label="Persone già conosciute" className={styles.contactOptions} onMouseDown={event => event.preventDefault()}>
      {contacts.map((contact, index) => <li key={contact.email} id={`${listId}-${index}`} role="option" aria-selected={index === active} onClick={() => select(index)} onMouseEnter={() => setActive(index)}>
        {contact.name && <strong>{contact.name}</strong>}<span>{contact.email}</span>
      </li>)}
    </ul>}
    {open && enabled && !disabled && value.trim().length >= 2 && !contacts.length && <small className={styles.contactHint} role="status">
      {status === "loading" ? "Caricamento suggerimenti…" : status === "error" ? "Suggerimenti non disponibili. Puoi inserire l’email." : "Nessuna corrispondenza. Puoi inserire l’email."}
    </small>}
  </div>;
}
