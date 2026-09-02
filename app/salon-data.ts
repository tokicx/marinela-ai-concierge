export type Service = {
  id: string;
  name: string;
  duration: number;
  durationLabel: string;
  price: string;
  category: "Ekstenzije" | "Boja" | "Styling" | "Njega";
  description: string;
  image?: string;
  buffer: number;
  staffIds: Array<"marinela" | "mia">;
};

export const services: Service[] = [
  {
    id: "ugradnja-ekstenzija",
    name: "Ugradnja ekstenzija",
    duration: 180,
    durationLabel: "3 h",
    price: "Cijena na upit",
    category: "Ekstenzije",
    description: "Individualan odabir metode, nijanse i količine za prirodan volumen i dužinu.",
    image: "/images/extensions-application.jpeg",
    buffer: 0,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "balayage-color",
    name: "Balayage color",
    duration: 180,
    durationLabel: "3 h",
    price: "Cijena na upit",
    category: "Boja",
    description: "Mekani, prirodni prijelazi i personalizirana dimenzija boje.",
    image: "/images/balayage-result.jpg",
    buffer: 0,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "bojanje-kose",
    name: "Bojanje kose",
    duration: 90,
    durationLabel: "1 h 30 min",
    price: "Cijena na upit",
    category: "Boja",
    description: "Profesionalno bojanje s fokusom na ton, sjaj i zdrav izgled kose.",
    image: "/images/hair-treatment.jpg",
    buffer: 30,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "korekcija-ekstenzija",
    name: "Hair Extensions korekcija",
    duration: 180,
    durationLabel: "3 h",
    price: "Cijena na upit",
    category: "Ekstenzije",
    description: "Precizna korekcija i ponovno postavljanje za uredan, siguran rezultat.",
    image: "/images/micro-bond-detail.jpeg",
    buffer: 60,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "najam-kose",
    name: "Najam kose",
    duration: 15,
    durationLabel: "15 min",
    price: "Cijena na upit",
    category: "Ekstenzije",
    description: "Savjetovanje i odabir kose za volumen, dužinu ili posebnu prigodu.",
    image: "/images/hair-colour-range.jpg",
    buffer: 0,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "wedding-hair",
    name: "Wedding hair",
    duration: 60,
    durationLabel: "1 h",
    price: "Cijena na upit",
    category: "Styling",
    description: "Profinjen bridal styling usklađen s licem, haljinom i atmosferom vjenčanja.",
    image: "/images/bridal-looks.webp",
    buffer: 30,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "konzultacija",
    name: "Konzultacija",
    duration: 15,
    durationLabel: "15 min",
    price: "Bez naknade",
    category: "Njega",
    description: "Kratak stručni razgovor i personalizirani plan prije veće promjene.",
    image: "/images/salon-story-premium.webp",
    buffer: 0,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "pramenovi-iz-korijena",
    name: "Pramenovi iz korijena",
    duration: 180,
    durationLabel: "3 h",
    price: "Cijena na upit",
    category: "Boja",
    description: "Precizno osvježenje izrasta uz skladan prijelaz u postojeću boju.",
    image: "/images/hair-treatment.jpg",
    buffer: 0,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "povrsinski-pramenovi",
    name: "Površinski pramenovi",
    duration: 120,
    durationLabel: "2 h",
    price: "Cijena na upit",
    category: "Boja",
    description: "Diskretna svjetlina i dimenzija na vidljivim dijelovima kose.",
    image: "/images/hair-colour-range.jpg",
    buffer: 0,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "skidanje-ekstenzija",
    name: "Skidanje ekstenzija",
    duration: 60,
    durationLabel: "1 h",
    price: "Cijena na upit",
    category: "Ekstenzije",
    description: "Pažljivo i stručno uklanjanje uz očuvanje prirodne kose.",
    buffer: 0,
    staffIds: ["marinela", "mia"],
  },
  {
    id: "marinela-ritual",
    name: "The Marinela Ritual",
    duration: 60,
    durationLabel: "1 h",
    price: "Personalizirana cijena",
    category: "Njega",
    description: "Potpisni tretman njege oblikovan prema trenutačnim potrebama vaše kose.",
    buffer: 0,
    staffIds: ["marinela", "mia"],
  },
];

export function bookingHref(serviceId: string) {
  return `/rezervacija?usluga=${encodeURIComponent(serviceId)}`;
}

export function resolveServiceId(candidate?: string | null) {
  return services.some((service) => service.id === candidate)
    ? candidate as string
    : services[0].id;
}

export const team = [
  {
    id: "marinela",
    name: "Marinela Grančić",
    role: "Vlasnica · Hair artist",
    bio: "Specijalizirana za ekstenzije, balayage i transformacije po mjeri.",
    initials: "MG",
  },
  {
    id: "mia",
    name: "Mia Jakelić",
    role: "Hair stylist",
    bio: "Posvećena preciznoj izvedbi, zdravlju kose i suvremenom stylingu.",
    initials: "MJ",
  },
] as const;

export const openingHours = [
  ["Ponedjeljak", "14:00 – 21:00"],
  ["Utorak", "07:00 – 14:00"],
  ["Srijeda", "07:00 – 14:00"],
  ["Četvrtak", "07:00 – 14:00"],
  ["Petak", "07:00 – 14:00"],
  ["Subota", "Zatvoreno"],
  ["Nedjelja", "Zatvoreno"],
] as const;
