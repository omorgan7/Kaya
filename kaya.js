'use strict'

const bytereader = require('./reader')
const snappy = require('snappy')
const fs = require('fs')
const demo = require('./generated_proto/demo_pb')
const usermessages = require('./generated_proto/dota_usermessages_pb')
const metadata = require('./generated_proto/dota_match_metadata_pb')
const dotashared = require('./generated_proto/dota_shared_enums_pb')

exports.parseReplaySync = function(replayFilePath) {

    function readMessageType(reader) {
        let cmd = reader.variableInt32()

        isCompressed = (cmd & demo.EDemoCommands.DEM_ISCOMPRESSED) == demo.EDemoCommands.DEM_ISCOMPRESSED
        cmd = cmd & ~demo.EDemoCommands.DEM_ISCOMPRESSED

        return cmd
    }

    function readClassInfo(msg) {
        let classes = msg.getClassesList()
        for (let c of classes) {
            let name = c.getNetworkName()
            let id = c.getClassId()

            let newClass = {
                id : id,
                name : name,
                serialiser: serialisers[name]
            }

            classesId[id] = newClass
            classesNames[name] = newClass
        }
    }

    function readDemoFileInfo(message) {
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

    function readStringTable(t) {
    }

    function readDemoPacket(data) {

        let reader = new bytereader.VariableBitReader(Buffer.from(data))

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

    // initialise protoypes with defaults.
    var prototypes = {}

    prototypes[demo.EDemoCommands.DEM_STOP] = {pb: demo.CDemoStop, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_FILEHEADER] = {pb: demo.CDemoFileHeader, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_FILEINFO] = {pb: demo.CDemoFileInfo, handle: readDemoFileInfo}
    prototypes[demo.EDemoCommands.DEM_SYNCTICK] = {pb: demo.CDemoSyncTick, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_SENDTABLES] = {pb: demo.CDemoSendTables, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_CLASSINFO] = {pb: demo.CDemoClassInfo, handle: readClassInfo}
    prototypes[demo.EDemoCommands.DEM_STRINGTABLES] = {pb: demo.CDemoStringTables, handle: readStringTable}
    prototypes[demo.EDemoCommands.DEM_PACKET] = {pb: demo.CDemoPacket, handle: (m) => {readDemoPacket(m.getData())}}
    prototypes[demo.EDemoCommands.DEM_SIGNONPACKET] = {pb: demo.CDemoPacket, handle: readStringTable}
    prototypes[demo.EDemoCommands.DEM_CONSOLECMD] = {pb: demo.CDemoConsoleCmd, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_CUSTOMDATA] = {pb: demo.CDemoCustomDta, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_CUSTOMDATACALLBACKS] = {pb: demo.CDemoCustomDataCallbacks, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_USERCMD] = {pb: demo.CDemoUserCmd, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_FULLPACKET] = {
        pb: demo.CDemoFullPacket, handle: (m) => {
            let stringTable = m.getStringTable()
            if (stringTable) readStringTable(stringTable)
            let packet = m.getPacket()
            if (packet) readDemoPacket(packet.getData())
        }}
    prototypes[demo.EDemoCommands.DEM_SAVEGAME] = {pb: demo.CDemoSaveGame, handle: (m) => {}}
    prototypes[demo.EDemoCommands.DEM_SPAWNGROUPS] = {pb: demo.CDemoSpawnGroups, handle: (m) => {}}

    let replay = fs.readFileSync(replayFilePath)

    let stopReading = false

    // global variable for now to read the buffer index.
    var isCompressed = false
    var tick = 0

    var classesId = []
    var classesNames = []
    var serialisers = []

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

    let reader = new bytereader.VariableByteReader(replay, 16)
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

    function readMessage(msgType, reader) {
        tick = reader.variableInt32()
        let size = reader.variableInt32()
        if (reader.index + size > reader.length) {
            return
        }

        let dataSlice = reader.buf.slice(reader.index, reader.index + size)
        let dataBuffer = isCompressed ? snappy.uncompressSync(dataSlice) : dataSlice

        let dotaProtoType = prototypes[msgType]

        let message = dotaProtoType.pb.deserializeBinary(dataBuffer)
        dotaProtoType.handle(message)
        reader.seek(size)
    }

    return dotaGamePlayers
}
