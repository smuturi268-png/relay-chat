import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import './App.css'

type Room = 'general' | 'design' | 'engineering' | 'random'
type Message = { id: string; room: Room; name: string; text: string; time: string }
type PresenceUser = { id: string; name: string; room: Room }

const roomMeta: Record<Room, { label: string; icon: string; description: string }> = {
  general: { label: 'General', icon: '#', description: 'A place for everything' },
  design: { label: 'Design', icon: '◈', description: 'Share ideas and inspiration' },
  engineering: { label: 'Engineering', icon: '</>', description: 'Build, ship, and debug' },
  random: { label: 'Random', icon: '⌁', description: 'Fun and unexpected topics' },
}

const colors = ['#6c63ff', '#ff8a65', '#22a06b', '#d946ef', '#277da1', '#f59e0b']

function App() {
  const [room, setRoom] = useState<Room>('general')
  const [name] = useState(() => `Guest ${Math.floor(1000 + Math.random() * 9000)}`)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [users, setUsers] = useState<PresenceUser[]>([])
  const [typing, setTyping] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const client = io(import.meta.env.PROD ? '/' : 'http://localhost:3001')
    setSocket(client)
    client.on('connect', () => setConnected(true))
    client.on('disconnect', () => setConnected(false))
    client.on('history', (history: Message[]) => setMessages(history))
    client.on('message:new', (message: Message) => setMessages((current) => [...current, message].slice(-200)))
    client.on('presence:update', (presence: PresenceUser[]) => setUsers(presence))
    client.on('typing:update', ({ id, name: userName, isTyping }: { id: string; name: string; isTyping: boolean }) => {
      setTyping((current) => {
        const next = { ...current }
        if (isTyping) next[id] = userName
        else delete next[id]
        return next
      })
    })
    return () => {
      client.disconnect()
    }
  }, [])

  useEffect(() => {
    socket?.emit('room:join', { room, name })
    setMessages([])
    setTyping({})
  }, [room, name, socket])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const typingNames = useMemo(() => Object.values(typing).filter((value) => value !== name), [typing, name])

  function updateTyping(value: string) {
    setDraft(value)
    socket?.emit('typing:update', { isTyping: value.length > 0 })
    window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => socket?.emit('typing:update', { isTyping: false }), 1200)
  }

  function initials(userName: string) {
    return userName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  }

  function timeLabel(time: string) {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(time))
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = draft.trim()
    if (trimmed.length === 0) return
    const message: Omit<Message, 'id' | 'time'> = { room, name, text: trimmed }
    socket?.emit('message:new', message)
    setDraft('')
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <span>Relay</span>
        </div>

        <div className="profile">
          <div className="avatar avatar-you">{initials(name)}</div>
          <div>
            <strong>{name}</strong>
            <span><i className={connected ? 'online-dot' : 'offline-dot'} /> {connected ? 'Online' : 'Connecting'}</span>
          </div>
        </div>

        <nav className="room-nav" aria-label="Chat rooms">
          <div className="nav-heading"><span>ROOMS</span><button aria-label="Add room">+</button></div>
          {Object.entries(roomMeta).map(([key, meta]) => (
            <button key={key} className={`room-item ${room === key ? 'active' : ''}`} onClick={() => setRoom(key as Room)}>
              <span className="room-icon">{meta.icon}</span>
              <span>{meta.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button aria-label="Notifications">◷</button>
          <button aria-label="Settings">⚙</button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <div className="room-title"><span>{roomMeta[room].icon}</span><h1>{roomMeta[room].label}</h1></div>
            <p>{roomMeta[room].description}</p>
          </div>
          <div className="header-actions">
            <button className="search-button" aria-label="Search">⌕</button>
            <button className="info-button" aria-label="Room details">ⓘ</button>
          </div>
        </header>

        <div className="messages">
          <div className="day-divider"><span>Today</span></div>
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{roomMeta[room].icon}</div>
              <h2>Welcome to #{roomMeta[room].label}</h2>
              <p>Start a conversation with the group.</p>
            </div>
          )}
          {messages.map((message, index) => {
            const previous = messages[index - 1]
            const grouped = previous?.name === message.name
            const mine = message.name === name
            const color = colors[Math.abs([...message.name].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % colors.length]
            return (
              <article className={`message-row ${grouped ? 'grouped' : ''}`} key={message.id}>
                {!grouped ? <div className="avatar" style={{ background: color }}>{initials(message.name)}</div> : <div className="avatar-spacer" />}
                <div className="message-content">
                  {!grouped && <div className="message-meta"><strong>{mine ? `${message.name} (you)` : message.name}</strong><time>{timeLabel(message.time)}</time></div>}
                  <p>{message.text}</p>
                </div>
              </article>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <footer className="composer-wrap">
          <div className={`typing ${typingNames.length ? 'visible' : ''}`}>
            {typingNames.length > 0 && <><span className="typing-dots"><i /><i /><i /></span>{typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing</>}
          </div>
          <form className="composer" onSubmit={submitMessage}>
            <button type="button" aria-label="Add attachment">＋</button>
            <input value={draft} onChange={(event) => updateTyping(event.target.value)} placeholder={`Message #${roomMeta[room].label.toLowerCase()}`} maxLength={1000} />
            <button type="button" className="emoji-button" aria-label="Emoji">☺</button>
            <button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim()}>↑</button>
          </form>
        </footer>
      </section>

      <aside className="presence-panel">
        <div className="presence-heading"><h2>Members</h2><span>{users.length}</span></div>
        <div className="member-list">
          {users.map((user, index) => (
            <div className="member" key={user.id}>
              <div className="avatar member-avatar" style={{ background: colors[index % colors.length] }}>{initials(user.name)}<i /></div>
              <div><strong>{user.name}</strong><span>{user.name === name ? 'You' : 'Active now'}</span></div>
            </div>
          ))}
        </div>
      </aside>
    </main>
  )
}

export default App
