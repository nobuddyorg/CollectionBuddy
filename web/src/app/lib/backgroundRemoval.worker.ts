import {
  handleRequest,
  type CutoutReply,
  type CutoutRequest,
} from './backgroundRemovalJob';

// The DOM lib types `self` as a Window, whose postMessage needs a target origin a worker does not take.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CutoutRequest>) => void) | null;
  postMessage: (reply: CutoutReply) => void;
};

scope.onmessage = (event) => {
  void handleRequest(event.data, (reply) => scope.postMessage(reply));
};
