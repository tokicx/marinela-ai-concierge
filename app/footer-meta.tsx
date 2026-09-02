import Link from "next/link";

export default function FooterMeta() {
  return (
    <div className="footer-meta">
      <p>© 2026 Marinela Hair Design. Sva prava pridržana.</p>
      <div className="footer-legal" aria-label="Pravne informacije">
        <Link href="/privatnost">Privatnost</Link>
        <Link href="/uvjeti-koristenja">Uvjeti korištenja</Link>
      </div>
    </div>
  );
}
