/**
 * Knight Bot - A WhatsApp Bot (modified)
 * Supports:
 *  - SESSION_ID env var (default "marcas")
 *  - single-file creds.json via CREDS_JSON_PATH env or ./creds.json
 *  - outputs QR as base64 (stored in memory & file)
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const fsExtra = require('fs-extra')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const { 
    default: makeWASocket,
    useMultiFileAuthState, 
    useSingleFileAuthState,
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

// Create a store object with required methods (unchanged)
const store = {
    messages: {},
    contacts: {},
    chats: {},
    groupMetadata: async (jid) => {
        return {}
    },
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
                if (contact.id) {
                    this.contacts[contact.id] = contact
                }
            })
        })

        ev.on('chats.set', (chats) => {
            this.chats = chats
        })
    },
    loadMessage: async (jid, id) => {
        return this.messages[jid]?.[id] || null
    }
}

let phoneNumber = "254769995625"
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "sexy-XMD BOT"
global.themeemoji = "•"

const settings = require('./settings')
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

// SESSION and CREDS handling
const SESSION_ID = process.env.SESSION_ID && String(process.env.SESSION_ID).trim().length > 0 ? process.env.SESSION_ID.trim() : 'marcas'
const sessionDir = `./session-${SESSION_ID}` // per-session folder (persistent)
const credsSingleFileEnv = process.env.CREDS_JSON_PATH || './creds.json' // single-file creds path preferred
const useSingleFileCreds = fs.existsSync(credsSingleFileEnv) // switch to single-file mode if creds exist

// In-memory store for latest QR (base64) per session
const qrStore = {}

// tiny express server to serve QR if wanted (optional)
const app = express()
app.get('/pair', (req, res) => {
    const b64 = qrStore[SESSION_ID]
    if (!b64) return res.json({ status: 'NO_QR', message: 'No QR available yet. Start the bot and visit again.' })
    res.json({ status: 'QR_READY', session: SESSION_ID, qr: b64 })
})
const HTTP_PORT = process.env.HTTP_PORT || 3000
app.listen(HTTP_PORT, () => {
    console.log(chalk.gray(`[HTTP] QR endpoint available on http://localhost:${HTTP_PORT}/pair for session ${SESSION_ID}`))
})

// Helper: return auth state (either single-file or multi-file)
async function getAuthState(sessionFolder) {
    // ensure session folder exists for multi-file case
    if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true })

    if (useSingleFileCreds) {
        // use single file auth state (creds.json)
        try {
            console.log(chalk.green(`[AUTH] Using single-file creds from ${credsSingleFileEnv}`))
            const { state, saveCreds } = await useSingleFileAuthState(credsSingleFileEnv)
            return { state, saveCreds, path: credsSingleFileEnv, single: true }
        } catch (e) {
            console.error(chalk.red(`[AUTH] Failed to use single-file creds: ${e.message}`))
            // fallback to multi-file
        }
    }

    // default: multi-file auth state inside sessionFolder
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder)
    return { state, saveCreds, path: sessionFolder, single: false }
}

async function startXeonBotInc() {
    let { version, isLatest } = await fetchLatestBaileysVersion()
    const { state, saveCreds, path: authPath, single: authSingle } = await getAuthState(sessionDir)

    const msgRetryCounterCache = new NodeCache()

    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // we'll handle QR as base64 and optionally terminal output
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

    store.bind(XeonBotInc.ev)

    // Listen for QR codes and store base64 - also optionally write to a file for external platforms
    XeonBotInc.ev.on('connection.update', async (update) => {
        try {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                // convert QR to base64 PNG
                try {
                    const qrImage = await qrcode.toDataURL(qr) // data:image/png;base64,...
                    qrStore[SESSION_ID] = qrImage
                    // write to session folder for external access
                    try {
                        const outPath = path.join(sessionDir, 'last_qr.b64.txt')
                        fsExtra.ensureDirSync(sessionDir)
                        fs.writeFileSync(outPath, qrImage)
                    } catch (err) {
                        console.error(chalk.red('[QR] Could not write QR file:'), err.message)
                    }
                    // also print short notice to terminal
                    console.log(chalk.cyan(`[QR] Base64 QR generated for session "${SESSION_ID}". Use /pair endpoint or check ${sessionDir}/last_qr.b64.txt`))
                } catch (err) {
                    console.error(chalk.red('[QR] Failed to generate base64 QR:'), err)
                }
            }

            if (connection == "open") {
                console.log(chalk.magenta(` `))
                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))
                
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, { 
                    text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!
                    \n✅Make sure to join below channel`,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363418628641913@newsletter',
                            newsletterName: 'SEXY-XMD',
                            serverMessageId: -1
                        }
                    }
                });

                await delay(1999)
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'KNIGHT BOT'} ]`)}\n\n`))
                console.log(chalk.cyan(`< ================================================== >`))
                console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: MR HACKER`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: caseyweb`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
                console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: CASEYRHODES`))
                console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
            }

            // reconnect logic preserved
            if (
                connection === "close" &&
                lastDisconnect &&
                lastDisconnect.error &&
                lastDisconnect.error.output.statusCode != 401
            ) {
                console.log(chalk.yellow('[CONN] Connection closed unexpectedly, attempting restart...'))
                // small delay to avoid tight loop
                setTimeout(() => startXeonBotInc().catch(e => console.error('[CONN] restart failed', e)), 2000)
            }

        } catch (e) {
            console.error('[connection.update] handler error', e)
        }
    })

    // Save credentials when updated
    XeonBotInc.ev.on('creds.update', async () => {
        try {
            await saveCreds()
            // If we used single-file creds and we want to ensure the file is placed
            if (authSingle) {
                console.log(chalk.green(`[AUTH] Single-file credentials saved to ${authPath}`))
            } else {
                console.log(chalk.green(`[AUTH] Credentials saved to ${authPath}`))
            }
        } catch (err) {
            console.error(chalk.red('[AUTH] Failed to save credentials:'), err)
        }
    })

    // Message handling (use your main handlers)
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
                // Only try to send error message if we have a valid chatId
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

    // other handlers preserved
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

    // Pairing code interactive flow preserved (unchanged)
    if (pairingCode && !XeonBotInc.authState?.creds?.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 6281376552730 (without + or spaces) : `)))
        }

        // Clean the phone number - remove any non-digit characters
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        // Validate the phone number using awesome-phonenumber
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.'));
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
            } catch (error) {
                console.error('Error requesting pairing code:', error)
                console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
            }
        }, 3000)
    }

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

// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})
