const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mime = require('mime-types');
const SSH = require('simple-ssh');

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

/**
 * BASED ON MANY QUESTIONS
 * Actually ready mentioned on the tutorials
 * 
 * Many people confused about the warning for file-upload
 * So, we just disabling the debug for simplicity.
 */
app.use(fileUpload({
  debug: false
}));

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
  },
  authStrategy: new LocalAuth()
});

const devices = [
  {
    name: 'MikroTik 1',
    device: {
      host: '103.154.88.106',
      port: 2244,
      user: 'admin',
      pass: '009988'
    },
    allowedNumbers: ['6282337444629']
  },
  {
    name: 'MikroTik 2',
    device: {
      host: '103.154.88.109',
      port: 2223,
      user: 'admin',
      pass: '009988'
    },
    allowedNumbers: ['6285904417368']
  }
];

const allowedNumbers = ['6282337444629', '6285904417368'];

client.on('message', msg => {
  const text = msg.body.toLowerCase() || '';
  const senderNumber = msg.from.replace('@c.us', '');

   // Check if the sender number is allowed
  if (!allowedNumbers.includes(senderNumber)) {
    msg.reply('Maaf, Anda tidak diizinkan menggunakan bot ini.');
    return;
  } else if (msg.body == '!ping') {
    msg.reply('pong2');
  } else if (msg.body == 'good morning') {
    msg.reply('selamat pagi');
  } else if (msg.body == '!groups') {
    client.getChats().then(chats => {
      const groups = chats.filter(chat => chat.isGroup);

      if (groups.length == 0) {
        msg.reply('You have no group yet.');
      } else {
        let replyMsg = '*YOUR GROUPS*\n\n';
        groups.forEach((group, i) => {
          replyMsg += `ID: ${group.id._serialized}\nName: ${group.name}\n\n`;
        });
        replyMsg += '_You can use the group id to send a message to the group._'
        msg.reply(replyMsg);
      }
    });
  } else if (msg.body === '!menu') {
    const menu = 'Silahkan pilih menu:\n1. #ping/google.com untuk ping\n2. #int Tampilkan Interface\n3. #cpu Tampilkan System Resource\n4. #ppp menampilkan PPP Active\n5. #ppp_remove/target menghapus PPP active\n\n===================\n© Copyright Taufan';
    msg.reply(menu);
  } else if (msg.body.includes("#ping/")) {
    const parts = msg.body.split("/");
    const target = parts[1];
    devices.forEach(function(device) {
      const ssh = new SSH(device.device);
      ssh.exec(`ping ${target} count=10`, {
        out: function (stdout) {
          const reply = `${device.name} ping results for ${target}:\n\n${stdout}`;
          device.allowedNumbers.forEach(function(number) {
            if (msg.from.includes(number)) {
              client.sendMessage(msg.from, reply);
            }
          });
          ssh.end();
        },
        err: function (stderr) {
          const reply = `${device.name} error while pinging ${target}:\n\n${stderr}`;
          device.allowedNumbers.forEach(function(number) {
            if (msg.from.includes(number)) {
              client.sendMessage(msg.from, reply);
            }
          });
          ssh.end();
        },
        exit: function (code) {
          ssh.end();
        }
      }).start();
    });
  } else if (msg.body === '#ppp') {
    devices.forEach(function(device) {
      const ssh = new SSH(device.device);
      ssh.exec('ppp active print', {
        exit: function (code, stdout, stderr) {
          const lines = stdout.trim().split('\n');
          const ppps = lines.slice(2).map((line) => {
            const values = line.trim().split(/\s+/);
            return {
              name: values[2],
              service: values[3],
              remoteAddress: values[5],
              uptime: values[6],
            };
          });
          const reply = `${device.name}: There are ${ppps.length} active PPP connections:\n\n${ppps.map((ppp) => `${ppp.name} (service: ${ppp.service}, remote address: ${ppp.remoteAddress}, uptime: ${ppp.uptime})`).join('\n')}`;
          device.allowedNumbers.forEach(function(number) {
            if (msg.from.includes(number)) {
              client.sendMessage(msg.from, reply);
            }
          });
          ssh.end();
        }
      }).start();
    });
  } else if (msg.body === '#cpu') {
    devices.forEach(function(device) {
      const ssh = new SSH(device.device);
      ssh.exec('system resource print', {
        exit: function (code, stdout, stderr) {
          const lines = stdout.trim().split('\n');
          const resources = lines.slice(2).map((line) => {
            const values = line.trim().split(/\s+/);
            return {
              property: values[0],
              value: values[1],
            };
          });
          const reply = `${device.name} system resources:\n\n${resources.map((res) => `${res.property}: ${res.value}`).join('\n')}`;
          device.allowedNumbers.forEach(function(number) {
            if (msg.from.includes(number)) {
              client.sendMessage(msg.from, reply);
            }
          });
          ssh.end();
        }
      }).start();
    });
  } else if (msg.body === '#int') {
    devices.forEach(function(device) {
    const ssh = new SSH(device.device);
    ssh.exec('interface ethernet print', {
      out: function(stdout) {
        const lines = stdout.trim().split('\n');
        const interfaces = lines.slice(1).map((line) => {
          const values = line.trim().split(/\s+/);
          return {
            name: values[2],
            mtu: values[3],
            macAddress: values[4],
            link: values[1],
          };
        });
          const reply = `There are ${interfaces.length} ethernet interfaces:\n\n${interfaces.map((interface) => `${interface.name} (MAC: ${interface.macAddress}, MTU: ${interface.mtu}, Link: ${interface.link})`).join('\n')}`;
          device.allowedNumbers.forEach(function(number) {
            if (msg.from.includes(number)) {
              client.sendMessage(msg.from, reply);
            }
          });
          ssh.end();
        }
      }).start();
    });
  } else if (msg.body.includes('#ppp_remove/')) {
    const parts = msg.body.split('/');
    const target = parts[1];
    devices.forEach(function(device) {
      const ssh = new SSH(device.device);
      ssh.exec(`ppp active remove [find name=${target}]`, {
        out: function(stdout) {
          const reply = `PPP Active ${target} removed on ${device.name}`;
          device.allowedNumbers.forEach(function(number) {
            if (msg.from.includes(number)) {
              client.sendMessage(msg.from, reply);
            }
          });
        },
        err: function(stderr) {
          msg.reply(stderr);
        },
        exit: function(code) {
          ssh.end();
       }
      }).start();
    });
  } else if (msg.body === '#reboot') {
    devices.forEach(function(device) {
    const ssh = new SSH(device.device);
    ssh.exec('/system reboot', {
      out: function (stdout) {
        const reply = `Mikrotik ${device.name} sedang melakukan reboot.`;
        device.allowedNumbers.forEach(function(number) {
          if (msg.from.includes(number)) {
            client.sendMessage(msg.from, reply);
          }
        });
      },
      err: function (stderr) {
        const reply = `Error saat melakukan reboot pada Mikrotik ${device.name}: ${stderr}`;
        device.allowedNumbers.forEach(function(number) {
          if (msg.from.includes(number)) {
            client.sendMessage(msg.from, reply);
          }
        });
      },
      exit: function (code) {
        ssh.end();
      }
    }).start();
  });
}
 

  // NOTE!
  // UNCOMMENT THE SCRIPT BELOW IF YOU WANT TO SAVE THE MESSAGE MEDIA FILES
  // Downloading media
  // if (msg.hasMedia) {
  //   msg.downloadMedia().then(media => {
  //     // To better understanding
  //     // Please look at the console what data we get
  //     console.log(media);

  //     if (media) {
  //       // The folder to store: change as you want!
  //       // Create if not exists
  //       const mediaPath = './downloaded-media/';

  //       if (!fs.existsSync(mediaPath)) {
  //         fs.mkdirSync(mediaPath);
  //       }

  //       // Get the file extension by mime-type
  //       const extension = mime.extension(media.mimetype);
        
  //       // Filename: change as you want! 
  //       // I will use the time for this example
  //       // Why not use media.filename? Because the value is not certain exists
  //       const filename = new Date().getTime();

  //       const fullFilename = mediaPath + filename + '.' + extension;

  //       // Save to file
  //       try {
  //         fs.writeFileSync(fullFilename, media.data, { encoding: 'base64' }); 
  //         console.log('File downloaded successfully!', fullFilename);
  //       } catch (err) {
  //         console.log('Failed to save the file:', err);
  //       }
  //     }
  //   });
  // }
});

client.initialize();

// Socket IO
io.on('connection', function(socket) {
  socket.emit('message', 'Connecting...');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });

  client.on('authenticated', () => {
    socket.emit('authenticated', 'Whatsapp is authenticated!');
    socket.emit('message', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED');
  });

  client.on('auth_failure', function(session) {
    socket.emit('message', 'Auth failure, restarting...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp is disconnected!');
    client.destroy();
    client.initialize();
  });
});


const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

// Send message
app.post('/send-message', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Send media
app.post('/send-media', async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file;

  // const media = MessageMedia.fromFilePath('./image-example.png');
  // const file = req.files.file;
  // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  let mimetype;
  const attachment = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  }).then(response => {
    mimetype = response.headers['content-type'];
    return response.data.toString('base64');
  });

  const media = new MessageMedia(mimetype, attachment, 'Media');

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

const findGroupByName = async function(name) {
  const group = await client.getChats().then(chats => {
    return chats.find(chat => 
      chat.isGroup && chat.name.toLowerCase() == name.toLowerCase()
    );
  });
  return group;
}

// Send message to group
// You can use chatID or group name, yea!
app.post('/send-group-message', [
  body('id').custom((value, { req }) => {
    if (!value && !req.body.name) {
      throw new Error('Invalid value, you can use `id` or `name`');
    }
    return true;
  }),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  let chatId = req.body.id;
  const groupName = req.body.name;
  const message = req.body.message;

  // Find the group by name
  if (!chatId) {
    const group = await findGroupByName(groupName);
    if (!group) {
      return res.status(422).json({
        status: false,
        message: 'No group found with name: ' + groupName
      });
    }
    chatId = group.id._serialized;
  }

  client.sendMessage(chatId, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Clearing message on spesific chat
app.post('/clear-message', [
  body('number').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  const chat = await client.getChatById(number);
  
  chat.clearMessages().then(status => {
    res.status(200).json({
      status: true,
      response: status
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  })
});

server.listen(port, function() {
  console.log('App running on *: ' + port);
});
