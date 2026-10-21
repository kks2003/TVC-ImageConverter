const MAX_OFFSET = 2176;
const MAX_LEN = 65536;

class CompressorState {
  output_data: number[] = [];
  output_index: number = 0;
  bit_index: number = 0;
  bit_mask: number = 0;

  write_byte(value: number) {
    this.output_data[this.output_index++] = value;
  }

  write_bit(value: number) {
    if (this.bit_mask === 0) {
      this.bit_mask = 128;
      this.bit_index = this.output_index;
      this.write_byte(0);
    }
    if (value > 0) {
      this.output_data[this.bit_index] |= this.bit_mask;
    }
    this.bit_mask >>= 1;
  }

  write_elias_gamma(value: number) {
    let i: number;
    for (i = 2; i <= value; i <<= 1) {
      this.write_bit(0);
    }
    while ((i >>= 1) > 0) {
      this.write_bit(value & i);
    }
  }
}

function elias_gamma_bits(value: number): number {
  let bits = 1;
  while (value > 1) {
    bits += 2;
    value >>= 1;
  }
  return bits;
}

function count_bits(offset: number, len: number): number {
  return 1 + (offset > 128 ? 12 : 8) + elias_gamma_bits(len - 1);
}

function optimize(input_data: Uint8Array, input_size: number) {
  const min = new Uint32Array(MAX_OFFSET + 1);
  const max = new Uint32Array(MAX_OFFSET + 1);
  const matches_head = new Int32Array(256 * 256).fill(-1);
  const match_slots_next = new Int32Array(input_size).fill(-1);
  
  const optimal_bits = new Uint32Array(input_size);
  const optimal_offset = new Int32Array(input_size);
  const optimal_len = new Int32Array(input_size);

  optimal_bits[0] = 8;

  for (let i = 1; i < input_size; i++) {
    optimal_bits[i] = optimal_bits[i - 1] + 9;
    const match_index = (input_data[i - 1] << 8) | input_data[i];
    let best_len = 1;

    let prev_slot = -1;
    let curr_slot = matches_head[match_index];

    while (curr_slot !== -1 && best_len < MAX_LEN) {
      const offset = i - curr_slot;
      if (offset > MAX_OFFSET) {
        if (prev_slot === -1) {
          matches_head[match_index] = -1;
        } else {
          match_slots_next[prev_slot] = -1;
        }
        break;
      }
      
      let len: number;
      for (len = 2; len <= MAX_LEN; len++) {
        if (len > best_len) {
          best_len = len;
          const bits = optimal_bits[i - len] + count_bits(offset, len);
          if (optimal_bits[i] > bits) {
            optimal_bits[i] = bits;
            optimal_offset[i] = offset;
            optimal_len[i] = len;
          }
        } else if (i + 1 === max[offset] + len && max[offset] !== 0) {
          len = i - min[offset];
          if (len > best_len) {
            len = best_len;
          }
        }
        if (i < offset + len || input_data[i - len] !== input_data[i - len - offset]) {
          break;
        }
      }
      min[offset] = i + 1 - len;
      max[offset] = i;

      prev_slot = curr_slot;
      curr_slot = match_slots_next[curr_slot];
    }
    
    match_slots_next[i] = matches_head[match_index];
    matches_head[match_index] = i;
  }

  return { optimal_bits, optimal_offset, optimal_len };
}

function compress_data(
  optimal_bits: Uint32Array, 
  optimal_offset: Int32Array, 
  optimal_len: Int32Array, 
  input_data: Uint8Array, 
  input_size: number
): Uint8Array {
  let input_index = input_size - 1;
  
  optimal_bits[input_index] = 0;
  while (input_index > 0) {
    const input_prev = input_index - (optimal_len[input_index] > 0 ? optimal_len[input_index] : 1);
    optimal_bits[input_prev] = input_index;
    input_index = input_prev;
  }

  const state = new CompressorState();
  state.write_byte(input_data[0]);

  while ((input_index = optimal_bits[input_index]) > 0) {
    if (optimal_len[input_index] === 0) {
      state.write_bit(0);
      state.write_byte(input_data[input_index]);
    } else {
      state.write_bit(1);
      state.write_elias_gamma(optimal_len[input_index] - 1);
      let offset1 = optimal_offset[input_index] - 1;
      if (offset1 < 128) {
        state.write_byte(offset1);
      } else {
        offset1 -= 128;
        state.write_byte((offset1 & 127) | 128);
        for (let mask = 1024; mask > 127; mask >>= 1) {
          state.write_bit(offset1 & mask);
        }
      }
    }
  }

  state.write_bit(1);
  for (let i = 0; i < 16; i++) {
    state.write_bit(0);
  }
  state.write_bit(1);

  return new Uint8Array(state.output_data);
}

/**
 * Decompresses data produced by compressZX7 above (standard ZX7 format).
 * Mirrors CompressorState's bit-writing order exactly:
 * - First byte is always a literal, stored uncompressed.
 * - Each following element starts with a control bit: 0 = literal byte,
 *   1 = back-reference match (Elias-gamma length, then a split-byte offset:
 *   a full byte if offset-1 < 128, otherwise a high-bit-set byte plus 4 more
 *   explicit bits for the upper offset bits).
 * - End of stream is marked by an Elias-gamma length whose zero-prefix
 *   reaches 16 - which never happens for a real length (max length 65536
 *   only needs a 15-bit prefix), so it's an unambiguous terminator.
 */
export function decompressZX7(input: Uint8Array): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);

  let bytePos = 0;
  let bitMask = 0;
  let currentByte = 0;

  const readByte = (): number => input[bytePos++];
  const readBit = (): number => {
    if (bitMask === 0) {
      bitMask = 128;
      currentByte = input[bytePos++];
    }
    const bit = (currentByte & bitMask) ? 1 : 0;
    bitMask >>= 1;
    return bit;
  };

  const output: number[] = [];
  output.push(readByte());

  // Safety cap: never loop forever on malformed/truncated input.
  const maxIterations = Math.max(1 << 20, input.length * 64);
  let iterations = 0;

  while (bytePos <= input.length && iterations++ < maxIterations) {
    if (readBit() === 0) {
      output.push(readByte());
      continue;
    }

    let bits = 0;
    while (readBit() === 0) bits++;
    if (bits === 16) break; // end-of-stream marker

    let len = 1;
    for (let i = 0; i < bits; i++) len = (len << 1) | readBit();
    len += 1;

    const offsetByte = readByte();
    let offset: number;
    if ((offsetByte & 128) === 0) {
      offset = offsetByte + 1;
    } else {
      let high = 0;
      for (let mask = 1024; mask > 127; mask >>= 1) {
        high = (high << 1) | readBit();
      }
      offset = ((high << 7) | (offsetByte & 127)) + 128 + 1;
    }

    for (let i = 0; i < len; i++) {
      output.push(output[output.length - offset]);
    }
  }

  return new Uint8Array(output);
}

/**
 * Compresses data using the standard ZX7 algorithm (Forward compressor variant).
 */
export function compressZX7(input: Uint8Array): Uint8Array {
  const input_size = input.length;
  if (input_size === 0) return new Uint8Array(0);

  const { optimal_bits, optimal_offset, optimal_len } = optimize(input, input_size);
  const output_data = compress_data(optimal_bits, optimal_offset, optimal_len, input, input_size);

  return output_data;
}
