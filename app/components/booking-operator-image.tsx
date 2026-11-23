import { operatorLogo } from "../../lib/booking-view";
import { TravelCategoryIcon, travelCategoryFromText } from "./travel-category-icon";
export function BookingOperatorImage({provider,type,title}:{provider?:string|null;type?:string;title?:string}){
 const logo=operatorLogo(provider);
 return <figure data-operator={logo} className="activity-place-photo booking-operator-photo" aria-label={provider || "Prenotazione"}>{logo?<img src={`/brands/${logo}.svg`} alt={provider || "Operatore"} />:<TravelCategoryIcon category={travelCategoryFromText(type || "",title || "")} size={22}/>}</figure>;
}
