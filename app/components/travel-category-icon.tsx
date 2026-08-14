import { BedDouble, BusFront, CarFront, Landmark, MapPin, Plane, Ship, Ticket, TrainFront, Utensils } from "lucide-react";

export type TravelCategory = "flight" | "hotel" | "train" | "car" | "food" | "activity" | "ferry" | "bus" | "place";

const labels: Record<TravelCategory, string> = {
  flight: "Volo",
  hotel: "Hotel",
  train: "Treno",
  car: "Auto e transfer",
  food: "Ristorante",
  activity: "Attività",
  ferry: "Traghetto",
  bus: "Bus",
  place: "Luogo",
};

export function travelCategoryFromText(type: string, text = ""): TravelCategory {
  const value = `${type} ${text}`.toLocaleLowerCase("it");
  if (/ristor|pranzo|cena|colazione|food|bar|caff[eè]/.test(value)) return "food";
  if (/volo|flight|aereo|airport/.test(value)) return "flight";
  if (/hotel|alloggio|ostello|resort|apartment|soggiorno/.test(value)) return "hotel";
  if (/treno|train|rail/.test(value)) return "train";
  if (/traghetto|ferry|nave/.test(value)) return "ferry";
  if (/bus|pullman|coach/.test(value)) return "bus";
  if (/auto|car|taxi|transfer|parcheggio/.test(value)) return "car";
  if (/museo|museum|monumento|tour|visita|biglietto|activity/.test(value)) return "activity";
  if (type === "flight" || type === "hotel" || type === "train" || type === "car" || type === "activity") return type;
  return "place";
}

export function travelCategoryLabel(category: TravelCategory) { return labels[category]; }

export function TravelCategoryIcon({ category, size = 20 }: { category: TravelCategory; size?: number }) {
  if (category === "flight") return <Plane size={size} />;
  if (category === "hotel") return <BedDouble size={size} />;
  if (category === "train") return <TrainFront size={size} />;
  if (category === "car") return <CarFront size={size} />;
  if (category === "food") return <Utensils size={size} />;
  if (category === "ferry") return <Ship size={size} />;
  if (category === "bus") return <BusFront size={size} />;
  if (category === "activity") return <Landmark size={size} />;
  if (category === "place") return <MapPin size={size} />;
  return <Ticket size={size} />;
}
