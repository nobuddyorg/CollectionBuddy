import {
  handleRequest,
  type CutoutReply,
  type CutoutRequest,
} from './backgroundRemovalJob';
import { compressOffscreen } from './compressOffscreen';
import type { CompressionRequest } from './drawPhoto';
import {
  cropFrameOffscreen,
  type FrameCropAnswer,
  type FrameCropRequest,
} from './frameCropJob';
import {
  inspectOffscreen,
  rotateOffscreen,
  type InspectionAnswer,
  type InspectionRequest,
  type RotationAnswer,
  type RotationRequest,
} from './rotationJob';
import {
  measureOffscreen,
  type SharpnessAnswer,
  type SharpnessRequest,
} from './sharpnessJob';

/** A compression's one answer: the encoded photograph, or why there is none. */
export type CompressionAnswer = { blob: Blob } | { error: string };

// The DOM lib types `self` as a Window, whose postMessage needs a target origin a worker does not take.
const scope = self as unknown as {
  onmessage:
    | ((
        event: MessageEvent<
          | CompressionRequest
          | SharpnessRequest
          | CutoutRequest
          | RotationRequest
          | InspectionRequest
          | FrameCropRequest
        >,
      ) => void)
    | null;
  postMessage: (
    answer:
      | CompressionAnswer
      | SharpnessAnswer
      | CutoutReply
      | RotationAnswer
      | InspectionAnswer
      | FrameCropAnswer,
  ) => void;
};

const failed = (error: unknown) => scope.postMessage({ error: String(error) });

scope.onmessage = ({ data: job }) => {
  if (job.kind === 'rotate') {
    rotateOffscreen(job).then((rotated) => scope.postMessage(rotated), failed);
    return;
  }
  if (job.kind === 'crop-frame') {
    cropFrameOffscreen(job).then(
      (cropped) => scope.postMessage(cropped),
      failed,
    );
    return;
  }
  if (job.kind === 'inspect-rotation') {
    inspectOffscreen(job).then(
      (inspection) => scope.postMessage({ inspection }),
      failed,
    );
    return;
  }
  if (job.kind === 'sharpness') {
    measureOffscreen(job).then((score) => scope.postMessage({ score }), failed);
    return;
  }
  if (job.kind !== 'compress') {
    void handleRequest(job, (reply) => scope.postMessage(reply));
    return;
  }
  compressOffscreen(job).then((blob) => scope.postMessage({ blob }), failed);
};
