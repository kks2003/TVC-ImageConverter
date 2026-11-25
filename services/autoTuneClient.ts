import { CompositionSettings, prepareTuneInput, searchBestSettings, TuneOutputMode, TuneResult, TuneStrategy } from './autoTuner';
import type { TuneWorkerRequest, TuneWorkerResponse } from './autoTune.worker';
// `inline` embeds the worker in the bundle, so it also works from the
// single-file offline HTML (file://), where a separate worker file can't load.
import TuneWorker from './autoTune.worker?worker&inline';

export const AUTO_TUNE_ABORTED = 'Auto-tune aborted';

let worker: Worker | null = null;
let workerUnavailable = false;
let nextId = 1;

const getWorker = (): Worker | null => {
  if (workerUnavailable) return null;
  if (!worker) {
    try {
      worker = new TuneWorker();
    } catch (err) {
      console.warn('Auto-tune worker unavailable, running on the main thread:', err);
      workerUnavailable = true;
      return null;
    }
  }
  return worker;
};

const discardWorker = () => {
  worker?.terminate();
  worker = null;
};

// Runs the search in a Web Worker when possible, otherwise on the main thread
// (same results either way). Rejects with Error(AUTO_TUNE_ABORTED) on abort.
export const runAutoTune = async (
  img: HTMLImageElement,
  outputMode: TuneOutputMode,
  currentSelectedColors: number[],
  onProgress: (progress: number) => void,
  signal: AbortSignal | undefined,
  tuningStrategy: TuneStrategy,
  composition?: CompositionSettings,
  disabledPatternPairs: string[] = []
): Promise<TuneResult> => {
  const input = prepareTuneInput(img, outputMode, currentSelectedColors, tuningStrategy, composition, disabledPatternPairs);
  if (!input) throw new Error('Canvas 2D context unavailable');
  if (signal?.aborted) throw new Error(AUTO_TUNE_ABORTED);

  const w = getWorker();
  if (!w) return searchBestSettings(input, { onProgress, signal, cooperative: true });

  const id = nextId++;
  try {
    return await new Promise<TuneResult>((resolve, reject) => {
      const cleanup = () => {
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const onMessage = (e: MessageEvent<TuneWorkerResponse>) => {
        const msg = e.data;
        if (msg.id !== id) return;
        if (msg.type === 'progress') { onProgress(msg.progress); return; }
        cleanup();
        if (msg.type === 'done') resolve(msg.result);
        else reject(new Error(msg.message));
      };
      const onError = (e: ErrorEvent) => {
        cleanup();
        e.preventDefault();
        reject(Object.assign(new Error(e.message || 'Auto-tune worker failed'), { workerFailure: true }));
      };
      const onAbort = () => {
        cleanup();
        // Terminating is the only way to stop a busy worker immediately.
        discardWorker();
        reject(new Error(AUTO_TUNE_ABORTED));
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      signal?.addEventListener('abort', onAbort);
      w.postMessage({ id, input } satisfies TuneWorkerRequest);
    });
  } catch (err) {
    if ((err as { workerFailure?: boolean }).workerFailure) {
      // e.g. the browser refused to start the worker: don't try again.
      console.warn('Auto-tune worker failed, falling back to the main thread:', err);
      discardWorker();
      workerUnavailable = true;
      return searchBestSettings(input, { onProgress, signal, cooperative: true });
    }
    throw err;
  }
};
