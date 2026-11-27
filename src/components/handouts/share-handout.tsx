"use client";
/**
 * Share a handout with a client: a link to the public page /r/<id> on this site, a QR code drawn in the browser
 * (qrcode package, no network), a copy button, and the device share sheet where available.
 * The link holds the handout id only; `path` was validated against the content library on the server
 * (src/lib/share.ts). Nothing is stored, logged or sent by this component.
 */
import * as React from "react";
import { Check, Copy, QrCode, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { absoluteShareUrl } from "./share-link";

export function ShareHandout({ path, title }: { path: string; title: string }) {
  const [ready, setReady] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [qrFailed, setQrFailed] = React.useState(false);
  const [canShare, setCanShare] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ids = { link: React.useId(), note: React.useId() };

  React.useEffect(() => {
    const u = absoluteShareUrl(path, window.location.origin);
    setUrl(u);
    setReady(true);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    if (!u) return;
    let cancelled = false;
    import("qrcode")
      .then((QR) => QR.toString(u, { type: "svg", errorCorrectionLevel: "M", margin: 2, width: 192 }))
      .then((svg) => {
        if (!cancelled) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (!cancelled) setQrFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      inputRef.current?.select();
      setStatus("Copy was blocked by the browser. The link is selected: press Ctrl+C or Command+C.");
    }
  }

  async function share() {
    if (!url || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title, url });
      setStatus("Share sheet opened.");
    } catch {
      // Dismissed or blocked: nothing to report.
    }
  }

  if (!ready) {
    return <p className="text-sm text-muted">Preparing the share link…</p>;
  }
  if (!url) {
    return <p className="text-sm text-muted">The share link could not be built on this page.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0 space-y-2">
          <label htmlFor={ids.link} className="text-sm font-semibold">
            Link to send
          </label>
          <input
            id={ids.link}
            ref={inputRef}
            type="text"
            readOnly
            value={url}
            aria-describedby={ids.note}
            onFocus={(e) => e.currentTarget.select()}
            className="block min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 font-mono text-sm text-text"
          />
          <p id={ids.note} className="text-xs text-muted">
            The link contains only the handout id. Nothing about the client, the session or you is in the link or the
            QR code, and nothing is sent when you copy or share it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" onClick={copy}>
              {status === "Link copied." ? <Check aria-hidden /> : <Copy aria-hidden />}
              Copy link
            </Button>
            {canShare ? (
              <Button type="button" variant="outline" onClick={share}>
                <Share2 aria-hidden />
                Share…
              </Button>
            ) : null}
          </div>
          <p role="status" className="min-h-5 text-xs text-muted">
            {status}
          </p>
        </div>
        <figure className="flex flex-col items-center gap-2 justify-self-center rounded-xl border border-border bg-white p-3 sm:justify-self-end">
          {qr ? (
            // A data: URL generated on this device (CSP img-src allows data:). Not a remote image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code that opens the link to “${title}”`} width={176} height={176} className="size-44" />
          ) : (
            <div aria-hidden className="flex size-44 items-center justify-center text-slate-500">
              <QrCode className="size-10" />
            </div>
          )}
          <figcaption className="text-center text-xs text-slate-700">
            {qrFailed ? "QR code unavailable; use the link." : "Scan to open the handout"}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
