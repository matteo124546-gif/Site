#!/usr/bin/env bash
set -euo pipefail

# Script to create the full project in the current directory.
# Usage:
#   Save this file, then run:
#     bash create_all_files.sh
# This will create the directories and files. Then run:
#   cp .env.example .env    # edit .env if needed
#   npm install
#   npm run dev   # or npm start

echo "Creating project files..."

mkdir -p models public

cat > package.json <<'JSON'
{
  "name": "private-chat-example",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "mongoose": "^7.0.0",
    "socket.io": "^4.7.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}
JSON

cat > .env.example <<'ENV'
# Copie ce fichier en .env et mets tes valeurs
PORT=3000
MONGO_URI=mongodb://localhost:27017/private-chat
JWT_SECRET=ton_secret_jwt_a_changer
ENV

cat > server.js <<'JS'
const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
require('dotenv').config();

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/private-chat', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(()=>console.log('MongoDB connected'))
  .catch(err=>console.error('MongoDB error', err));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });
  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'username taken' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hash });
    const token = jwt.sign({ id: user._id.toString(), username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user._id.toString(), username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user._id.toString(), username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user._id.toString(), username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Middleware pour routes protégées
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid token' });
  }
}

app.get('/api/users', authMiddleware, async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user.id } }).select('_id username');
  // normalize _id to id (string)
  const out = users.map(u => ({ _id: u._id.toString(), username: u.username }));
  res.json(out);
});

// Récupérer conversation entre l'utilisateur connecté et userId
app.get('/api/messages/:userId', authMiddleware, async (req, res) => {
  const other = req.params.userId;
  const me = req.user.id;
  const msgs = await Message.find({
    $or: [
      { from: me, to: other },
      { from: other, to: me }
    ]
  }).sort('createdAt');
  res.json(msgs);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// Map userId => set of socket ids
const online = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    return next();
  } catch (err) {
    return next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const uid = socket.user.id;
  if (!online.has(uid)) online.set(uid, new Set());
  online.get(uid).add(socket.id);

  // emit online presence (simple)
  io.emit('user_online', { userId: uid, online: true });

  socket.on('private_message', async ({ to, content }) => {
    if (!to || !content) return;
    const msg = await Message.create({
      from: socket.user.id,
      to,
      content,
      createdAt: new Date()
    });
    // envoyer à toutes les sockets du destinataire
    const targetSockets = online.get(to);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('private_message', {
          from: socket.user.id,
          to,
          content,
          _id: msg._id.toString(),
          createdAt: msg.createdAt
        });
      }
    }
    // Ack au sender
    socket.emit('private_message', {
      from: socket.user.id,
      to,
      content,
      _id: msg._id.toString(),
      createdAt: msg.createdAt
    });
  });

  socket.on('disconnect', () => {
    const set = online.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        online.delete(uid);
        io.emit('user_online', { userId: uid, online: false });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
JS

cat > models/User.js <<'JS'
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true }
});

module.exports = mongoose.model('User', UserSchema);
JS

cat > models/Message.js <<'JS'
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);
JS

cat > public/index.html <<'HTML'
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Private Chat Example</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    #users { float: left; width: 200px; }
    #chat { margin-left: 220px; }
    .msg { margin: 5px 0; }
    .me { color: green; }
    .them { color: blue; }
  </style>
</head>
<body>
  <h2>Private Chat</h2>

  <div id="auth">
    <h3>S'inscrire / Se connecter</h3>
    <input id="username" placeholder="username" />
    <input id="password" placeholder="password" type="password" />
    <button id="btnRegister">S'inscrire</button>
    <button id="btnLogin">Se connecter</button>
    <div id="authMsg"></div>
  </div>

  <div id="main" style="display:none">
    <div id="users">
      <h4>Utilisateurs</h4>
      <ul id="userList"></ul>
    </div>

    <div id="chat">
      <h4 id="chatWith">Chat</h4>
      <div id="messages" style="height:300px;overflow:auto;border:1px solid #ccc;padding:8px"></div>
      <input id="messageInput" placeholder="Ecrire un message..." style="width:70%" />
      <button id="sendBtn">Envoyer</button>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="/chat.js"></script>
</body>
</html>
HTML

cat > public/chat.js <<'JS'
let token = null;
let me = null;
let socket = null;
let currentChatUserId = null;

async function api(path, method='GET', body) {
  const headers = { 'Content-Type':'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

document.getElementById('btnRegister').onclick = async () => {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  const r = await api('/register','POST',{ username:u, password:p });
  if (r.token) {
    loginSuccess(r);
  } else {
    document.getElementById('authMsg').innerText = r.error || JSON.stringify(r);
  }
};

document.getElementById('btnLogin').onclick = async () => {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  const r = await api('/login','POST',{ username:u, password:p });
  if (r.token) {
    loginSuccess(r);
  } else {
    document.getElementById('authMsg').innerText = r.error || JSON.stringify(r);
  }
};

function loginSuccess(r) {
  token = r.token;
  me = r.user;
  document.getElementById('auth').style.display = 'none';
  document.getElementById('main').style.display = 'block';
  connectSocket();
  loadUsers();
}

async function loadUsers() {
  const users = await api('/users');
  const ul = document.getElementById('userList');
  ul.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.innerText = u.username;
    li.dataset.id = u._id;
    li.style.cursor = 'pointer';
    li.onclick = () => openChat(u);
    ul.appendChild(li);
  });
}

function openChat(user) {
  currentChatUserId = user._id;
  document.getElementById('chatWith').innerText = 'Chat avec ' + user.username;
  loadConversation(user._id);
}

async function loadConversation(otherId) {
  const msgs = await api('/messages/' + otherId);
  const box = document.getElementById('messages');
  box.innerHTML = '';
  msgs.forEach(m => {
    const div = document.createElement('div');
    div.className = 'msg ' + (m.from === me.id ? 'me' : 'them');
    div.innerText = (m.from === me.id ? 'Moi: ' : '') + m.content;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

document.getElementById('sendBtn').onclick = () => {
  const content = document.getElementById('messageInput').value;
  if (!content || !currentChatUserId) return alert('Choisis un utilisateur et écris un message.');
  socket.emit('private_message', { to: currentChatUserId, content });
  document.getElementById('messageInput').value = '';
};

function connectSocket() {
  socket = io({ auth: { token } });

  socket.on('connect_error', (err) => {
    console.error('Socket error', err.message);
  });

  socket.on('private_message', (m) => {
    // si conversation ouverte, ajouter message; sinon juste console
    if (m.from === currentChatUserId || m.to === currentChatUserId) {
      const box = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = 'msg ' + (m.from === me.id ? 'me' : 'them');
      div.innerText = (m.from === me.id ? 'Moi: ' : '') + m.content;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    } else {
      console.log('Message reçu en arrière-plan', m);
      // tu peux ajouter notifs ici
    }
  });

  socket.on('user_online', ({ userId, online }) => {
    // simple indicator : rafraîchir la liste
    loadUsers();
  });
}
JS

cat > README.md <<'MD'
# Private Chat Example

Cette application montre un chat privé minimal :
- Inscription / connexion (JWT)
- Chat privé en temps réel avec Socket.IO
- Stockage des messages dans MongoDB

Installation:
1. Copier `.env.example` en `.env` et remplir MONGO_URI et JWT_SECRET.
2. Installer les dépendances:
