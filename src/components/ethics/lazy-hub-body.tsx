"use client";
import * as React from "react";
import type { HubBodyPart } from "./hub-bodies";

const HubBody = React.lazy(() => import("./hub-bodies"));

/**
 * Body of a hub card disclosure, rendered only once its <details> is first opened (then kept). The card header,
 * summary and #id anchor are server-rendered, so links into the hub work before anything here loads.
 */
export function LazyHubBody({ part, id }: { part: HubBodyPart; id: string }) {
  const marker = React.useRef<HTMLSpanElement>(null);
  const [opened, setOpened] = React.useState(false);

  React.useEffect(() => {
    const details = marker.current?.closest("details");
    if (!details) return;
    const onToggle = () => {
      if (details.open) setOpened(true);
    };
    onToggle();
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, []);

  return (
    <>
      <span ref={marker} hidden />
      {opened ? (
        <React.Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <HubBody part={part} id={id} />
        </React.Suspense>
      ) : null}
    </>
  );
}
