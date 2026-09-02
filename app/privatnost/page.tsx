import type { Metadata } from "next";
import LegalPageShell from "../legal-page-shell";

export const metadata: Metadata = {
  title: "Politika privatnosti",
  description:
    "Kako Marinela Hair Design obrađuje podatke za rezervacije, sigurnost i Google Calendar sinkronizaciju.",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      current="privacy"
      lead="Jasno objašnjavamo koje podatke trebamo za rezervaciju, kako ih štitimo i kako zaposlenice dobrovoljno povezuju svoj Google kalendar."
      title="Politika privatnosti"
      updatedAt="2. rujna 2026."
    >
      <div className="legal-summary">
        <p>
          Podatke koristimo samo za rad salona, obradu rezervacija, sigurnost sustava i
          funkcije koje korisnik svjesno aktivira. Ne prodajemo osobne ni Google podatke
          i ne koristimo ih za oglašavanje.
        </p>
      </div>

      <section>
        <p className="legal-section-number">01</p>
        <h2>Voditelj obrade i kontakt</h2>
        <p>
          Voditelj obrade podataka prikupljenih putem ove stranice je Marinela Hair Design,
          vlasnica Marinela Grančić, Ulica kralja Zvonimira 14b, 21210 Solin. Za pitanja,
          zahtjeve ili ostvarivanje prava možete se javiti na{" "}
          <a href="mailto:marinela.grancic@gmail.com">marinela.grancic@gmail.com</a> ili
          na <a href="tel:+385955565738">095 556 5738</a>.
        </p>
      </section>

      <section>
        <p className="legal-section-number">02</p>
        <h2>Podaci koje obrađujemo</h2>
        <p>Prilikom online rezervacije možemo obraditi:</p>
        <ul>
          <li>ime i prezime, e-mail adresu i broj mobitela;</li>
          <li>odabranu uslugu, zaposlenicu, datum i vrijeme termina;</li>
          <li>neobaveznu napomenu te status rezervacije i obavijesti;</li>
          <li>ograničene tehničke i sigurnosne podatke potrebne za zaštitu obrasca.</li>
        </ul>
        <p>
          Za ovlaštene članove tima obrađujemo ime, e-mail adresu, dodijeljenu ulogu i
          evidenciju administrativnih radnji radi zaštite sustava i odgovornog upravljanja.
        </p>
      </section>

      <section>
        <p className="legal-section-number">03</p>
        <h2>Svrhe i pravne osnove</h2>
        <p>
          Podatke koristimo za zaprimanje, potvrdu, izmjenu i otkazivanje termina,
          komunikaciju s klijentom, provjeru raspoloživosti, sprječavanje dvostrukih
          rezervacija, sigurnost stranice te ispunjavanje zakonskih obveza.
        </p>
        <p>
          Obrada potrebna za rezervaciju temelji se na poduzimanju radnji na zahtjev
          klijenta i pružanju dogovorene usluge. Sigurnosne provjere i administrativne
          evidencije temelje se na legitimnom interesu zaštite klijenata, salona i sustava.
        </p>
      </section>

      <section id="google-calendar">
        <p className="legal-section-number">04</p>
        <h2>Google Calendar i Google korisnički podaci</h2>
        <p>
          Zaposlenica dobrovoljno pokreće povezivanje svojeg Google računa i odobrava
          pristup na Googleovu zaslonu za privolu. Aplikacija tada pristupa e-mail adresi
          Google računa, popisu kalendara, podacima o zauzetosti te ovlasti za stvaranje,
          ažuriranje i uklanjanje događaja.
        </p>
        <p>
          Te ovlasti koristimo isključivo za odabir kalendara, provjeru dostupnosti,
          sprječavanje preklapanja te upis, izmjenu i otkazivanje salonskih termina.
          U događaj se mogu poslati naziv usluge, ime i e-mail klijenta, zaposlenica,
          datum, vrijeme, lokacija salona i interna oznaka rezervacije. Klijent tada može
          primiti Google Calendar pozivnicu ili obavijest o otkazivanju.
        </p>
        <div className="legal-google-note">
          <h3>Kako štitimo Google pristup</h3>
          <p>
            Pohranjujemo adresu povezanog Google računa, identifikator kalendara, vrijeme
            povezivanja i šifrirani token za obnovu pristupa. Ne pohranjujemo Google
            lozinku niti sadržaj drugih privatnih događaja. Podatke o zauzetosti koristimo
            samo tijekom provjere raspoloživosti.
          </p>
          <p>
            Podatke primljene iz Google API-ja ne prodajemo, ne koristimo za oglašavanje,
            profiliranje ili kreditne odluke i koristimo ih u skladu s{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>, uključujući Limited Use zahtjeve.
          </p>
        </div>
        <p>
          Zaposlenica može opozvati pristup u postavkama svojeg Google računa ili
          zatražiti odspajanje putem kontakta salona.
        </p>
      </section>

      <section>
        <p className="legal-section-number">05</p>
        <h2>AI concierge i WebMCP</h2>
        <p>
          Kada ovu stranicu otvorite u kompatibilnom AI pregledniku, možete svjesno
          zatražiti da AI agent koristi WebMCP alate stranice. Alati izlažu samo javne
          podatke salona, odabranu uslugu, zaposlenicu, datum i vrijeme potrebno za
          provjeru raspoloživosti. Ne šalju ni ne pohranjuju cijeli razgovor, ime,
          e-mail, broj mobitela ili napomenu klijenta.
        </p>
        <p>
          Agent može pripremiti neosobni odabir u vidljivom obrascu, ali ne stvara ni
          potvrđuje rezervaciju. Kontaktne podatke unosite osobno tek u obrascu, potvrdu
          upoznatosti s politikom označavate sami, a rezervacija nastaje
          tek nakon sigurnosne provjere i vašeg klika na „Potvrdi rezervaciju”. Obrada razgovora unutar odabranog AI preglednika
          uređena je pravilima privatnosti njegova pružatelja.
        </p>
      </section>

      <section>
        <p className="legal-section-number">06</p>
        <h2>Sigurnost i pružatelji usluga</h2>
        <p>
          Podacima pristupaju samo ovlaštene osobe salona i pružatelji nužni za rad
          stranice. To može uključivati Cloudflare za hosting, sigurnost i Turnstile
          provjeru, Google za autorizaciju i kalendarsku sinkronizaciju, OpenAI/ChatGPT
          za prijavu ovlaštenog tima te, kada to korisnik svjesno pokrene u kompatibilnom
          pregledniku, za korištenje WebMCP alata. To može uključivati i pružatelja
          transakcijske e-pošte ako se ta mogućnost aktivira.
        </p>
        <p>
          Stranica ne koristi kolačiće za ciljano oglašavanje. Tehničke tehnologije mogu
          se koristiti za sigurnosnu provjeru, prijavu tima i održavanje sesije. Kada
          obrada uključuje prijenos izvan Europskoga gospodarskog prostora, primjenjuju
          se dostupni ugovorni i zakonski zaštitni mehanizmi pružatelja.
        </p>
      </section>

      <section>
        <p className="legal-section-number">07</p>
        <h2>Čuvanje podataka</h2>
        <p>
          Podatke čuvamo samo dok su potrebni za vođenje rezervacije, komunikaciju,
          rješavanje prigovora, zaštitu pravnih zahtjeva i ispunjavanje zakonskih obveza.
          Nakon prestanka svrhe podaci se brišu ili anonimiziraju, osim kada je dulje
          čuvanje propisano zakonom.
        </p>
        <p>
          Podaci Google veze čuvaju se dok je kalendar povezan. Nakon odspajanja ili
          uklanjanja korisnika pristup se opoziva, uz moguće privremeno zadržavanje
          ograničenih podataka potrebnih za sigurno uklanjanje ranije stvorenih događaja.
        </p>
      </section>

      <section>
        <p className="legal-section-number">08</p>
        <h2>Vaša prava</h2>
        <p>
          Ovisno o primjenjivoj pravnoj osnovi možete zatražiti pristup, ispravak,
          brisanje, ograničenje obrade, prenosivost podataka ili uložiti prigovor.
          Zahtjev pošaljite na{" "}
          <a href="mailto:marinela.grancic@gmail.com">marinela.grancic@gmail.com</a>.
          Ako smatrate da su vam prava povrijeđena, možete podnijeti pritužbu Agenciji
          za zaštitu osobnih podataka (AZOP).
        </p>
      </section>

      <section>
        <p className="legal-section-number">09</p>
        <h2>Djeca i izmjene politike</h2>
        <p>
          Ako se rezervacija odnosi na maloljetnu osobu, podatke treba dostaviti roditelj
          ili skrbnik. Ovu politiku možemo ažurirati kada se promijene funkcije stranice
          ili pravne obveze. Na ovoj će stranici uvijek biti naveden datum zadnje izmjene.
        </p>
      </section>
    </LegalPageShell>
  );
}
