
class VariableByteReader {

    constructor(buffer, index = 0) {
        this.buf = buffer
        this.index = index
        this.length = buffer.byteLength
    }
    
    seek = (byAmount) => {
        this.index += byAmount
    }

    byte = () => {
        return this.buf[this.index++]
    }

    variableInt32 = () => {
        let result = 0
        let  s = 0
        while (true) {
            let b = this.byte()
            result |= (b & 0x7F) << s
            s += 7
            if (((b & 0x80) == 0) || (s == 35)) {
                break
            }
        }

        return result
    }
}

exports.VariableByteReader = VariableByteReader

class VariableBitReader extends VariableByteReader {

    constructor(buffer, index = 0) {
        super(buffer, index)
        this.bitValue = 0
        this.bitCount = 0
    }
    
    bits = (n) => {
        while (this.bitCount < n) {
            this.bitValue |= this.nextByte() << this.bitCount
		    this.bitCount += 8
        }

        let val = this.bitValue & ((1 << n) - 1)
        this.bitValue >>= n
        this.bitCount -= n

        return val
    }

    nextByte = () => {
        return this.buf[this.index++]
    }

    byte = () => {
        if (this.bitCount == 0) {
            return this.nextByte()
        }
        else {
            return this.bits(8)
        }
    }

    bytes = (n) => {
        if (this.bitCount == 0) {
            let buf = Buffer.from(this.buf.slice(this.index, this.index + n))
            this.seek(n)
            return buf
        }

        let out = Buffer.alloc(n)
        for (let i = 0; i < n; i++) {
            out[i] = this.bits(8)
        }

        return out
    }

    variableBits = () => {

        // copied from dotabuff/manta
        let ret = this.bits(6)
        switch (ret & 0x30) {
            case 16:
                ret = (ret & 15) | (this.bits(4) << 4)
                break
            case 32:
                ret = (ret & 15) | (this.bits(8) << 4)
                break
            case 48:
                ret = (ret & 15) | (this.bits(28) << 4)
                break
            }
        return ret
    }
}

exports.VariableBitReader = VariableBitReader
