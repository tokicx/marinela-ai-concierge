export type PriceCell = {
  value: string;
  note?: string;
};

export type PriceListItem = {
  id: string;
  name: string;
  note?: string;
  tone?: "standard" | "subtle";
  cells: PriceCell[];
};

export type PriceListTable = {
  id: string;
  title?: string;
  columns: string[];
  items: PriceListItem[];
};

export type PriceListSection = {
  id: string;
  title: string;
  kicker: string;
  tables: PriceListTable[];
};

export type ManagedPriceListItem = PriceListItem & {
  tableId: string;
  active: boolean;
  custom: boolean;
  sortOrder: number;
};

export type ManagedPriceListTable = Omit<PriceListTable, "items"> & {
  items: ManagedPriceListItem[];
};

export type ManagedPriceListSection = Omit<PriceListSection, "tables"> & {
  tables: ManagedPriceListTable[];
};

type CellInput = string | [value: string, note: string];

function cells(...values: CellInput[]): PriceCell[] {
  return values.map((value) => Array.isArray(value)
    ? { value: value[0], note: value[1] }
    : { value });
}

const hairLengthColumns = ["Kratka", "Srednja", "Duga", "Ekstra duga", "Ekstenzije"];

export const priceListSections: PriceListSection[] = [
  {
    id: "bojanja",
    title: "Bojanja",
    kicker: "Boja po mjeri",
    tables: [
      {
        id: "bojanja-kosa",
        columns: hairLengthColumns,
        items: [
          {
            id: "bojanje-permanentno-izrast",
            name: "Bojanje permanentnom bojom",
            note: "1 cm izrasta",
            cells: cells("50,00 €", "70,00 €", "80,00 €", "90,00 €", "90,00 €"),
          },
          {
            id: "bojanje-permanentno-duzina",
            name: "Bojanje permanentnom bojom",
            cells: cells(
              ["55,00 €", "2 cm"],
              ["75,00 €", "3 cm"],
              ["85,00 €", "4 cm"],
              ["90,00 €", "5 cm"],
              ["95,00 €", "5 cm"],
            ),
          },
          {
            id: "bojanje-semi-permanentno",
            name: "Bojanje semi permanentnom bojom",
            cells: cells("30,00 €", "50,00 €", "70,00 €", "90,00 €", "90,00 €"),
          },
          { id: "maska-u-boji", name: "Maska u boji", cells: cells("10,00 €", "", "", "", "") },
          { id: "silver-sampon", name: "Silver šampon", cells: cells("7,00 €", "", "", "", "") },
          { id: "musko-bojanje", name: "Muško bojanje", cells: cells("20,00 €", "", "", "", "") },
          { id: "muska-dekoloracija", name: "Muška dekoloracija", cells: cells("50,00 €", "", "", "", "") },
        ],
      },
    ],
  },
  {
    id: "sisanja",
    title: "Šišanja",
    kicker: "Precizna forma",
    tables: [
      {
        id: "sisanja-kosa",
        columns: hairLengthColumns,
        items: [
          { id: "zensko-sisanje", name: "Žensko s uključenim pranjem i feniranjem", cells: cells("30,00 €", "40,00 €", "50,00 €", "60,00 €", "60,00 €") },
          { id: "vrhovi-nakon-usluge", name: "Vrhovi nakon usluge bojanja ili ugradnje", cells: cells("10,00 €", "", "", "", "") },
          { id: "musko-sisanje-pranje", name: "Muško s uključenim pranjem prije i poslije", cells: cells("20,00 €", "", "", "", "") },
          { id: "sisanje-masinicom", name: "Mašinicom", cells: cells("15,00 €", "", "", "", "") },
          { id: "djecje-musko", name: "Dječje muško do 7 godina", cells: cells("10,00 €", "", "", "", "") },
          { id: "djecje-zensko", name: "Dječje žensko do 7 godina", cells: cells("15,00 €", "", "", "", "") },
        ],
      },
    ],
  },
  {
    id: "oblikovanje-kose",
    title: "Oblikovanje kose",
    kicker: "Završni potpis",
    tables: [
      {
        id: "oblikovanje-kosa",
        columns: hairLengthColumns,
        items: [
          { id: "fen-ravno", name: "Fen ravno", cells: cells("15,00 €", "19,00 €", "24,00 €", "30,00 €", "30,00 €") },
          { id: "wash-and-go", name: "Wash and go", cells: cells("10,00 €", "", "", "", "") },
          { id: "fen-valovi", name: "Fen valovi", cells: cells("20,00 €", "25,00 €", "28,00 €", "40,00 €", "40,00 €") },
          { id: "figaro-nakon-ekstenzija", name: "Figaro nakon ugradnje ekstenzija", cells: cells("10,00 €", "", "", "", "") },
          { id: "figaro", name: "Figaro", cells: cells("30,00 €", "35,00 €", "38,00 €", "40,00 €", "40,00 €") },
          { id: "presa", name: "Presa", cells: cells("40,00 €", "50,00 €", "60,00 €", "70,00 €", "70,00 €") },
        ],
      },
    ],
  },
  {
    id: "pramenovi-dekoloracije",
    title: "Pramenovi i dekoloracije",
    kicker: "Svjetlo i dimenzija",
    tables: [
      {
        id: "pramenovi-tehnike",
        columns: ["Kratka", "Srednja", "Gusta", "Ekstra gusta"],
        items: [
          {
            id: "dekoloracija-preljev",
            name: "Dekoloracija",
            note: "S uključenim preljevom",
            cells: cells(["80,00 €", "do 1 cm"], ["110,00 €", "do 2 cm"], ["150,00 €", "do 3 cm"], ["200,00 €", "preko 3 cm"]),
          },
          { id: "skidanje-boje", name: "Skidanje boje", cells: cells("100,00 €", "200,00 €", "300,00 €", "400,00 €") },
          { id: "face-framing", name: "Face framing", note: "Pramenovi do 10 folija s uključenim preljevom", cells: cells("75,00 €", "", "", "") },
          { id: "pramenovi-izrasta", name: "Pramenovi izrasta do 3 cm", note: "S uključenim preljevom", cells: cells("150,00 €", "150,00 €", "150,00 €", "200,00 €") },
          { id: "pramenovi-izrasta-duzine", name: "Pramenovi izrasta i dužine", note: "S uključenim preljevom", cells: cells("200,00 €", "200,00 €", "200,00 €", "300,00 €") },
          { id: "parcijalni-pramenovi", name: "Parcijalni pramenovi (kocka)", note: "S uključenim preljevom", cells: cells("100,00 €", "", "", "") },
          { id: "balayage", name: "Balayage", note: "S uključenim preljevom", cells: cells("150,00 €", "150,00 €", "200,00 €", "200,00 €") },
          { id: "air-touch", name: "Air Touch", note: "S uključenim preljevom", cells: cells("160,00 €", "160,00 €", "210,00 €", "210,00 €") },
          { id: "kontra-balayage", name: "Kontra balayage", note: "S uključenim preljevom", cells: cells("200,00 €", "", "", "") },
          { id: "brazilska-tehnika", name: "Brazilska tehnika pramenova", note: "S uključenim preljevom", cells: cells("170,00 €", "", "", "") },
          { id: "root-shadow", name: "Root Shadow tehnika pramenova", note: "S uključenim preljevom", cells: cells("200,00 €", "", "", "") },
        ],
      },
    ],
  },
  {
    id: "ugradnja-ekstenzija",
    title: "Ugradnja ekstenzija",
    kicker: "Dužina bez kompromisa",
    tables: [
      {
        id: "keratinska-ugradnja",
        title: "Keratinska ugradnja",
        columns: ["Do 60 cm", "60–70 cm", "Preko 70 cm", "Kovrčava"],
        items: [
          { id: "keratinska-ugradnja-gram", name: "Keratinska ugradnja po gramu", cells: cells("6,50 €", "7,50 €", "9,50 €", "7,50–8,50 €") },
          { id: "keratinska-ugradnja-gotovina", name: "Za gotovinu odobravamo popust", tone: "subtle", cells: cells("6,00 €", "7,00 €", "9,00 €", "7,00–8,00 €") },
          { id: "keratin-korekcija-pramen", name: "Keratin korekcija po pramenu", cells: cells("3,50 €", "", "", "") },
          { id: "keratin-korekcija-gotovina", name: "Za gotovinu odobravamo popust", tone: "subtle", cells: cells("3,00 €", "", "", "") },
        ],
      },
      {
        id: "tape-in-uklanjanje",
        title: "Tape In i korekcije",
        columns: ["Cijena"],
        items: [
          { id: "tape-in-50", name: "Tape In", note: "50 gr", cells: cells("350,00 €") },
          { id: "tape-in-100", name: "Tape In", note: "100 gr", cells: cells("700,00 €") },
          { id: "tape-in-120", name: "Tape In", note: "120 gr", cells: cells("750,00 €") },
          { id: "tape-in-150", name: "Tape In", note: "150 gr", cells: cells("800,00 €") },
          { id: "tape-in-200", name: "Tape In", note: "200 gr", cells: cells("1000,00 €") },
          { id: "tape-in-korekcija-100", name: "Tape In korekcija", note: "Do 100 gr", cells: cells("150,00 €") },
          { id: "tape-in-korekcija-200", name: "Tape In korekcija", note: "Do 200 gr", cells: cells("200,00 €") },
          { id: "skidanje-tudeg-rada", name: "Skidanje tuđeg rada po satu", note: "Bez pranja i fena", cells: cells("50,00 €") },
          { id: "skidanje-naseg-rada", name: "Skidanje našeg rada po satu", note: "Bez pranja i fena", cells: cells("30,00 €") },
        ],
      },
    ],
  },
];

export function findPriceListTable(tableId: string) {
  for (const section of priceListSections) {
    const table = section.tables.find((candidate) => candidate.id === tableId);
    if (table) return table;
  }
  return null;
}

export function findBasePriceListItem(itemId: string) {
  for (const section of priceListSections) {
    for (const table of section.tables) {
      const index = table.items.findIndex((candidate) => candidate.id === itemId);
      if (index >= 0) return { section, table, item: table.items[index], index };
    }
  }
  return null;
}
