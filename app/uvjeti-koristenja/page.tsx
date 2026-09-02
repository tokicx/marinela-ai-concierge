import type { Metadata } from "next";
import LegalPageShell from "../legal-page-shell";

export const metadata: Metadata = {
  title: "Uvjeti korištenja",
  description: "Uvjeti korištenja online rezervacija i sadržaja Marinela Hair Design stranice.",
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPageShell
      current="terms"
      lead="Ovi uvjeti uređuju korištenje stranice i online rezervacija. Obvezna prava potrošača ostaju nepromijenjena."
      title="Uvjeti korištenja"
    >
      <div className="legal-summary">
        <p>
          Online obrazac služi za dogovor termina. Rezervacija je potvrđena tek kada
          stranica, e-poruka ili Google Calendar pozivnica jasno navedu da je termin potvrđen.
        </p>
      </div>

      <section>
        <p className="legal-section-number">01</p>
        <h2>Pružatelj usluge</h2>
        <p>
          Stranicom i online rezervacijama upravlja Marinela Hair Design, vlasnica
          Marinela Grančić, Ulica kralja Zvonimira 14b, 21210 Solin. Kontakt:
          <a href="mailto:marinela.grancic@gmail.com"> marinela.grancic@gmail.com</a> i
          <a href="tel:+385955565738"> 095 556 5738</a>.
        </p>
      </section>

      <section>
        <p className="legal-section-number">02</p>
        <h2>Online rezervacija</h2>
        <p>
          Slanjem obrasca korisnik bira uslugu, zaposlenicu i termin. Rezervacija se
          potvrđuje automatski tek nakon provjere radnog vremena, postojećih rezervacija
          i povezanog Google kalendara. Korisnik je odgovoran za točnost kontaktnih
          podataka i pravodobno praćenje primljenih obavijesti.
        </p>
        <p>Stranica trenutačno ne naplaćuje naknadu za samo slanje online rezervacije.</p>
      </section>

      <section>
        <p className="legal-section-number">03</p>
        <h2>Izmjena i otkazivanje termina</h2>
        <p>
          Za izmjenu ili otkazivanje termina potrebno je što prije kontaktirati salon
          na <a href="tel:+385955565738">095 556 5738</a> ili{" "}
          <a href="mailto:marinela.grancic@gmail.com">marinela.grancic@gmail.com</a>.
          Eventualna posebna pravila otkazivanja salon mora priopćiti unaprijed i ona
          ne mogu ograničiti prava koja se prema zakonu ne mogu isključiti.
        </p>
      </section>

      <section>
        <p className="legal-section-number">04</p>
        <h2>Cijene i opseg usluge</h2>
        <p>
          Objavljeni cjenik je informativan. Konačna cijena može ovisiti o duljini i
          gustoći kose, trenutačnom stanju, utrošku materijala i željenom rezultatu.
          Kod stavki označenih kao „cijena na upit” ili „personalizirana cijena” cijena
          se potvrđuje prije početka usluge.
        </p>
        <p>
          Ako se stvarna usluga ili cijena razlikuju od podataka prikazanih pri
          rezervaciji, salon će korisnika o tome obavijestiti prije izvođenja usluge.
        </p>
      </section>

      <section>
        <p className="legal-section-number">05</p>
        <h2>Odgovorno korištenje</h2>
        <p>
          Nisu dopušteni lažni termini, automatizirano ili prekomjerno slanje zahtjeva,
          pokušaji zaobilaženja sigurnosnih provjera, neovlašteni pristup administraciji
          ni korištenje stranice na način koji može ometati druge korisnike ili salon.
        </p>
      </section>

      <section>
        <p className="legal-section-number">06</p>
        <h2>Dostupnost i vanjske usluge</h2>
        <p>
          Stranica može privremeno biti nedostupna zbog održavanja, sigurnosnog problema
          ili prekida rada vanjskog pružatelja. Google, Cloudflare, OpenAI i eventualni
          pružatelj transakcijske e-pošte primjenjuju vlastite uvjete na svoje usluge.
          Ovim uvjetima ne isključuje se odgovornost koju prema zakonu nije moguće isključiti.
        </p>
      </section>

      <section>
        <p className="legal-section-number">07</p>
        <h2>Intelektualno vlasništvo</h2>
        <p>
          Naziv, logotip, fotografije, tekstovi i dizajn stranice ne smiju se komercijalno
          preuzimati, umnožavati ili ponovno objavljivati bez dopuštenja nositelja prava,
          osim kada je takvo korištenje dopušteno zakonom.
        </p>
      </section>

      <section>
        <p className="legal-section-number">08</p>
        <h2>Prigovori i primjenjivo pravo</h2>
        <p>
          Pisani prigovor može se poslati e-poštom ili na adresu salona. Salon će potvrditi
          primitak i odgovoriti u primjenjivom zakonskom roku. Primjenjuje se pravo
          Republike Hrvatske, bez ograničavanja obveznih prava potrošača.
        </p>
      </section>
    </LegalPageShell>
  );
}
