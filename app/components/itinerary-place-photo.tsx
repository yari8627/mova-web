"use client";
import { useEffect, useRef, useState } from 'react';
import { ImageOff, Image as ImageIcon, RotateCw } from 'lucide-react';
import { cachedPlacePhoto, placePhotoKey, placePhotoRetryWait, rejectPlacePhoto, resolvePlacePhoto, setPlacePhotoAccount, type PlacePhotoTarget, type PlacePhoto } from '../../lib/itinerary-place-photos';
import styles from './itinerary-place-photo.module.css';
type Props = { target: PlacePhotoTarget; country: string; countryCode: string; userId: string; active: boolean };
export function ItineraryPlacePhoto(props: Props) { return <PlacePhotoView key={props.userId + placePhotoKey(props.target, props.country)} {...props} />; }
function PlacePhotoView({ target, country, countryCode, userId, active }: Props) {
  const identity = placePhotoKey(target, country);
  const frame = useRef<HTMLElement>(null), image = useRef<HTMLImageElement>(null), recovered = useRef(false);
  const [visible, setVisible] = useState(false), [revision, setRevision] = useState(0);
  const [retryWait, setRetryWait] = useState(0);
  const [photo, setPhoto] = useState<PlacePhoto | null>(null), [state, setState] = useState<'loading'|'ready'|'error'>('loading');
  useEffect(() => { setPlacePhotoAccount(userId); }, [userId]);
  useEffect(() => {
    if (!active || visible) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(item => item.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '80px' });
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, [active, visible]);
  useEffect(() => {
    if (!active || !visible || (photo && state === 'ready' && revision === 0)) return;
    let current = true;
    const saved = revision ? undefined : cachedPlacePhoto(target, country);
    if (saved) setPhoto(saved);
    void resolvePlacePhoto(target, country, countryCode, revision > 0).then(value => { if (current) { if (value) setPhoto(value); else setState(previous => previous === 'ready' && photo ? previous : 'error'); } });
    const deadline = window.setTimeout(() => { if (current) setState(value => value === 'ready' ? value : 'error'); }, 25000);
    return () => { current = false; window.clearTimeout(deadline); };
  }, [visible, active, country, countryCode, identity, revision]);
  useEffect(() => {
    if (!photo) return;
    if (image.current?.complete) void displayed(image.current);
    const deadline = window.setTimeout(() => setState(value => value === 'ready' ? value : 'error'), 15000);
    return () => window.clearTimeout(deadline);
  }, [photo]);
  useEffect(() => {
    if (state !== 'error') return;
    const delay = placePhotoRetryWait(); setRetryWait(delay);
    if (!delay) return;
    // Enable a manual recovery after Retry-After; never trigger a request here.
    const timer = window.setTimeout(() => setRetryWait(0), Math.min(delay, 2147483647));
    return () => window.clearTimeout(timer);
  }, [state, revision]);
  async function displayed(target: HTMLImageElement) {
    try { if (!target.naturalWidth) throw Error('Image unavailable'); if (target.decode) await target.decode(); if (image.current === target) setState('ready'); }
    catch { if (image.current === target) failed(); }
  }
  function failed() { if (photo) rejectPlacePhoto(target, country, photo.url); setState('error'); }
  function recover() { if (recovered.current || !active || placePhotoRetryWait()) return; recovered.current = true; setState('loading'); setRevision(value => value + 1); }
  return <figure ref={frame} className={`activity-place-photo ${styles.frame}`} data-place-photo-state={state} aria-label={state === 'error' ? 'Foto non disponibile' : undefined}>
    {photo && <img key={photo.url} ref={image} src={photo.url} alt={target.place} loading="lazy" decoding="async" onLoad={event => { void displayed(event.currentTarget); }} onError={event => { if (image.current === event.currentTarget) failed(); }} style={{ opacity: state === 'ready' ? 1 : 0 }} />}
    {state === 'loading' && <span className={styles.placeholder} role="status" aria-label="Caricamento foto"><ImageIcon size={18} /></span>}
    {state === 'error' && <span className={styles.placeholder}>{!recovered.current ? <button type="button" onClick={recover} disabled={retryWait > 0} aria-label="Riprova foto del luogo"><RotateCw size={18} /></button> : <ImageOff size={18} aria-label="Foto non disponibile" />}</span>}
    {state === 'ready' && photo?.attribution && <figcaption>{photo.attributionUri && /^https:\/\//.test(photo.attributionUri) ? <a href={photo.attributionUri} target="_blank" rel="noreferrer">{photo.attribution}</a> : photo.attribution}</figcaption>}
  </figure>;
}
