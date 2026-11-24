"use client";
import { useEffect,useState } from "react";
import styles from "./booking-toast.module.css";
export function BookingToast({message}:{message:string}){const [visible,setVisible]=useState(Boolean(message));useEffect(()=>{setVisible(Boolean(message));if(!message)return;const timer=setTimeout(()=>setVisible(false),4000);return()=>clearTimeout(timer);},[message]);return visible?<div role="status" aria-live="polite" className={styles.toast}>{message}</div>:null;}
