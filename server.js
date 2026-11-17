import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const app = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: true, credentials: true } })

const rooms = ['general', 'design', 'engineering', 'random']
const dataDir = new URL('./data/', import.meta.url)
const dataFile = new URL('./data/messages.json', import.meta.url)
await mkdir(dataDir, { recursive: true })

let history = {}
try {
  history = JSON.parse(await readFile(dataFile, 'utf8'))
} catch {
  history = Object.fromEntries(rooms.map((room) => [room, []]))
  await writeFile(dataFile, JSON.stringify(history, null, 2))
}

const connectedUsers = new Map()

function roomUsers(room) {
  return [...connectedUsers.values()].filter((user) => user.room === room)
}

function broadcastPresence(room) {
  io.to(room).emit('presence:update', roomUsers(room))
}

io.on('connection', (socket) => {
  socket.on('room:join', ({ room, name }) => {
    if (!rooms.includes(room)) room = 'general'
    const cleanName = String(name || 'Guest').trim().slice(0, 30) || 'Guest'

    if (socket.data.room) socket.leave(socket.data.room)
    socket.join(room)
    socket.data.room = room
    socket.data.name = cleanName

    connectedUsers.set(socket.id, { id: socket.id, name: cleanName, room })
    socket.emit('history', history[room] || [])
    broadcastPresence(room)
  })

  socket.on('message:send', ({ text }) => {
    const room = socket.data.room
    const name = socket.data.name
    if (!room || !name || !text?.trim()) return

    const message = {
      id: crypto.randomUUID(),
      room,
      name,
      text: text.trim().slice(0, 1000),
      time: new Date().toISOString(),
    }
    history[room] = [...(history[room] || []), message].slice(-200)
    writeFile(dataFile, JSON.stringify(history, null, 2)).catch(console.error)
    io.to(room).emit('message:new', message)
  })

  socket.on('typing:update', ({ isTyping }) => {
    const room = socket.data.room
    if (!room) return
    socket.to(room).emit('typing:update', {
      id: socket.id,
      name: socket.data.name,
      isTyping: Boolean(isTyping),
    })
  })

  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id)
    connectedUsers.delete(socket.id)
    if (user) {
      socket.to(user.room).emit('typing:update', { id: socket.id, name: user.name, isTyping: false })
      broadcastPresence(user.room)
    }
  })
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const port = Number(process.env.PORT || 3001)
httpServer.listen(port, () => console.log(`Chat server listening on http://localhost:${port}`))

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(express.static(path.join(__dirname, 'public')))

const distDir = fileURLToPath(new URL('./dist/', import.meta.url))
app.use(express.static(distDir))
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(distDir, 'index.html'))
  }
  next()
})
