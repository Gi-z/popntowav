const fs = require("fs");

class PopnChart {

    //offsetKeysounds indicates that any keysound index references
    //within the chart may need to be decremented by one to account
    //for the bgtrack not being at the start of the 2dx container.

    constructor(filename, offsetKeysounds=false) {
        this.filename = filename;
        this.data = fs.readFileSync(filename);

        //Check if the chart is newstyle or old>
        //Needed to know event lengths.
        let newFormat = this.checkFormat();

        this.events = [];

        //This loop reads through the entire file,
        //rather than ending on an endofsong event.
        let offset = 0;
        while (offset < this.data.length) {
            const eventOffset = this.data.readInt32LE(offset);
            offset += 5;
            const eventFlag = this.data.readInt8(offset);
            offset += 1;

            let eventParam = 0;
            let eventValue = 0;
            
            //In regular events, param and value are 1 byte.
            //However on keysound events, the first 4 bits
            //are used for the param, while the proceeding
            //12 bits are used for the value.
            let joined = this.data.slice(offset, offset+2);
            offset += 2;
            if (eventFlag === 2 || eventFlag === 7) {
                //Endianness needs flipped.
                //This is a terrible way of doing this, I think.
                joined.swap16();
                const hx = joined.toString("hex");

                eventParam = parseInt(hx.slice(1, 4), 16);
                eventValue = parseInt(hx.slice(0, 1), 16);
            } else {
                eventParam = joined.readUInt8(0);
                eventValue = joined.readUInt8(1);
            }

            //Long note data isn't needed for GSTs, however it's here.
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
                    //Playable note event.
                    //This if is overzealous, just trying to stop BG tracks from being played twice.
                    if (sampleColumns[param] != 0) {
                        this.playEvents.push([offset, sampleColumns[param]]);
                    }
                    this.notecount += 1;
                    break;
                case 2:
                    //Sample change event.
                    if (offsetKeysounds) {
                        param -= 1;
                    }
                    sampleColumns[value] = param;
                    break;
                case 3:
                    //BG track start event.
                    this.playEvents.push([offset, 0]);
                    break;
                case 4:
                    //BPM change event.
                    this.bpm = param;
                    this.bpmTransitions.push(param);
                    break;
                case 7:
                    //BG sample event.
                    if (offsetKeysounds) {
                        param -= 1;
                    }
                    this.playEvents.push([offset, param]);
            }
        }
    }

    checkFormat() {
        if (this.data.readInt8(16) == 69) {
            return true;
        } else if (this.data.readInt8(12) == 69) {
            return false;
        } else {
            throw "Chart format not supported.";
        }
    }
}

module.exports = PopnChart;