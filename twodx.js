const fs = require("fs");

//This is adapted from https://github.com/mon/SDVX-Song-Extractor/blob/master/bm2dx.py.
//I'm personally not very good at data exploration.

class Sample {
    constructor(data, offset, key_no) {
        const header = data.toString("ascii", offset, offset+4);
        offset += 4;
        const header_lead = data.readUInt32LE(offset);
        offset += 4;
        if (header !== "2DX9" || header_lead != 24) {
            throw "Invalid 2DX header.";
        }

        const size = data.readUInt32LE(offset);
        offset += 6;

        //Previously the keysound number was stored here.
        //In popn files this doesn't appear to be the case.
        //So we assume keysounds are sequential in these files.
        this.key_no = key_no;

        //These two bytes are set to 0000 on keysounds which are
        //used as background tracks. This keysound needs to be
        //identified as it should be at the start of the container.
        this.is_bg = data.toString("hex", offset, offset+2) == "0000";
        offset += 2;

        //These values were for attenuation and loop point in SDVX 2dxs.
        //I have no clue how to make use of these.
        this.unk1 = data.readUInt16LE(offset);
        offset += 2;
        this.unk2 = data.readUInt16LE(offset);
        offset += 6;


        this.data = data.slice(offset, offset+size);
    }
}

class Twodx {

    constructor(path) {
        this.path = path;
        this.data = fs.readFileSync(path);

        this.offset = 0;

        this.name = this.data.toString("ascii", 0, 16);
        this.offset += 16;
        this.header_len = this.data.readUInt32LE(this.offset);
        this.offset += 4;
        this.file_count = this.data.readUInt32LE(this.offset);
        this.offset += 52;

        const offsets = this.generateOffsets();
        this.keysounds = this.generateSamples(offsets);
    }

    generateOffsets() {
        return [...Array(this.file_count).keys()].map((_) => {
            const ind = this.data.readUInt32LE(this.offset);
            this.offset += 4;
            return ind;
        });
    }

    generateSamples(offsets) {
        const keysounds = [];
        for (let i = 0; i<offsets.length; i++) {
            const keysound = new Sample(this.data, offsets[i]);
            if (keysound.is_bg) {
                //BG tracks are placed at the start of the list
                //as this makes it easier to deal with keysound
                //indices in chart files.
                this.late_bg = i != 0;
                keysounds.unshift(keysound);
            } else {
                keysounds.push(keysound);
            }
        }
        return keysounds;
    }
    
}

module.exports = Twodx;