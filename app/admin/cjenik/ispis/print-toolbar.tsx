"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" />
    </svg>
  );
}

type FitState = "checking" | "fits" | "overflow";

export default function PrintToolbar({ sheetId }: { sheetId: string }) {
  const [fitState, setFitState] = useState<FitState>("checking");

  const measure = useCallback(() => {
    const sheet = document.getElementById(sheetId);
    if (!sheet) {
      setFitState("overflow");
      return false;
    }

    const sheetBounds = sheet.getBoundingClientRect();
    const contentBounds = Array.from(sheet.children)
      .filter((child) => getComputedStyle(child as HTMLElement).display !== "none")
      .map((child) => (child as HTMLElement).getBoundingClientRect());
    const fits = sheet.scrollHeight <= sheet.clientHeight + 1 &&
      sheet.scrollWidth <= sheet.clientWidth + 1 &&
      contentBounds.every((bounds) =>
        bounds.bottom <= sheetBounds.bottom + 1 &&
        bounds.right <= sheetBounds.right + 1 &&
        bounds.left >= sheetBounds.left - 1,
      );
    sheet.dataset.printFit = fits ? "fits" : "overflow";
    setFitState(fits ? "fits" : "overflow");
    return fits;
  }, [sheetId]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      await document.fonts?.ready;
      if (active) measure();
    };
    void check();
    const observer = new ResizeObserver(() => measure());
    const sheet = document.getElementById(sheetId);
    if (sheet) observer.observe(sheet);
    window.addEventListener("beforeprint", measure);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("beforeprint", measure);
    };
  }, [measure, sheetId]);

  async function print() {
    setFitState("checking");
    await document.fonts?.ready;
    if (!measure()) return;
    requestAnimationFrame(() => window.print());
  }

  return (
    <div className="price-print-toolbar" role="region" aria-label="Alati za izvoz cjenika">
      <div>
        <span>A4 cjenik</span>
        <strong>Pregled prije ispisa</strong>
      </div>
      <p aria-live="polite">
        {fitState === "overflow"
          ? "Cjenik je predug za siguran jednolistni izvoz. Uklonite dodatnu stavku ili skratite tekst."
          : fitState === "checking"
            ? "Provjeravamo stane li cijeli cjenik na jedan A4 list…"
            : "Cijeli cjenik stane na jedan A4 list. Odaberite pisač ili „Spremi kao PDF”."}
      </p>
      <div className="price-print-toolbar-actions">
        <Link href="/admin/cjenik">← Natrag u dashboard</Link>
        <button type="button" disabled={fitState !== "fits"} onClick={print}>
          <PrintIcon />
          Ispiši / spremi PDF
        </button>
      </div>
    </div>
  );
}
