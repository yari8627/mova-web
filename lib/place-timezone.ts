import { find } from "geo-tz/dist/find-all";
export function placeTimezone(latitude:unknown,longitude:unknown) {
 if(typeof latitude!=="number" || typeof longitude!=="number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180)return "";
 try {const zones=find(latitude,longitude);return zones.length===1 && !zones[0].startsWith("Etc/")?zones[0]:"";}catch{return "";}
}

