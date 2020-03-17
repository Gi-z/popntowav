const MSADPCM = require("./msadpcm");
const Popnchart = require("./popnchart");
const Twodx = require("./twodx");

const child_process = require("child_process");
const fs = require("fs");
const path = require("path");
const SampleRate = require("node-libsamplerate");
const wav = require("wav");

if (process.argv.length < 3) {
    console.log("Usage: node popntowav ifs_file");
    process.exit();
}

let arg1 = process.argv[2];
let outputFilename = process.argv[3];

child_process.execSync(`ifstools ${arg1}`);
const ifsname = path.basename(arg1).slice(0, -4);
let twodxPath = `${ifsname}_ifs/${ifsname}.2dx`;
let chartPath = `${ifsname}_ifs/${ifsname}_op.bin`;

if (!fs.existsSync(chartPath)) {
    chartPath = `${ifsname}_ifs/${ifsname}_hp.bin`;
}

let cleanUp = true;

let soundContainer = new Twodx(twodxPath);
let chart = new Popnchart(chartPath, !soundContainer.late_bg);
//The sound container is full of MSADPCM keysounds, so each one needs decoded.
let decodedKeysounds = soundContainer.keysounds.map((keysound) => MSADPCM.decodeKeysoundOut(keysound.data, keysound.unk2));

if (cleanUp) fs.rmdirSync(path.basename(arg1).slice(0, -4)+"_ifs", {recursive: true});

let highestSample = 0;
//Outputting stereo 44.1Khz regardless.
const channels = 2;
const samplingRate = 44100;
//Because Int32.    
const bytes = 4;

//After loading in all the keysounds, we need to find ones that
//aren't 44.1KHz, since they'll mess everything up.
//Best resampling option I could find was node-libsamplerate.
//I'm sure other people have better suggestions.
for (var i = 0; i<decodedKeysounds.length; i++) {
    let keysound = decodedKeysounds[i];
    if (keysound.samplingRate != samplingRate) {
        let options = {
            type: 0,
            channels: 2,
            fromDepth: 16,
            toDepth: 16,
            fromRate: keysound.samplingRate,
            toRate: samplingRate
        }
        const resample = new SampleRate(options);
        
        resample.write(keysound.data);
        keysound.data = Buffer.from(resample.read());
    }
    decodedKeysounds[i] = keysound;
}

//Gotta find the proper endOfSong
//Trying to do this by getting the largest offset,
//and then adding its associated keysound length
//to get the true ending.
let buffSize = 0;
for (const event of chart.playEvents) {
    const [offset, keysoundNo] = event;
    let off = parseInt((offset*samplingRate)/1000)*channels*bytes;
    const keysound = decodedKeysounds[keysoundNo];
    if (keysound) {
        if ((off + (keysound.data.length)*2) > buffSize) {
            buffSize = off + (keysound.data.length*2);
        }
    }
}

//Creating a buffer to store Int32s.
//This is overcompensating to deal with overflow from digital summing.
//Final Timestamp in milliseconds * sampling rate * 2 channels * 4 bytes.
const finalBuffer = Buffer.alloc(buffSize);
for (const event of chart.playEvents) {
    const [offset, keysoundNo] = event;
    //Grabbing the relevant offset for the buffer.
    const convertedOffset = parseInt((offset*samplingRate)/1000)*channels*bytes;
    const keysound = decodedKeysounds[keysoundNo];

    if (keysound) {
        const keysoundData = keysound.data;
        for (var i = 0; i<keysoundData.length; i += 2) {
            const keysoundBytes = keysoundData.readInt16LE(i);
            const finalBytes = finalBuffer.readInt32LE(convertedOffset+(i*2));
            let mixedBytes = keysoundBytes+finalBytes;
    
            highestSample = Math.max(Math.abs(mixedBytes), highestSample);
            finalBuffer.writeInt32LE(mixedBytes, convertedOffset+(i*2));
        }
    }
}

//We've got summed 16bit values, which means they won't fit into a 16bit buffer.
//We also can't just shove them into a 32bit buffer, since they're 16bit scale.
//Instead, we'll have to normalise them first using the peak observed volume.
//2147483647 is just so I don't have to import a MAX_INT32 module.
//After normalising, these values will be scaled correctly from 16bit to 32bit.
const normaliseFactor = parseInt(2147483647/highestSample);
for (var i = 0; i<finalBuffer.length; i += 4) {
    const buffBytes = finalBuffer.readInt32LE(i) * normaliseFactor;
    finalBuffer.writeInt32LE(buffBytes, i);
}

//The 2dx container names usually contain null bytes too.
let filename = soundContainer.name;
filename = filename.slice(0, filename.indexOf("\u0000"));

//I could manually generate a wav header, but I don't because I'm lazy.
let writer = new wav.FileWriter("output\\"+outputFilename+".wav", {bitDepth: 32});
writer.write(finalBuffer);