// Minimal MP4/M4A box parser — reads just enough of the ISO-BMFF container to
// find moov > mvhd and compute duration = mvhd.duration / mvhd.timescale.
// No external deps (none are available in the Workers runtime).

function getM4ADurationSeconds(buffer) {
  const view = new DataView(buffer);
  const total = buffer.byteLength;

  const mvhd = findBox(view, 0, total, 'moov', true);
  if (!mvhd) return null;

  const box = findBox(view, mvhd.start, mvhd.end, 'mvhd', false);
  if (!box) return null;

  let offset = box.start;
  const version = view.getUint8(offset);
  offset += 4; // version (1) + flags (3)

  let timescale;
  let duration;
  if (version === 1) {
    offset += 8 + 8; // creation_time, modification_time (64-bit each)
    timescale = view.getUint32(offset);
    offset += 4;
    const hi = view.getUint32(offset);
    const lo = view.getUint32(offset + 4);
    duration = hi * 2 ** 32 + lo;
  } else {
    offset += 4 + 4; // creation_time, modification_time (32-bit each)
    timescale = view.getUint32(offset);
    offset += 4;
    duration = view.getUint32(offset);
  }

  if (!timescale) return null;
  return Math.round(duration / timescale);
}

// Walks sibling boxes in [start, end). If descend is true and a box of type
// `type` is found, returns {start, end} of its *contents* (for recursing into
// container boxes like moov); otherwise returns {start, end} of the box's
// payload for reading fields directly (e.g. mvhd).
function findBox(view, start, end, type, descend) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const boxType = readType(view, offset + 4);
    let headerSize = 8;

    if (size === 1) {
      // 64-bit extended size
      const hi = view.getUint32(offset + 8);
      const lo = view.getUint32(offset + 12);
      size = hi * 2 ** 32 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset; // extends to end of buffer
    }

    if (size < headerSize || offset + size > end) break;

    if (boxType === type) {
      return { start: offset + headerSize, end: offset + size };
    }

    offset += size;
  }
  return null;
}

function readType(view, offset) {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

export { getM4ADurationSeconds };
