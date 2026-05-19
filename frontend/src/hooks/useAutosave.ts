/**
 * useAutosave — 30-second interval autosave hook with dirty-flag tracking.
 *
 * ## Behaviour
 *
 * - Fires `saveFn` every `intervalMs` (default 30 000) **only** when the form
 *   data has changed since the last successful save (`isDirty === true`).
 * - Exposes `markDirty` for the `onChange` handler to call, and `markClean`
 *   that `saveFn` calls on success.
 * - Clears the interval on unmount.
 * - Does **not** fire on mount — we don't want an immediate save of a freshly
 *   loaded empty record.
 *
 * ## Status
 *
 * Returns a `status` string:
 *   - `'idle'`    — nothing changed yet, or save succeeded and no new changes
 *   - `'dirty'`   — unsaved changes pending
 *   - `'saving'`  — save in flight
 *   - `'saved'`   — save just succeeded (displayed as "Saved at HH:MM")
 *   - `'error'`   — last save failed
 *
 * ## Concurrent edit (409)
 *
 * When `saveFn` throws an error with `error.status === 409`, the hook sets
 * `status` to `'conflict'` and stops the interval.  The page component is
 * responsible for rendering the conflict UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

export interface UseAutosaveOptions {
  /** Async function that performs the save. Must throw on failure. */
  saveFn: () => Promise<void>;
  /** Autosave interval in ms. Default: 30 000. */
  intervalMs?: number;
}

export interface UseAutosaveResult {
  status: AutosaveStatus;
  /** Time of last successful save, or null. */
  savedAt: Date | null;
  /** Call this in the form's `onChange` to mark the form as dirty. */
  markDirty: () => void;
  /** Call this manually (e.g. from the "Save Draft" button) to save immediately. */
  saveNow: () => Promise<void>;
}

export function useAutosave({
  saveFn,
  intervalMs = 30_000,
}: UseAutosaveOptions): UseAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Track dirtiness in a ref to avoid stale closures in the interval callback.
  const isDirty = useRef(false);
  const isSaving = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveFnRef = useRef(saveFn);

  // Keep saveFnRef current so the interval always calls the latest version.
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const doSave = useCallback(async () => {
    if (isSaving.current || !isDirty.current) return;
    isSaving.current = true;
    setStatus('saving');
    try {
      await saveFnRef.current();
      isDirty.current = false;
      isSaving.current = false;
      setSavedAt(new Date());
      setStatus('saved');
    } catch (err: unknown) {
      isSaving.current = false;
      const status = (err as { status?: number }).status;
      if (status === 409) {
        // Concurrent edit — stop autosaving, surface conflict to the user.
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setStatus('conflict');
      } else {
        setStatus('error');
      }
    }
  }, []);

  // Set up the interval.
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void doSave();
    }, intervalMs);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [doSave, intervalMs]);

  const markDirty = useCallback(() => {
    isDirty.current = true;
    setStatus('dirty');
  }, []);

  const saveNow = useCallback(async () => {
    await doSave();
  }, [doSave]);

  return { status, savedAt, markDirty, saveNow };
}
