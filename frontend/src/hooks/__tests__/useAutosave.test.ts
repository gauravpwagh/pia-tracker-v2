/**
 * Phase 1.9 gate test for useAutosave (Vitest + fake timers).
 *
 * Verifies:
 * - Does not fire save on mount or when clean.
 * - Fires save 30 s after markDirty().
 * - Resets to 'saved' status after a successful save.
 * - Sets 'error' status on a non-409 failure.
 * - Sets 'conflict' status and stops the interval on 409.
 * - saveNow() triggers an immediate save.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from '../useAutosave';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts as idle and does not call saveFn without markDirty', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ saveFn }));

    expect(result.current.status).toBe('idle');

    // Advance 60 seconds — still no dirty data, saveFn must not be called.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(saveFn).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('fires saveFn after 30 s when dirty and transitions to saved', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ saveFn }));

    act(() => {
      result.current.markDirty();
    });
    expect(result.current.status).toBe('dirty');

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(saveFn).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('saved');
    expect(result.current.savedAt).toBeInstanceOf(Date);
  });

  it('does not fire again within the 30 s window after a successful save', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ saveFn }));

    act(() => { result.current.markDirty(); });

    // First interval — saves successfully.
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Advance another 30 s without marking dirty again — must NOT save.
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it('sets error status on a non-409 failure', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAutosave({ saveFn }));

    act(() => { result.current.markDirty(); });
    await act(async () => { vi.advanceTimersByTime(30_000); });

    expect(result.current.status).toBe('error');
  });

  it('sets conflict status and stops the interval on 409', async () => {
    const err = Object.assign(new Error('Conflict'), { status: 409 });
    const saveFn = vi.fn().mockRejectedValue(err);
    const { result } = renderHook(() => useAutosave({ saveFn }));

    act(() => { result.current.markDirty(); });
    await act(async () => { vi.advanceTimersByTime(30_000); });

    expect(result.current.status).toBe('conflict');

    // Advance another 30 s — interval must have been cleared; saveFn stays at 1.
    act(() => { result.current.markDirty(); }); // re-mark dirty to re-enable
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(saveFn).toHaveBeenCalledTimes(1);  // not called again after conflict
  });

  it('saveNow triggers an immediate save even before the 30 s window', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave({ saveFn }));

    act(() => { result.current.markDirty(); });

    // Only 5 seconds elapsed — interval hasn't fired yet.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await result.current.saveNow();
    });

    expect(saveFn).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('saved');
  });

  it('does not call saveFn again while a save is in flight', async () => {
    // saveFn resolves after 1 s
    let resolve!: () => void;
    const saveFn = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    const { result } = renderHook(() => useAutosave({ saveFn }));

    act(() => { result.current.markDirty(); });

    // First 30 s — save starts.
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saving');

    // Another 30 s tick while first save is still in flight.
    act(() => { result.current.markDirty(); });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(saveFn).toHaveBeenCalledTimes(1); // still only 1 in-flight

    // Resolve the first save.
    await act(async () => { resolve(); });
    expect(result.current.status).toBe('saved');
  });
});
