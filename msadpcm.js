const ADAPTATION_TABLE = [
  230, 230, 230, 230, 307, 409, 512, 614,
  768, 614, 512, 409, 307, 230, 230, 230,
];

function clamp(val, min, max) {
  if(val < min) return min;
  else if(val > max) return max;
  else return val;
}

function expandNibble(nibble, state, channel) {
  const signed = 8 <= nibble ? nibble - 16 : nibble;

  let predictor = ((
    state.sample1[channel] * state.coeff1[channel] +
    state.sample2[channel] * state.coeff2[channel]
  ) >> 8) + (signed * state.delta[channel]);

  predictor = clamp(predictor, -0x8000, 0x7fff);

  state.sample2[channel] = state.sample1[channel];
  state.sample1[channel] = predictor;

  state.delta[channel] = Math.floor(ADAPTATION_TABLE[nibble] * state.delta[channel] / 256);
  if(state.delta[channel] < 16) state.delta[channel] = 16;

  return predictor;
}

/**
 * Decode a block of MS-ADPCM data
 * @param  {Buffer}    buf           one block of MS-ADPCM data
 * @param  {number}    channels      number of channels (usually 1 or 2, never tested on upper values)
 * @param  {number[]}  coefficient1  array of 7 UInt8 coefficient values
 *                                   usually, [ 256, 512, 0, 192, 240, 460, 392 ]
 * @param  {number[]}  coefficient2  array of 7 UInt8 coefficient values
 *                                   usually, [ 0, -256, 0, 64, 0, -208, -232 ]
 * @return {Buffer[]}                array of decoded PCM buffer for each channels
 */
function decode(buf, channels, coefficient1, coefficient2) {
  const state = {
    coefficient: [ coefficient1, coefficient2 ],
    coeff1: [],
    coeff2: [],
    delta: [],
    sample1: [],
    sample2: [],
  };

  let offset = 0;

  // Read MS-ADPCM header
  for(let i = 0 ; i < channels ; i++) {
    const predictor = clamp(buf.readUInt8(offset), 0, 6);
    offset += 1;

    state.coeff1[i] = state.coefficient[0][predictor];
    state.coeff2[i] = state.coefficient[1][predictor];
  }

  for(let i = 0 ; i < channels ; i++) { state.delta.push(buf.readInt16LE(offset)); offset += 2; }
  for(let i = 0 ; i < channels ; i++) { state.sample1.push(buf.readInt16LE(offset)); offset += 2; }
  for(let i = 0 ; i < channels ; i++) { state.sample2.push(buf.readInt16LE(offset)); offset += 2; }

  // Decode
  const output = [];

  for(let i = 0 ; i < channels ; i++)
    output[i] = [ state.sample2[i], state.sample1[i] ];

  let channel = 0;
  while(offset < buf.length) {
    const byte = buf.readUInt8(offset);
    offset += 1;

    output[channel].push(expandNibble(byte >> 4, state, channel));
    channel = (channel + 1) % channels;

    output[channel].push(expandNibble(byte & 0xf, state, channel));
    channel = (channel + 1) % channels;
  }

  //Converting all sound to stereo since it'll be easier later on.
  if (channels == 1) {
    output.push(output[0]);
  }

  return output;
}

function readWav(buf) {

  let offset = 0;

  // 'RIFF'
  const magic = buf.readUInt32BE(offset); offset += 4;
  if(magic !== 0x52494646) {
    console.log(magic);
    throw "0x0000:0x0004 != 52:49:46:46";
  }

  const dataSize = buf.readUInt32LE(offset); offset += 4;

  // 'WAVE'
  const format = buf.readUInt32BE(offset); offset += 4;
  if(format !== 0x57415645) throw "0x0008:0x000B != 57:41:56:45";

  let wavFormat, wavData;

  while(offset < buf.length) {
    const name = buf.readUInt32BE(offset); offset += 4;
    const blockSize = buf.readUInt32LE(offset); offset += 4;

    // 'fmt '
    if(name === 0x666D7420) {
      wavFormat = {
        format:        buf.readUInt16LE(offset +  0),
        channels:      buf.readUInt16LE(offset +  2),
        sampleRate:    buf.readUInt32LE(offset +  4),
        byteRate:      buf.readUInt32LE(offset +  8),
        blockAlign:    buf.readUInt16LE(offset + 12),
        bitsPerSample: buf.readUInt16LE(offset + 14),
      };

      offset += 16;

      if(wavFormat.format === 0x01) {
        // console.log(`${filename} is PCM file`);
        continue;
      }
      else if(wavFormat.format === 0x02) {
        // console.log(`${filename} is MS-ADPCM file`);

        const extraSize = buf.readUInt16LE(offset); offset += 2;
        wavFormat.extraSize = extraSize;
        wavFormat.extra = {
          samplesPerBlock:  buf.readUInt16LE(offset + 0),
          coefficientCount: buf.readUInt16LE(offset + 2),
          coefficient: [ [], [] ],
        };

        offset += 4;

        for(let i = 0 ; i < wavFormat.extra.coefficientCount ; i++) {
          wavFormat.extra.coefficient[0].push(buf.readInt16LE(offset + 0));
          wavFormat.extra.coefficient[1].push(buf.readInt16LE(offset + 2));
          offset += 4;
        }
      }
      else throw `WAVE format ${wavFormat.format} is unknown`;
    }
    // 'data'
    else if(name === 0x64617461) {
      wavData = buf.slice(offset, offset + blockSize);
      offset += blockSize;
    }
    else {
      offset += blockSize;
    }
  }

  if(wavFormat && wavData) return { format: wavFormat, data: wavData };
  else throw "'fmt ' or/and 'data' block not found";
}

exports.decodeKeysoundOut = (buff, vol) => {
  const adpcmData = readWav(buff);
  const blockSize = adpcmData.format.blockAlign;

  let totalBuff = Buffer.alloc(1);
  const totalBlocks = adpcmData.data.length / blockSize;
  let totalOffset = 0;

  for(let i = 0 ; i < adpcmData.data.length ; i += blockSize) {
    const adpcmBlock = adpcmData.data.slice(i, i + blockSize);
    const decoded = decode(
      adpcmBlock,
      adpcmData.format.channels,
      adpcmData.format.extra.coefficient[0],
      adpcmData.format.extra.coefficient[1]
    );

    const pcmBlockSize = decoded[0].length * 2;
    if (totalBuff.length == 1) {
      totalBuff = Buffer.alloc(pcmBlockSize * totalBlocks * 2);
    }

    for(let s = 0 ; s < pcmBlockSize/2; s++) {
      for(let c = 0 ; c < decoded.length ; c++) {
        totalBuff.writeInt16LE(decoded[c][s], totalOffset);
        totalOffset += 2;
      }
    }
  }

  return {data: totalBuff, channels: adpcmData.format.channels, samplingRate: adpcmData.format.sampleRate, volume: vol};
}