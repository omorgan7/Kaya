const bytereader = require('./reader')
const assert = require('assert')

{
    let buf = Buffer.allocUnsafe(1)
    let reader = new bytereader.VariableByteReader(buf)
    assert.equal(reader.buf, buf)
    assert.equal(reader.index, 0)
    assert.equal(reader.length, 1)
}

{
    let buf = Buffer.allocUnsafe(1)
    let reader = new bytereader.VariableBitReader(buf)
    assert.equal(reader.buf, buf)
    assert.equal(reader.index, 0)
    assert.equal(reader.bitValue, 0n)
    assert.equal(reader.bitCount, 0)
    assert.equal(reader.length, 1)
}

{
    let buf = Buffer.allocUnsafe(1)
    let reader = new bytereader.VariableByteReader(buf, 1)
    assert.equal(reader.index, 1)
}

{
    let buf = Buffer.allocUnsafe(1)
    let reader = new bytereader.VariableBitReader(buf, 1)
    assert.equal(reader.index, 1)
}

// testing the byte reader on a single byte.
{
    let buf = Buffer.allocUnsafe(1)
    for (let i = 0; i < 256; i++)
    {
        buf[0] = i
        let reader = new bytereader.VariableByteReader(buf)
        assert.equal(i, reader.byte())
    }
}

// testing the bit reader on a single byte.
{
    let buf = Buffer.allocUnsafe(1)
    for (let i = 0; i < 256; i++)
    {
        buf[0] = i
        let reader = new bytereader.VariableBitReader(buf)
        assert.equal(i, reader.bits(8))
    }
}

// testing the byte reader over many bytes
{
    let arr = [124, 99, 1, 0, 77, 23, 27, 66, 5, 255, 254, 2]
    let buf = Buffer.from(arr)
    let reader = new bytereader.VariableByteReader(buf)
    assert.equal(reader.length, arr.length)

    for (let i = 0; i < reader.length; i++) {
        assert.equal(arr[i], reader.byte())
    }
}

// testing the bit reader over many bytes
{
    let arr = [124, 99, 1, 0, 77, 23, 27, 66, 5, 255, 254, 2]
    let buf = Buffer.from(arr)
    let reader = new bytereader.VariableBitReader(buf)
    assert.equal(reader.length, arr.length)

    for (let i = 0; i < reader.length; i++) {
        assert.equal(arr[i], reader.byte())
    }
}

// testing the bit reader over many bytes
{
    let arr = [124, 99, 1, 0, 77, 23, 27, 66, 5, 255, 254, 2]
    let buf = Buffer.from(arr)
    let reader = new bytereader.VariableBitReader(buf)

    for (let i = 0; i < reader.length; i++) {
        assert.equal(arr[i], reader.bits(8))
    }
}

// testing the bit reader over many bytes, reading 4 at a time
{
    let arr = [124, 99, 1, 0, 77, 23, 27, 66, 5, 255, 254, 2]
    let buf = Buffer.from(arr)
    let reader = new bytereader.VariableBitReader(buf)

    for (let i = 0; i < reader.length; i++) {
        assert.equal(arr[i] & ((1 << 4) - 1), reader.bits(4))
        assert.equal(arr[i] >> 4, reader.bits(4))
    }
}

// testing the bit reader reading many non-sequential bytes
{
    // only the first element has the highest bit set.
    let arr = [128, 99, 1, 0, 77, 23, 27, 66, 5, 67, 4, 2]
    let truth = arr.map((a, i) => {
        if (i != 0) {
            return arr[i - 1] >> 1 | ((a << 7) & 255)
        }
    }).filter((a) => {
        return a != undefined
    })

    let buf = Buffer.from(arr)
    let reader = new bytereader.VariableBitReader(buf)

    let first = reader.bits(1)
    assert.equal(first, 0)

    let i = 0
    for (; reader.index < reader.length ;) {
        assert.equal(truth[i++], reader.byte())
    }
}

// testing the bit reader reading many non-sequential bytes
{
    // only the first element has the highest bit set.
    let arr = [128, 99, 1, 0, 77, 23, 27, 66, 5, 67, 4, 2]
    let truth = arr.map((a, i) => {
        if (i != 0) {
            return arr[i - 1] >> 1 | ((a << 7) & 255)
        }
    }).filter((a) => {
        return a != undefined
    })
    
    let buf = Buffer.from(arr)
    let reader = new bytereader.VariableBitReader(buf)

    let first = reader.bits(1)
    assert.equal(first, 0)

    let i = 0
    for (; reader.index < reader.length ;) {
        assert.equal(truth[i++], reader.bits(8))
    }
}

// testing the bit reader reading many non-sequential bytes
{
    // only the first element has the highest bit set.
    let arr = [128, 99, 1, 0, 77, 23, 27, 66, 5, 67, 4, 2]
    let truth = arr.map((a, i) => {
        if (i != 0) {
            return arr[i - 1] >> 1 | ((a << 7) & 255)
        }
    }).filter((a) => {
        return a != undefined
    })
    
    let buf = Buffer.from(arr)
    let reader = new bytereader.VariableBitReader(buf)

    let first = reader.bits(1)
    assert.equal(first, 0)

    let out = reader.bytes(truth.length)

    assert.equal(out.length, truth.length)
    out.forEach((o, i) => {
        assert.equal(o, truth[i])
    })
}

