import {
  handleRequest,
  type CutoutReply,
  type CutoutRequest,
} from './backgroundRemovalJob';
import { compressOffscreen } from './compressOffscreen';
import type { CompressionRequest } from './drawPhoto';

/** A compression's one answer: the encoded photograph, or why there is none. */
export type CompressionAnswer = { blob: Blob } | { error: string };

// The DOM lib types `self` as a Window, whose postMessage needs a target origin a worker does not take.
const scope = self as unknown as {
  onmessage:
    ((event: MessageEvent<CompressionRequest | CutoutRequest>) => void) | null;
  postMessage: (answer: CompressionAnswer | CutoutReply) => void;
};

scope.onmessage = ({ data: job }) => {
  if (job.kind !== 'compress') {
    void handleRequest(job, (reply) => scope.postMessage(reply));
    return;
  }
  compressOffscreen(job).then(
    (blob) => scope.postMessage({ blob }),
    (error: unknown) => scope.postMessage({ error: String(error) }),
  );
};
