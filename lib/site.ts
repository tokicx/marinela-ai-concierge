export const CANONICAL_SITE_ORIGIN = "https://www.marinelahairdesign.com";

export const SALON_NAME = "Marinela Hair Design";
export const SALON_PHONE = "+385955565738";
export const SALON_EMAIL = "marinela.grancic@gmail.com";
export const SALON_ADDRESS = {
  streetAddress: "Ulica kralja Zvonimira 14b",
  addressLocality: "Solin",
  postalCode: "21210",
  addressCountry: "HR",
} as const;

export function canonicalUrl(path = "/") {
  return new URL(path, CANONICAL_SITE_ORIGIN).toString();
}

export function publicAssetUrl(path: string) {
  return canonicalUrl(path);
}

export const SOCIAL_IMAGE_ALT =
  "Zlatni Marinela Hair Design logo s ilustracijom duge kose na crnoj podlozi";
