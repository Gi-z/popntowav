const fs = require("fs");

class Keysound {
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

        this.key_no = key_no;
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
        const data = fs.readFileSync(path);

        let offset = 0;

        this.name = data.toString("ascii", 0, 16);
        offset += 16;
        this.header_len = data.readUInt32LE(offset);
        offset += 4;
        this.file_count = data.readUInt32LE(offset);
        offset += 52;

        this.keysounds = [];

        let trackOffsets = [...Array(this.file_count).keys()].map((_) => {
            const ind = data.readUInt32LE(offset);
            offset += 4;
            return ind;
        });

        for (let i = 0; i<trackOffsets.length; i++) {
            const keysound = new Keysound(data, trackOffsets[i]);
            if (keysound.is_bg) {
                this.late_bg = i != 0;
                this.keysounds.unshift(keysound);
            } else {
                this.keysounds.push(keysound);
            }
        }
    }
    
}

module.exports = Twodx;