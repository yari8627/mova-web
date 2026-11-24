"use client";
import type { ReactNode } from "react";
export function BookingForm({children,onSave}:{children:ReactNode;onSave:()=>void}){return <form className="trip-form" onSubmit={e=>{e.preventDefault();onSave();}}>{children}</form>;}
