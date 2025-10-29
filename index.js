/**
 * Knight Bot - Heroku-ready WhatsApp Bot (modified)
 * - Accepts Base64 session via env var (marcas; or MAKAMESCO-MD<=>)
 * - Uses SESSION_ID to isolate sessions (scan-<SESSION_ID>/)
 * - Writes scan-<SESSION_ID>/creds.json for Baileys (no QR required on deploy)
 * - Starts simple HTTP server on $PORT for Heroku
 */

require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const fsExtra = require('fs-extra')
const chalk = require('chalk')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const { 
    default: makeWASocket,
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const qrcode = require("qrcode")
const express = require("express")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// ---------- Keep your store object ----------
const store = {
    messages: {},
    contacts: {},
    chats: {},
    groupMetadata: async (jid) => { return {} },
    bind: function(ev) {
        ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(msg => {
                if (msg.key && msg.key.remoteJid) {
                    this.messages[msg.key.remoteJid] = this.messages[msg.key.remoteJid] || {}
                    this.messages[msg.key.remoteJid][msg.key.id] = msg
                }
            })
        })
        ev.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                if (contact.id) this.contacts[contact.id] = contact
            })
        })
        ev.on('chats.set', (chats) => { this.chats = chats })
    },
    loadMessage: async (jid, id) => {
        return this.messages[jid]?.[id] || null
    }
}
// ---------- end store ----------

let phoneNumber = "254112192119"
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "JINX-XMD BOT"
global.themeemoji = "•"

const settings = require('./settings')

// ---- Session config / env ----
// Provide Base64 session in HEROKU (or any host) as: SESSION (or SESSION_BASE64)
// Example values you might set on Heroku:
// SESSION=marcas;BASE64STRING...
// SESSION=MAKAMESCO-MD<=>BASE64STRING...
// or just raw base64 string
const SESSION_RAW = process.env.SESSION || process.env.SESSION_BASE64 || process.env.SESSION_ID_BASE64 || ''
const SESSION_ID = (process.env.SESSION_ID && String(process.env.SESSION_ID).trim().length > 0) ? process.env.SESSION_ID.trim() : 'marcas'
const HTTP_PORT = process.env.PORT || 3000

// pairing disabled when we have SESSION_RAW present (deploy mode)
const pairingCode = Boolean( (!SESSION_RAW) && (!!phoneNumber || process.argv.includes("--pairing-code")) )
const useMobile = process.argv.includes("--mobile")

// Only create readline if interactive
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) return new Promise((resolve) => rl.question(text, resolve))
    return Promise.resolve(settings.ownerNumber || phoneNumber)
}

// ensure the session target folder (scan-<id>) exists
const sessionFolder = path.join(__dirname, `scan-${SESSION_ID}`)
fsExtra.ensureDirSync(sessionFolder)
const credsFilePath = path.join(sessionFolder, 'creds.json')

// Helper: write base64 -> creds.json (if provided)
async function restoreCredsFromEnv() {
    try {
        if (!SESSION_RAW) {
            if (fs.existsSync(credsFilePath)) {
                console.log(chalk.green(`[AUTH] Using existing creds at ${credsFilePath}`))
                return true
            } else {
                console.log(chalk.yellow('[AUTH] No SESSION env provided and no local creds found. Pairing (QR) will be used locally.'))
                return false
            }
        }

        // strip known prefixes
        let cleaned = SESSION_RAW.replace(/MAKAMESCO-MD<=>/g, '')
                                .replace(/^marcas;?/i, '')
                                .trim()

        if (!cleaned) {
            console.log(chalk.red('[AUTH] SESSION env did not contain useful data after stripping prefixes.'))
            return false
        }

        // decode base64; if it's already JSON plain then Buffer will throw? we still try
        let decoded = ''
        try {
            decoded = Buffer.from(cleaned, 'base64').toString('utf8')
        } catch (e) {
            // fallback: maybe the env is raw JSON or not base64; write as-is
            decoded = cleaned
        }

        // quick validation: should look like JSON with "creds" or something
        let looksLikeJson = false
        try { JSON.parse(decoded); looksLikeJson = true } catch (e) { looksLikeJson = false }

        if (!looksLikeJson) {
            console.log(chalk.yellow('[AUTH] Decoded session does not parse as JSON. Will write raw string to creds file (may fail).'))
        }

        // write to creds.json
        fs.writeFileSync(credsFilePath, decoded, 'utf8')
        console.log(chalk.green(`[AUTH] Written credentials to ${credsFilePath} from SESSION env (SESSION_ID=${SESSION_ID})`))
        return true
    } catch (err) {
        console.error(chalk.red('[AUTH] Failed restoring creds from env:'), err)
        return false
    }
}

// Express server for Heroku (health + session info)
const app = express()
app.get('/', (req, res) => res.send({ status: 'ok', sessionId: SESSION_ID }))
app.get('/health', (req, res) => res.send('OK'))
app.get('/session-info', (req, res) => {
    res.json({
        sessionId: SESSION_ID,
        hasEnvSession: !!SESSION_RAW,
        credsFileExists: fs.existsSync(credsFilePath),
        credsFilePath
    })
})
app.listen(HTTP_PORT, () => console.log(chalk.gray(`[HTTP] Running on port ${HTTP_PORT}`)))

// ---------- Main function ----------
async function startXeonBotInc() {
    // restore creds from SESSION env first (if provided)
    const restored = await restoreCredsFromEnv()

    // get Baileys version
    let { version, isLatest } = await fetchLatestBaileysVersion()
    // use the session folder (scan-<id>) so creds.json is read by Baileys' multi-file state
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder)
    const msgRetryCounterCache = new NodeCache()

    // create socket
    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        // disable printing QR in terminal on deploy if we restored creds from env
        printQRInTerminal: !restored && !pairingCode, 
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid)
            let msg = await store.loadMessage(jid, key.id)
            return msg?.message || ""
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
    })

    // bind store & events
    store.bind(XeonBotInc.ev)

    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id && mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
            
            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, { 
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363418628641913@newsletter',
                                newsletterName: 'SEXY-XMD',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // decodeJid, contacts.update, getName, public, serializeM etc - keep as you had
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact 
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true
    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // pairingCode logic: preserved but only used if pairingCode true (interactive) AND no session restored
    if (pairingCode && !XeonBotInc.authState?.creds?.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 6281376552730 (without + or spaces) : `)))
        }

        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
        const pn = require('awesome-phonenumber')
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number.'))
            process.exit(1)
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app: Settings > Linked Devices > Link a Device > Enter code`))
            } catch (error) {
                console.error('Error requesting pairing code:', error)
                console.log(chalk.red('Failed to get pairing code.'))
            }
        }, 3000)
    }

    // connection.update
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
            
            const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
            await XeonBotInc.sendMessage(botNumber, { 
                text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!`,
                contextInfo: { forwardingScore: 1, isForwarded: true }
            }).catch(()=>{})
            await delay(1999)
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
        }
        if (
            connection === "close" &&
            lastDisconnect &&
            lastDisconnect.error &&
            lastDisconnect.error.output.statusCode != 401
        ) {
            console.log(chalk.yellow('[CONN] Connection closed. Restarting...'))
            startXeonBotInc().catch(e => console.error('[CONN] restart error', e))
        }
    })

    // save creds on update
    XeonBotInc.ev.on('creds.update', saveCreds)

    // group participant update, status handlers preserved
    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });
    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });
    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });
    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
}

// Start
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err) })
process.on('unhandledRejection', (err) => { console.error('Unhandled Rejection:', err) })

// watch + auto-require for dev
let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})
