import type { Metadata } from "next";
import Link from "next/link";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prijava za tim",
  description: "Privatna prijava za ovlaštene članove tima Marinela Hair Design.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    nosnippet: true,
  },
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.3L6.5 14Z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.9.5 3.9 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-8.9 5.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M17.1 12.6c0-2.8 2.3-4.2 2.4-4.3a5.1 5.1 0 0 0-4-2.2c-1.7-.2-3.3 1-4.1 1-.9 0-2.2-1-3.6-1-1.9 0-3.6 1.1-4.6 2.8-2 3.4-.5 8.5 1.4 11.3 1 1.4 2.1 3 3.6 2.9 1.4-.1 2-1 3.7-1 1.7 0 2.2 1 3.7 1 1.5 0 2.5-1.4 3.5-2.8a12.3 12.3 0 0 0 1.6-3.3 4.9 4.9 0 0 1-3.6-4.4ZM14.4 4.3A4.9 4.9 0 0 0 15.5.8a5 5 0 0 0-3.3 1.7 4.7 4.7 0 0 0-1.2 3.4c1.2.1 2.5-.6 3.4-1.6Z"
      />
    </svg>
  );
}

export default async function TeamSignInPage() {
  const identity = await getChatGPTUser();
  const signInHref = chatGPTSignInPath("/admin");

  return (
    <main className="team-login-page">
      <Link className="team-login-brand" href="/" aria-label="Marinela Hair Design — početna">
        <img
          src="/brand/marinela-signature-on-dark.svg"
          alt="Marinela Hair Design"
          width="564"
          height="340"
        />
      </Link>

      <section className="team-login-card" aria-labelledby="team-login-title">
        <p className="team-login-eyebrow">Privatni pristup</p>
        <h1 id="team-login-title">Prijava za tim.</h1>
        {identity ? (
          <>
            <div className="team-login-identity">
              <span>{identity.email.slice(0, 1).toUpperCase()}</span>
              <div><small>Račun prepoznat</small><strong>{identity.email}</strong></div>
            </div>
            <p className="team-login-copy">Pristup upravljačkoj ploči ovisi o aktivnom računu koji je odobrila Marinela.</p>
            <Link className="team-login-primary" href="/admin">
              Otvori upravljačku ploču <span aria-hidden="true">↗</span>
            </Link>
            <a className="team-login-switch" href={chatGPTSignOutPath("/prijava")}>
              Prijavi se drugim računom
            </a>
          </>
        ) : (
          <>
            <p className="team-login-copy">
              Nastavite na sigurni zaslon za prijavu i odaberite Google ili Apple račun povezan s odobrenom e-mail adresom.
            </p>
            <div className="team-login-providers" aria-label="Dostupni načini prijave">
              <span><GoogleMark /> Google</span>
              <span><AppleMark /> Apple</span>
            </div>
            <a className="team-login-primary" href={signInHref}>
              Nastavi s Googleom ili Appleom <span aria-hidden="true">↗</span>
            </a>
            <small>
              Salon prima samo ime i e-mail potrebne za provjeru pristupa. Lozinka se ne sprema na ovoj stranici.
            </small>
          </>
        )}
      </section>

      <Link className="team-login-back" href="/">← Povratak na stranicu</Link>
    </main>
  );
}
