const fs = require("fs");

class PopnChart {

    constructor(filename, offsetKeysounds=false) {
        this.filename = filename;
        this.data = fs.readFileSync(filename);

        let newFormat = false;
        if (this.data.readInt8(16) == 69) {
            newFormat = true;
        } else if (this.data.readInt8(12) == 69) {
            newFormat = false;
        } else {
            throw "Chart format not supported.";
        }

        this.events = [];

        let offset = 0;
        while (offset < this.data.length) {
            const eventOffset = this.data.readInt32LE(offset);
            offset += 5;
            const eventFlag = this.data.readInt8(offset);
            offset += 1;

            let eventParam = 0;
            let eventValue = 0;
            
            let joined = this.data.slice(offset, offset+2);
            offset += 2;
            if (eventFlag === 2 || eventFlag === 7) {
                joined.swap16();
                const hx = joined.toString("hex");

                eventParam = parseInt(hx.slice(1, 4), 16);
                eventValue = parseInt(hx.slice(0, 1), 16);
            } else {
                eventParam = joined.readUInt8(0);
                eventValue = joined.readUInt8(1);
            }

            if (newFormat) {
                const longNoteData = this.data.readInt32LE(offset);
                offset += 4;
            }
            
            this.events.push([eventOffset, eventFlag, eventParam, eventValue]);
        }

        this.bpm = 0;
        this.bpmTransitions = [];

        this.playEvents = [];
        this.uniqueKeysounds = [];

        this.notecount = 0;

        const sampleColumns = [0, 0, 0, 0, 0, 0, 0, 0, 0];

        for (const event of this.events) {
            let [offset, eventType, param, value] = event;

            if (eventType == 7 || eventType == 2) {
                if (this.uniqueKeysounds.indexOf(param) == -1) {
                    this.uniqueKeysounds.push(param);
                }
            }
            
            switch (eventType) {
                case 1:
                    if (sampleColumns[param] != 0) {
                        this.playEvents.push([offset, sampleColumns[param]]);
                    }
                    this.notecount += 1;
                    break;
                case 2:
                    if (offsetKeysounds) {
                        param -= 1;
                    }
                    sampleColumns[value] = param;
                    break;
                case 3:
                    this.playEvents.push([offset, 0]);
                    break;
                case 4:
                    this.bpm = param;
                    this.bpmTransitions.push(param);
                    break;
                case 7:
                    if (offsetKeysounds) {
                        param -= 1;
                    }
                    this.playEvents.push([offset, param]);
            }
        }
    }
}

module.exports = PopnChart;