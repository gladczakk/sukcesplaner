import { LIFE_AREAS, type LifeArea } from "@/types";

export const LIFE_AREA_LABELS: Record<LifeArea, string> = {
  dom: "Dom",
  sport: "Sport",
  praca: "Praca",
};

export const LIFE_AREA_OPTIONS: { value: LifeArea; label: string }[] = LIFE_AREAS.map((value) => ({
  value,
  label: LIFE_AREA_LABELS[value],
}));
