// Runs the Auto-Tune search off the main thread. Besides keeping the UI
// responsive, this avoids browser timer throttling: on the main thread the
// search had to pause regularly (setTimeout), and in a background or
// occluded tab Chrome/Edge/Firefox stretch each such pause to >= 1 second.
import { searchBestSettings, TuneInput } from './autoTuner';

export type TuneWorkerRequest = { id: number; input: TuneInput };
export type TuneWorkerResponse =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'done'; result: Awaited<ReturnType<typeof searchBestSettings>> }
  | { id: number; type: 'error'; message: string };

const post = (msg: TuneWorkerResponse) => (self as unknown as Worker).postMessage(msg);

self.onmessage = async (e: MessageEvent<TuneWorkerRequest>) => {
  const { id, input } = e.data;
  try {
    const result = await searchBestSettings(input, {
      onProgress: (progress) => post({ id, type: 'progress', progress }),
    });
    post({ id, type: 'done', result });
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
