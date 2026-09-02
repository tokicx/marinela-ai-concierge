/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { drainBookingNotificationOutbox } from "../lib/booking-notifications";
import { consumeRateLimit } from "../lib/rate-limit";
import { CANONICAL_SITE_ORIGIN } from "../lib/site";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

const canonicalHost = new URL(CANONICAL_SITE_ORIGIN).hostname;
const apexHost = "marinelahairdesign.com";
const legacySiteHost = "marine-la-hair-design.polite-drake-5642.chatgpt.site";
const canonicalHosts = new Set([apexHost, canonicalHost]);
const servedHosts = new Set([
  ...canonicalHosts,
  legacySiteHost,
]);

function isLocalPreviewHost(hostname: string) {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "terminal.local";
}

function shouldDrainNotificationOutbox(pathname: string) {
  return pathname === "/api/bookings" ||
    pathname === "/api/availability" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");
}

async function drainNotificationOutboxWhenDue() {
  const due = await consumeRateLimit({
    scope: "notification_outbox_drain",
    identifier: "site",
    limit: 1,
    windowSeconds: 30,
    failureMode: "allow",
  });
  if (due) await drainBookingNotificationOutbox(3);
}

function applyResponseSecurity(response: Response, url: URL) {
  const headers = new Headers(response.headers);
  const sensitiveRoute =
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/prijava" ||
    url.pathname.startsWith("/signin-with-chatgpt") ||
    url.pathname.startsWith("/signout-with-chatgpt") ||
    url.pathname.startsWith("/callback");
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${sensitiveRoute ? "'none'" : "'self'"}`,
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "manifest-src 'self'",
  ].join("; ");

  headers.set("Content-Security-Policy", contentSecurityPolicy);
  headers.set("Referrer-Policy", sensitiveRoute ? "no-referrer" : "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("X-Frame-Options", sensitiveRoute ? "DENY" : "SAMEORIGIN");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  );
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (sensitiveRoute) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
  }
  if (sensitiveRoute || !canonicalHosts.has(url.hostname.toLowerCase())) {
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    const localPreview = isLocalPreviewHost(hostname);

    if (!localPreview && url.protocol === "https:" && url.port && url.port !== "443") {
      return applyResponseSecurity(
        new Response("Misdirected Request", { status: 421 }),
        url,
      );
    }

    if (!servedHosts.has(hostname) && !localPreview) {
      return applyResponseSecurity(
        new Response("Misdirected Request", { status: 421 }),
        url,
      );
    }

    if (
      (hostname === apexHost || hostname === legacySiteHost) &&
      url.pathname === "/api/admin/google/callback"
    ) {
      const restart = new URL("/admin/integracije", CANONICAL_SITE_ORIGIN);
      restart.searchParams.set("status", "error");
      restart.searchParams.set("reason", "restart");
      return applyResponseSecurity(
        new Response(null, {
          status: 303,
          headers: { Location: restart.toString() },
        }),
        url,
      );
    }

    if (
      (!localPreview && url.protocol !== "https:") ||
      hostname === apexHost ||
      hostname === legacySiteHost
    ) {
      const destination = new URL(url);
      destination.protocol = "https:";
      destination.port = "";
      if (hostname === apexHost || hostname === legacySiteHost) {
        destination.hostname = canonicalHost;
      }
      return applyResponseSecurity(
        new Response(null, { status: 308, headers: { Location: destination.toString() } }),
        url,
      );
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return applyResponseSecurity(response, url);
    }

    const response = await handler.fetch(request, env, ctx);
    if (shouldDrainNotificationOutbox(url.pathname)) {
      ctx.waitUntil(drainNotificationOutboxWhenDue().catch(() => undefined));
    }
    return applyResponseSecurity(response, url);
  },
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(drainBookingNotificationOutbox(5).catch(() => undefined));
  },
};

export default worker;
