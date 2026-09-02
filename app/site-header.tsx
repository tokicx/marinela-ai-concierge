"use client";

import Link from "next/link";
import { useRef } from "react";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M14 7l5 5-5 5" />
    </svg>
  );
}

export default function SiteHeader({
  bookingActive = false,
  priceListActive = false,
}: {
  bookingActive?: boolean;
  priceListActive?: boolean;
}) {
  const mobileMenu = useRef<HTMLDetailsElement>(null);

  return (
    <header className="lux-header">
      <a className="skip-link" href="#main-content">Preskoči na sadržaj</a>
      <Link className="lux-wordmark" href="/" aria-label="Marinela Hair Design — početna">
        <img
          src="/brand/marinela-signature-on-dark.svg"
          alt="Marinela Hair Design"
          width="564"
          height="340"
        />
      </Link>
      <nav className="lux-nav" aria-label="Glavna navigacija">
        <Link href="/#top">Početna</Link>
        <Link href="/#o-nama">O nama</Link>
        <Link href="/#usluge">Usluge</Link>
        <Link
          className={priceListActive ? "active" : undefined}
          href="/cjenik"
          aria-current={priceListActive ? "page" : undefined}
        >
          Cjenik
        </Link>
        <Link href="/#rezultati">Rezultati</Link>
        <Link
          className={bookingActive ? "active" : undefined}
          href="/rezervacija"
          aria-current={bookingActive ? "page" : undefined}
        >
          Rezervacije
        </Link>
        <Link href="/#kontakt">Kontakt</Link>
      </nav>
      <Link className="nav-booking" href="/rezervacija" aria-current={bookingActive ? "page" : undefined}>
        Rezerviraj
        <ArrowIcon />
      </Link>
      <details className="lux-mobile-menu" ref={mobileMenu}>
        <summary aria-label="Otvori ili zatvori izbornik"><span /><span /></summary>
        <nav onClick={() => mobileMenu.current?.removeAttribute("open")}>
          <Link href="/">Početna</Link>
          <Link href="/#o-nama">O nama</Link>
          <Link href="/#usluge">Usluge</Link>
          <Link href="/cjenik" aria-current={priceListActive ? "page" : undefined}>Cjenik</Link>
          <Link href="/#rezultati">Rezultati</Link>
          <Link href="/rezervacija" aria-current={bookingActive ? "page" : undefined}>Rezervacije</Link>
          <Link href="/#kontakt">Kontakt</Link>
        </nav>
      </details>
    </header>
  );
}
