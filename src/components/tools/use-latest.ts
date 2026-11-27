"use client";
import * as React from "react";

/**
 * State plus a ref that always holds the latest value. Scrubbed fields commit through `update`, and exports read
 * `ref.current` right after flushing every field, so the last half-second of typing is never left out.
 */
export function useLatest<T>(initial: T | (() => T)) {
  const [value, setValue] = React.useState(initial);
  const ref = React.useRef(value);
  const update = React.useCallback((next: T | ((prev: T) => T)) => {
    ref.current = typeof next === "function" ? (next as (prev: T) => T)(ref.current) : next;
    setValue(ref.current);
  }, []);
  return [value, update, ref] as const;
}

/** Fields register their "scrub and commit now" function; exports call flushAll() first. */
export function useFlushRegistry() {
  const fns = React.useRef(new Set<() => void>());
  const register = React.useCallback((fn: () => void) => {
    fns.current.add(fn);
    return () => {
      fns.current.delete(fn);
    };
  }, []);
  const flushAll = React.useCallback(() => fns.current.forEach((fn) => fn()), []);
  return { register, flushAll };
}

export type RegisterFlush = ReturnType<typeof useFlushRegistry>["register"];
