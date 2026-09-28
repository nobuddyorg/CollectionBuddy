import { useSyncExternalStore } from 'react';
import { loadCoinCutout } from './load';

export type PreloadState =
  | { status: 'idle' }
  | { status: 'downloading'; loaded: number; total: number }
  | { status: 'ready' }
  | { status: 'failed' };

const IDLE: PreloadState = { status: 'idle' };

// Module state, not a component's: the download outlives the menu that started it closing.
let state: PreloadState = IDLE;
const CHANGE_EVENT = 'collectionbuddy:coin-model';

function publish(next: PreloadState): void {
  state = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Downloads the model into this browser's cache ahead of the first cut-out; never started but by the person. */
export async function preloadModel(): Promise<void> {
  if (state.status === 'downloading' || state.status === 'ready') return;
  publish({ status: 'downloading', loaded: 0, total: 0 });
  try {
    const { preloadCoinModel } = await loadCoinCutout();
    await preloadCoinModel({
      onProgress: (progress) => {
        if (progress.stage === 'download') {
          const { loaded, total } = progress;
          publish({ status: 'downloading', loaded, total });
        }
      },
    });
    publish({ status: 'ready' });
  } catch (error: unknown) {
    console.error('Coin model download failed', error);
    publish({ status: 'failed' });
  }
}

export function usePreloadState(): PreloadState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
}
