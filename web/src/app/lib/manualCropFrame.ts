import { GRID_ASPECT } from './cropFrame';
import type { Box, Size } from './cutoutImage';

/** A corner of the frame, the one a handle drags; the opposite corner stays put. */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** A movement in photo pixels. */
export type Shift = { x: number; y: number };

/** The share of the photo a frame first takes, so its handles start clear of the photo's edge. */
const START_SHARE = 0.9;

/** No side of a frame shorter than this share of the photo's shorter side: a handle never lands on its neighbour. */
const MIN_SIDE_SHARE = 0.05;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function minSide(size: Size): number {
  return Math.min(size.width, size.height) * MIN_SIDE_SHARE;
}

/** The largest frame of `aspect` that fits in `space`. */
function fitAspect(space: Size, aspect: number): Size {
  const width = Math.min(space.width, space.height * aspect);
  return { width, height: width / aspect };
}

/** The frame a manual crop starts with: centred, the grid's 4:3 where `locked`, the photo's own shape where not. */
export function initialFrame(size: Size, locked: boolean): Box {
  const space = {
    width: size.width * START_SHARE,
    height: size.height * START_SHARE,
  };
  const { width, height } = locked ? fitAspect(space, GRID_ASPECT) : space;
  return {
    x: (size.width - width) / 2,
    y: (size.height - height) / 2,
    width,
    height,
  };
}

/** `frame` shrunk about its centre to the grid's 4:3, as the lock is turned on. */
export function lockedFrame(frame: Box): Box {
  const { width, height } = fitAspect(frame, GRID_ASPECT);
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

/** `frame` moved by `by`, held inside the photo. */
export function movedFrame(frame: Box, by: Shift, size: Size): Box {
  return {
    ...frame,
    x: clamp(frame.x + by.x, 0, size.width - frame.width),
    y: clamp(frame.y + by.y, 0, size.height - frame.height),
  };
}

/** Which way a corner lies from the frame's opposite corner. */
type Direction = { right: boolean; down: boolean };

function directionOf(corner: Corner): Direction {
  return { right: corner.endsWith('right'), down: corner.startsWith('bottom') };
}

/** The corner a handle drags is the anchor's opposite; the anchor stays where it is. */
function anchorOf(frame: Box, direction: Direction): Shift {
  return {
    x: direction.right ? frame.x : frame.x + frame.width,
    y: direction.down ? frame.y : frame.y + frame.height,
  };
}

/** The room from the anchor to the photo's edge, in the corner's direction. */
function roomFrom(anchor: Shift, direction: Direction, size: Size): Size {
  return {
    width: direction.right ? size.width - anchor.x : anchor.x,
    height: direction.down ? size.height - anchor.y : anchor.y,
  };
}

/** The frame's sides once its corner is dragged by `by`: free, or held at 4:3 where `locked`. */
function draggedSides({
  frame,
  by,
  direction,
  room,
  locked,
  shortest,
}: {
  frame: Box;
  by: Shift;
  direction: Direction;
  room: Size;
  locked: boolean;
  shortest: number;
}): Size {
  const wanted = {
    width: frame.width + (direction.right ? by.x : -by.x),
    height: frame.height + (direction.down ? by.y : -by.y),
  };
  if (!locked) {
    return {
      width: clamp(wanted.width, Math.min(shortest, room.width), room.width),
      height: clamp(
        wanted.height,
        Math.min(shortest, room.height),
        room.height,
      ),
    };
  }
  // The side the drag stretched further leads; the other follows at 4:3.
  const leading = Math.max(wanted.width, wanted.height * GRID_ASPECT);
  const most = Math.min(room.width, room.height * GRID_ASPECT);
  const least = Math.min(shortest * Math.max(GRID_ASPECT, 1), most);
  const width = clamp(leading, least, most);
  return { width, height: width / GRID_ASPECT };
}

/** `frame` with `corner` dragged by `by`, the opposite corner fixed, inside the photo and never smaller than a handle's reach. */
export function resizedFrame(
  frame: Box,
  {
    corner,
    by,
    size,
    locked,
  }: { corner: Corner; by: Shift; size: Size; locked: boolean },
): Box {
  const direction = directionOf(corner);
  const anchor = anchorOf(frame, direction);
  const { width, height } = draggedSides({
    frame,
    by,
    direction,
    room: roomFrom(anchor, direction, size),
    locked,
    shortest: minSide(size),
  });
  return {
    x: direction.right ? anchor.x : anchor.x - width,
    y: direction.down ? anchor.y : anchor.y - height,
    width,
    height,
  };
}

/** `frame` as whole pixels of the stored photo, inside it and at least one pixel each way: what the crop cuts. */
export function pixelBox(frame: Box, size: Size): Box {
  const x = clamp(Math.round(frame.x), 0, size.width - 1);
  const y = clamp(Math.round(frame.y), 0, size.height - 1);
  return {
    x,
    y,
    width: clamp(Math.round(frame.width), 1, size.width - x),
    height: clamp(Math.round(frame.height), 1, size.height - y),
  };
}

/** Whether `frame` keeps the whole photo: there is nothing to crop. */
export function keepsWholePhoto(frame: Box, size: Size): boolean {
  const box = pixelBox(frame, size);
  return box.width === size.width && box.height === size.height;
}

/** The way each arrow key moves a frame or one of its corners. */
export const ARROW_SHIFTS: Readonly<Partial<Record<string, Shift>>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** One arrow press, in photo pixels: a hundredth of the photo's longer side, a tenth with Shift. */
export function keyStep(size: Size, coarse: boolean): number {
  return Math.max(size.width, size.height) * (coarse ? 0.1 : 0.01);
}
