/**
 * Minimal protobuf wire-format reader: just enough to pull a few fields out of the
 * config blobs and media manifest in modern Anki packages. Written from the public
 * protobuf encoding spec (https://protobuf.dev/programming-guides/encoding/).
 */

export type PbValue = number | Uint8Array;

/** Decodes one message level into field number → values (repeated fields keep order). */
export function decode(bytes: Uint8Array): Map<number, PbValue[]> {
  const out = new Map<number, PbValue[]>();
  let pos = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (pos >= bytes.length) throw new Error('Truncated protobuf varint');
      const b = bytes[pos++];
      // Multiply instead of shifting: JS bit ops are 32-bit, and ids can be larger.
      result += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return result;
      shift += 7;
    }
  };
  while (pos < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key % 8;
    let value: PbValue;
    if (wire === 0) value = varint();
    else if (wire === 1) {
      value = bytes.subarray(pos, pos + 8);
      pos += 8;
    } else if (wire === 2) {
      const len = varint();
      value = bytes.subarray(pos, pos + len);
      pos += len;
    } else if (wire === 5) {
      value = bytes.subarray(pos, pos + 4);
      pos += 4;
    } else throw new Error(`Unsupported protobuf wire type ${wire}`);
    out.set(field, [...(out.get(field) ?? []), value]);
  }
  return out;
}

const utf8 = new TextDecoder();

export function pbString(msg: Map<number, PbValue[]>, field: number): string {
  const v = msg.get(field)?.[0];
  return v instanceof Uint8Array ? utf8.decode(v) : '';
}

export function pbNumber(msg: Map<number, PbValue[]>, field: number): number {
  const v = msg.get(field)?.[0];
  return typeof v === 'number' ? v : 0;
}

export function pbMessages(msg: Map<number, PbValue[]>, field: number): Map<number, PbValue[]>[] {
  return (msg.get(field) ?? [])
    .filter((v) => v instanceof Uint8Array)
    .map((v) => decode(v as Uint8Array));
}
