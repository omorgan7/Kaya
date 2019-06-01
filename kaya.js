'use strict'

class VariableByteReader {

    constructor(buffer, index) {
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

class VariableBitReader extends VariableByteReader {

    constructor(buffer, index) {
        super(buffer, index)
        this.bitValue = 0n
        this.bitCount = 0
    }
    
    bits = (n) => {
        while (this.bitCount < n) {
            this.bitValue |= BigInt(this.nextByte() << this.bitCount)
		    this.bitCount += 8
        }

        let val = this.bitValue & BigInt(((1 << n) - 1))
        this.bitValue >>= BigInt(n)
        this.bitCount -= n

        return Number(val)
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

const protobuf = require('google-protobuf')
const snappy = require('snappy')
const fs = require('fs')
const messages = require('./generated_proto/dota_gcmessages_common_pb')
const demo = require('./generated_proto/demo_pb')
const demoNetwork = require('./generated_proto/networkbasetypes_pb')
const gcmessages = require('./generated_proto/dota_gcmessages_msgid_pb')
const usermessages = require('./generated_proto/dota_usermessages_pb')
const clientmessages = require('./generated_proto/dota_clientmessages_pb')
const netmessages = require('./generated_proto/netmessages_pb')
const metadata = require('./generated_proto/dota_match_metadata_pb')
const dotashared = require('./generated_proto/dota_shared_enums_pb')

exports.parseReplaySync = function(replayFilePath) {

    let replay = fs.readFileSync(replayFilePath)

    let stopReading = false

    // global variable for now to read the buffer index.
    var isCompressed = false
    var tick = 0

    // first thing we need to do is read the first 12 bytes for the header.

    // read as substring(0, 7) because JS doesn't compare
    // the null terminated magic string as equal.
    let demoFilestamp = replay.slice(0, 8).toString().substring(0, 7)
    let demoFileInfoOffset = replay.readInt32LE(8)

    /* I think the demoheader_t struct looks like:
    struct demoheader_t {
        char demofilestamp[8] = "PBDEMS2";
        int32_t fileinfo_offset;
        uint8_t padding[4];
    }

    I _think_ Valve forgot that the compiler would insert that padding
    so we have to skip over 16 bytes instead of 12 to start parsing out.
    the padding will probably contain uninitialised garbage
    */

    if (demoFilestamp == "PBUFDEM") {
        throw "Cannot parse source 1 replay file."
    }
    else if (demoFilestamp != "PBDEMS2") {
        throw "Not a dota 2 replay file."
    }

    let reader = new VariableByteReader(replay, 16)
    var dotaGamePlayers = []

    try {
        for (; reader.index < reader.length; ) {
            let demoCommand = readMessageType(reader)
            readMessage(demoCommand, reader)
        }
    }
    catch(e) {
        console.log("Terminated early with: ", e)
    }

    return dotaGamePlayers

    function readMessageType(reader) {
        let cmd = reader.variableInt32()

        isCompressed = (cmd & demo.EDemoCommands.DEM_ISCOMPRESSED) == demo.EDemoCommands.DEM_ISCOMPRESSED
        cmd = cmd & ~demo.EDemoCommands.DEM_ISCOMPRESSED

        return cmd
    }

    function readMessage(msgType, reader) {
        tick = reader.variableInt32()
        let size = reader.variableInt32()
        if (reader.index + size > reader.length) {
            return
        }

        let dotaProtoType
        switch (msgType) {
            case demo.EDemoCommands.DEM_SENDTABLES: {
                dotaProtoType = demo.CDemoSendTables
                dotaProtoType.handle = (message) => {}
                break
            }
            case demo.EDemoCommands.DEM_SPAWNGROUPS: {
                dotaProtoType = demo.CDemoSpawnGroups
                dotaProtoType.handle = (message) => {
                }
                break
            }
            case demo.EDemoCommands.DEM_FILEHEADER: {
                dotaProtoType = demo.CDemoFileHeader
                dotaProtoType.handle = (message) => {
                }
                break
            }
            case demo.EDemoCommands.DEM_SYNCTICK: {
                dotaProtoType = demo.CDemoSyncTick
                dotaProtoType.handle = (message) => {
                }
                break
            }
            case demo.EDemoCommands.DEM_STOP: {
                dotaProtoType = demo.CDemoStop
                dotaProtoType.handle = (message) => {
                }
                break
            }
            case demo.EDemoCommands.DEM_CLASSINFO: {
                dotaProtoType = demo.CDemoClassInfo
                dotaProtoType.handle = (message) => {
                }
                break
            }
            case demo.EDemoCommands.DEM_STRINGTABLES: {
                dotaProtoType = demo.CDemoStringTables
                dotaProtoType.handle = readStringTable
                break
            }
            case demo.EDemoCommands.DEM_FULLPACKET: {
                dotaProtoType = demo.CDemoFullPacket
                dotaProtoType.handle = (message) => {
                    let stringTable = message.getStringTable()
                    if (stringTable) readStringTable(stringTable)
                    let packet = message.getPacket()
                    if (packet) readDemoPacket(packet.getData())
                }
                break
            }
            case demo.EDemoCommands.DEM_PACKET:
            case demo.EDemoCommands.DEM_SIGNONPACKET: {
                dotaProtoType = demo.CDemoPacket
                dotaProtoType.handle = (msg) => {
                    readDemoPacket(msg.getData())
                }
                break
            }
            case demo.EDemoCommands.DEM_FILEINFO: {
                dotaProtoType = demo.CDemoFileInfo
                dotaProtoType.handle = (message) => {
                    let gameInfo = message.getGameInfo().getDota()

                    let playerList = gameInfo.getPlayerInfoList()

                    for (let i = 0; i < playerList.length; i++) {
                        let player = playerList[i]
                        let dgPlayer = dotaGamePlayers[i]
                        dgPlayer.heroName = player.getHeroName()
                        dgPlayer.playerName = player.getPlayerName(),
                        dgPlayer.steamID = player.getSteamid()
                        let team = player.getGameTeam()
                        dgPlayer.team = team == dotashared.EMatchOutcome.K_EMATCHOUTCOME_RADVICTORY ? "Radiant" : "Dire"
                    }
                }
                break
            }
        }

        if (dotaProtoType === undefined) {
            throw "Unhandled message type."
        }
        let dataSlice = reader.buf.slice(reader.index, reader.index + size)
        let dataBuffer = isCompressed ? snappy.uncompressSync(dataSlice) : dataSlice

        let message = dotaProtoType.deserializeBinary(dataBuffer)

        dotaProtoType.handle(message)
        reader.seek(size)
    }

    function readStringTable(t) {
    }

    function readDemoPacket(data) {

        let reader = new VariableBitReader(Buffer.from(data), 0)

        // a packet can actually contain many subpackets.
        while (reader.length - reader.index > 0) {
            let cmd = reader.variableBits()
            let size = reader.variableInt32()
            let buffer = reader.bytes(size)

            if (cmd == usermessages.EDotaUserMessages.DOTA_UM_MATCHMETADATA) {

                let metadataFile = metadata.CDOTAMatchMetadataFile.deserializeBinary(buffer)
                let metadataData = metadataFile.getMetadata()
                let teams = metadataData.getTeamsList()

                let i = 0
                for (let team of teams) {
                    let players = team.getPlayersList()
                    
                    for (let player of players) {
                        let inventories = player.getInventorySnapshotList()
                        let inventory = inventories[inventories.length - 1]
                        let nw = player.getGraphNetWorthList()

                        dotaGamePlayers[i++] = {
                            kills : inventory.getKills(),
                            deaths : inventory.getDeaths(),
                            assists : inventory.getAssists(),
                            items : inventory.getItemIdList(),
                            level : inventory.getLevel(),
                            gpm : player.getBestGpmX16(),
                            gameTime : inventory.getGameTime(),
                            xpm : player.getBestXpmX16(),
                            networth : nw[nw.length - 1]
                        }
                    }
                }
            }
        }
    }
}
