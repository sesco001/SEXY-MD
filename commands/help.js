const settings = require('../settings');
const fs = require('fs');
const path = require('path');

async function helpCommand(sock, chatId, channelLink) {
    const helpMessage = `

╭───────────────────❂
┃✰╭──────────────• 
┃✰│🧛🏼‍♀️ 𝗣𝗹𝗮𝘁𝗳𝗼𝗿𝗺 : *[ panel ]*
┃✰│🧛🏼‍♀️ 𝗣𝗿𝗲𝗳𝗶𝘅 : *[ . ]*
┃✰│🧛🏼‍♀️ 𝗠𝗼𝗱𝗲 : *[ public ]*
┃✰│🧛🏼‍♀️ 𝗕𝗼𝘁 𝗡𝗮𝗺𝗲 :  *${settings.botName || 'SEXY-XMD'}*  
┃✰│🧛🏼‍♀️ 𝗩𝗲𝗿𝘀𝗶𝗼𝗻 :  *${settings.version || '1.0.0'}*
┃✰│🧛🏼‍♀️ 𝗖𝗥𝗘𝗔𝗧𝗢𝗥 : ${settings.botOwner || 'MAKAMESCO'}
┃✰│🧛🏼‍♀️ 𝗬𝗧 : ${global.ytch}
┃✰╰──────────────•
╰───────────────────❂

* BOT MENU💣:*

╭━〔 *🌹 GENERAL MENU 🌹* 〕━⊷
┃🌸╭──────────────·๏
┃🌸│ .help
┃🌸│ .menu
┃🌸│ .alive
┃🌸│ .tts
┃🌸│ .owner
┃🌸│ .joke
┃🌸│ .quote
┃🌸│ .fact
┃🌸│ .weather
┃🌸│ .newsletterJid
┃🌸│ .attp
┃🌸│ .lyrics
┃🌸│ .8ball
┃🌸│ .goupinfo
┃🌸│ .staff
┃🌸│ .admins
┃🌸│ .vv
┃🌸│ .pair
┃🌸│ .rent
┃🌸╰────────────┈⊷
╰──────────────────┈⊷ 

╭━━〔 *🐦‍🔥 ADMIN MENU 🐦‍🔥* 〕━━┈⊷
┃🌿╭──────────────·๏
┃🌿│ .ban
┃🌿│ .promote
┃🌿│ .demote
┃🌿│ .mute
┃🌿│ .unmute
┃🌿│ .delete
┃🌿│ .del
┃🌿│ .kick
┃🌿│ .warnings
┃🌿│ .warnings
┃🌿│ .antilink 
┃🌿│ .antibadword
┃🌿│ .clear
┃🌿│ .Tag
┃🌿│ .tagall
┃🌿│ .chatbot
┃🌿│ .resetlink
┃🌿╰────────────┈⊷
╰──────────────────┈⊷

╭━━〔 *🛰️ OWNER MENU 🛰️* 〕━━┈⊷
┃🇰🇪╭──────────────·๏
┃🪔│ .mode
┃🇰🇪│ .autostatus
┃🪔│ .clearsession
┃🇰🇪│ .antidelete
┃🪔│ .cleartmp
┃🇰🇪│ .setpp
┃🪔╰────────────┈⊷
╰──────────────────┈⊷

╭━〔 *🌌IMAGE MENU 🌌*〕━┈⊷
┃🇲🇨╭──────────────·๏
┃⚖️│ .blur
┃🇲🇨│ .simage
┃⚖️│ .sticker
┃🇲🇨│ .tgsticker
┃⚖️│ .meme
┃🇲🇨│ .take
┃⚖️│ .emojimix
┃🇲🇨╰────────────┈⊷
╰──────────────────┈⊷  

╭━━〔 *🎮GAME MENU 🎮* 〕━━┈⊷
┃🎭╭──────────────·๏
┃🇮🇳│ .tictactoe
┃🎭│ .hangman
┃🇮🇳│ .guess
┃🎭│ .trivia
┃🇮🇳│ .answer
┃🎭│ .truth
┃🇮🇳│ .dare
┃🎭╰────────────┈⊷
╰──────────────────┈⊷

╭━━〔 *🤖AI MENU 🤖* 〕━━┈⊷
┃🪫╭──────────────·๏
┃🪫│ .gpt
┃🪫│ .gemini
┃🪫╰────────────┈⊷
╰──────────────────┈⊷

╭━━〔 *😃FUN MENU 😃* 〕━━┈⊷
┃🇭🇹╭──────────────·๏
┃⚖️│ .compliment
┃🇭🇹│ .insult
┃⚖️│ .flirt
┃🇭🇹│ .character
┃⚖️│ .wasted
┃🇭🇹│ .ship
┃⚖️│ .simp
┃🇭🇹│ .stupid
┃⚖️╰────────────┈⊷
╰──────────────────┈⊷

╭━〔 *✍️TEXT MAKER MENU ✍️* 〕━┈⊷
┃👩‍💻╭──────────────·๏
┃🧝‍♂️│ .metallic
┃👩‍💻│ .ice
┃🧝‍♂️│ .snow
┃👩‍💻│ .impressive
┃🧝‍♂️│ .matrix 
┃👩‍💻│ .light
┃🧝‍♂️│ .neon
┃👩‍💻│ .devil
┃🧝‍♂️│. Purple
┃👩‍💻│ .thunder
┃🧝‍♂️│ .leaves
┃👩‍💻│ .1917
┃🧝‍♂️│ .arena
┃👩‍💻│ .hacker
┃🧝‍♂️│ .sand
┃👩‍💻│ .blackpink
┃🧝‍♂️│ .glitch
┃👩‍💻│ .fire
┃🧝‍♂️╰────────────┈⊷
╰──────────────────┈⊷

╭━〔 *🔊DOWNLOADER  MENU 🔊*〕━┈⊷
┃⏳╭──────────────·๏
┃⏳│ .play
┃⏳│ .song
┃⏳│ .instagram
┃⏳│ .facebook
┃⏳│ .tiktok
┃⏳╰────────────┈⊷
╰──────────────────┈⊷

╭━〔 *🔱 GITHUB MENU🔱* 〕━┈⊷
┃🌀╭──────────────·๏
┃🌀│ .git
┃🌀│ .github 
┃🌀│ .sc
┃🌀│ .script
┃🌀│ .repo
┃🌀╰────────────┈⊷
╰──────────────────┈⊷

𝑷𝑶𝑾𝑬𝑹𝑬𝑫 𝑩𝒀🧝MAKAMESCODEV𝑨🧝:

POWERED BY 🧝‍♂️MAKAMESCO 𝐃𝐞𝐯🧝‍♂️ 🌍:`;

    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
        
        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage,
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
        } else {
            console.error('Bot image not found at:', imagePath);
            await sock.sendMessage(chatId, { 
                text: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363418628641913@newsletter',
                        newsletterName: 'SEXY-MD',
                        serverMessageId: -1
                    } 
                }
            });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage });
    }
}

module.exports = helpCommand;
