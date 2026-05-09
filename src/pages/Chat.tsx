import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { toast } from 'sonner'
import Icon from '../components/Icon'
import ConfirmModal from '../components/ConfirmModal'
import SessionSkeleton from '../components/SessionSkeleton'

interface Message { role: 'user' | 'assistant'; content: string }
interface ChatSession { id: string; title: string; created_at: string }

type ChatMode = 'chat' | 'quiz' | 'summarize'

const suggestions = [
  'Explain how CPU scheduling works',
  'Quiz me on data structures',
  'What is the difference between TCP and UDP?',
  'Explain binary and hexadecimal numbers',
  'What is Object-Oriented Programming?',
  'How does memory management work in OS?',
  'Explain the OSI model layers',
  'What is a deadlock in operating systems?',
  'Quiz me on basic circuit theory',
  'Explain how sorting algorithms work',
]

const modeLabels: Record<ChatMode, string> = {
  chat: 'Chat',
  quiz: 'Quiz Mode',
  summarize: 'Note Summarizer',
}

const modeSystemPrompts: Record<ChatMode, string> = {
  chat: 'You are StudyAI, a helpful and friendly AI study assistant specialized in Computer Engineering. Help students understand topics like data structures, algorithms, operating systems, computer networks, digital systems, OOP, and circuit theory. Quiz them, explain concepts clearly, and be encouraging and concise.',
  quiz: 'You are StudyAI Quiz Mode. For every user prompt, generate a multiple-choice quiz with 4 options (A, B, C, D) related to the topic. Include the correct answer at the end. Make questions challenging but fair for Computer Engineering students. Format clearly with markdown.',
  summarize: 'You are StudyAI Note Summarizer. Take the user\'s pasted text and summarize it into clear, concise bullet points. Highlight key concepts, definitions, and important details. Keep it structured and easy to study from.',
}

const modeIcons: Record<ChatMode, string> = {
  chat: 'chat',
  quiz: 'quiz',
  summarize: 'summarize',
}

export default function Chat({ session }: { session: Session }) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode>('chat')
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { loadSessions() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadSessions = async () => {
    setSessionsLoading(true)
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      if (data) setSessions(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setSessionsLoading(false)
    }
  }

  const newSession = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: session.user.id, title: 'New Chat' })
        .select().single()
      if (error) throw error
      if (data) {
        setSessions(prev => [data, ...prev])
        setCurrentSessionId(data.id)
        setMessages([])
        setSidebarOpen(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId)
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      if (data) setMessages(data.map(m => ({ role: m.role, content: m.content })))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load messages')
    }
    setSidebarOpen(false)
  }

  const deleteSession = async (sessionId: string) => {
    try {
      await supabase.from('messages').delete().eq('session_id', sessionId)
      const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId)
      if (error) throw error
      setSessions(prev => prev.filter(x => x.id !== sessionId))
      if (currentSessionId === sessionId) { setCurrentSessionId(null); setMessages([]) }
      toast.success('Chat session deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete session')
    } finally {
      setDeleteTarget(null)
    }
  }

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    let sessionId = currentSessionId

    try {
      if (!sessionId) {
        const title = mode === 'summarize' ? 'Note Summary' : trimmed.slice(0, 40)
        const { data, error } = await supabase
          .from('chat_sessions')
          .insert({ user_id: session.user.id, title })
          .select().single()
        if (error) throw error
        if (!data) throw new Error('Failed to create chat session')
        sessionId = data.id
        setCurrentSessionId(data.id)
        setSessions(prev => [data, ...prev])
      }

      const userMsg: Message = { role: 'user', content: trimmed }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setLoading(true)

      const { error: insertError } = await supabase.from('messages').insert({ session_id: sessionId, role: 'user', content: trimmed })
      if (insertError) throw insertError

      const currentMessages = messagesRef.current

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1024,
          messages: [
            { role: 'system', content: modeSystemPrompts[mode] },
            ...currentMessages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: trimmed }
          ]
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error?.message || `Groq API error (${res.status})`)
      }

      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not respond.'
      const assistantMsg: Message = { role: 'assistant', content: reply }
      setMessages(prev => [...prev, assistantMsg])
      const { error: assistantInsertError } = await supabase.from('messages').insert({ session_id: sessionId, role: 'assistant', content: reply })
      if (assistantInsertError) console.error('Failed to save assistant message:', assistantInsertError)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(msg)
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }])
    }
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    toast.success('Signed out')
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
  }

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopied(index)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(null), 2000)
  }

  const exportChat = () => {
    if (messages.length === 0) {
      toast.error('No messages to export')
      return
    }
    const text = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `studyai-chat-${currentSessionId || 'export'}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Chat exported to .txt')
  }

  const modeButtons: ChatMode[] = ['chat', 'quiz', 'summarize']

  const currentSessionTitle = sessions.find(s => s.id === currentSessionId)?.title || 'New Chat'

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 w-64
        bg-surface-container-low border-r border-outline-variant
        flex flex-col p-sm
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex flex-col space-y-xs pb-md">
          <div className="flex items-center space-x-sm px-sm py-base">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary">
              <Icon name="school" className="text-xl" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md font-extrabold text-primary">StudyAI</span>
              <span className="font-label-md text-label-md text-on-surface-variant">Academic Assistant</span>
            </div>
          </div>
          <button
            onClick={newSession}
            className="mx-sm mt-base flex items-center justify-center space-x-sm bg-primary text-on-primary py-sm px-md rounded-xl font-bold hover:opacity-90 transition-all duration-150 active:scale-95"
          >
            <Icon name="add" />
            <span className="font-label-md">New Chat</span>
          </button>
        </div>

        {/* Sessions / Nav */}
        <nav className="flex-1 space-y-xs overflow-y-auto">
          {sessionsLoading ? (
            <SessionSkeleton count={5} />
          ) : (
            <>
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`group flex items-center justify-between px-sm py-sm rounded-lg cursor-pointer transition-all duration-200 ${
                    currentSessionId === s.id
                      ? 'bg-secondary-container text-on-secondary-container font-bold'
                      : 'text-on-surface-variant hover:bg-surface-variant'
                  }`}
                  onClick={() => loadSession(s.id)}
                >
                  <div className="flex items-center space-x-sm overflow-hidden">
                    <Icon name="chat_bubble" className="text-base flex-shrink-0" />
                    <span className="font-label-md truncate">{s.title}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(s.id) }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-error-container hover:text-error transition-all flex-shrink-0"
                    title="Delete session"
                  >
                    <Icon name="delete" className="text-sm" />
                  </button>
                </div>
              ))}
            </>
          )}
        </nav>

        {/* Bottom actions */}
        <div className="pt-base border-t border-outline-variant space-y-xs">
          <button
            onClick={exportChat}
            className="flex items-center space-x-sm px-sm py-sm text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all duration-200 w-full"
          >
            <Icon name="download" className="text-base" />
            <span className="font-label-md">Export Chat</span>
          </button>
          <button
            onClick={signOut}
            className="flex items-center space-x-sm px-sm py-sm text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all duration-200 w-full"
          >
            <Icon name="logout" className="text-base" />
            <span className="font-label-md">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:ml-0 h-screen relative bg-surface min-w-0">
        {/* Top App Bar */}
        <header className="flex justify-between items-center px-md w-full h-16 border-b border-outline-variant bg-surface sticky top-0 z-40 flex-shrink-0">
          <div className="flex items-center space-x-md">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-base rounded-full hover:bg-surface-container-highest text-on-surface-variant transition-colors duration-200 active:scale-95"
            >
              <Icon name="menu" />
            </button>
            <span className="font-headline-md text-headline-md font-bold text-primary hidden sm:block">StudyAI</span>
            {currentSessionId && (
              <div className="hidden lg:flex items-center space-x-base ml-lg">
                <span className="font-body-md text-body-md text-primary font-bold border-b-2 border-primary py-xs">
                  {currentSessionTitle}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-sm">
            {/* Mode toggles */}
            <div className="hidden sm:flex items-center space-x-xs bg-surface-container rounded-lg p-xs">
              {modeButtons.map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setMessages([]); setCurrentSessionId(null) }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
                    mode === m
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {modeLabels[m]}
                </button>
              ))}
            </div>
            <button
              onClick={() => toast.info('Notifications coming soon')}
              className="p-base rounded-full hover:bg-surface-container-highest text-on-surface-variant transition-colors duration-200 active:scale-95"
            >
              <Icon name="notifications" />
            </button>
            <button
              onClick={() => toast.info('Settings coming soon')}
              className="p-base rounded-full hover:bg-surface-container-highest text-on-surface-variant transition-colors duration-200 active:scale-95"
            >
              <Icon name="settings" />
            </button>
            <div className="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant overflow-hidden ml-sm flex items-center justify-center">
              <Icon name="person" className="text-on-surface-variant" />
            </div>
          </div>
        </header>

        {/* Chat Workspace */}
        <div className="flex-1 overflow-y-auto w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-lg space-y-xl scroll-smooth">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center space-y-base fade-up mt-xl">
              <div className="w-16 h-16 bg-secondary-container rounded-2xl flex items-center justify-center text-on-secondary-container mb-sm shadow-sm">
                <Icon name={modeIcons[mode]} className="text-[32px]" />
              </div>
              <h1 className="font-headline-lg text-headline-lg text-on-background">
                {mode === 'quiz' ? 'Quiz Mode' : mode === 'summarize' ? 'Note Summarizer' : 'What are we studying today?'}
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                {mode === 'quiz'
                  ? 'Enter any topic and I will generate a multiple-choice quiz for you.'
                  : mode === 'summarize'
                  ? 'Paste your notes or text and I will summarize them into bullet points.'
                  : 'Ask me to explain a topic, quiz you, summarize your notes, or help with any subject.'}
              </p>

              {mode === 'chat' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl mt-lg">
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="text-left px-sm py-sm bg-surface-container-low hover:bg-surface-container border border-outline-variant hover:border-primary rounded-lg text-body-sm text-on-surface-variant hover:text-on-surface transition-all duration-200"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="space-y-md">
            {messages.map((msg, i) => (
              <div key={i} className={`flex fade-up group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mr-sm mt-1 flex-shrink-0">
                    <Icon name="school" className="text-on-primary text-sm" />
                  </div>
                )}
                <div className="relative max-w-[80%]">
                  <div className={`px-sm py-sm rounded-2xl text-body-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-primary text-on-primary font-medium rounded-br-sm'
                      : 'bg-surface-container text-on-surface border border-outline-variant rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>

                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => copyToClipboard(msg.content, i)}
                      className="absolute -top-2 -right-2 p-1 bg-surface-container border border-outline-variant rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-container-high hover:border-primary"
                      title="Copy response"
                    >
                      {copied === i ? (
                        <Icon name="check" className="text-primary text-sm" />
                      ) : (
                        <Icon name="content_copy" className="text-on-surface-variant text-sm" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mr-sm flex-shrink-0">
                  <Icon name="school" className="text-on-primary text-sm" />
                </div>
                <div className="bg-surface-container border border-outline-variant rounded-2xl rounded-bl-sm px-sm py-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-margin-mobile md:px-margin-desktop py-md border-t border-outline-variant bg-surface flex-shrink-0">
          <div className="flex gap-sm max-w-4xl mx-auto items-end">
            <div className="flex-1 bg-surface-container-low border border-outline-variant rounded-xl px-sm py-sm flex items-center focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={
                  mode === 'quiz'
                    ? 'Enter a topic for a quiz...'
                    : mode === 'summarize'
                    ? 'Paste your notes here...'
                    : 'Ask me anything about your studies...'
                }
                className="flex-1 bg-transparent text-body-sm text-on-surface placeholder-on-surface-variant focus:outline-none"
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-primary text-on-primary font-semibold px-md py-sm rounded-xl hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center gap-xs"
            >
              <Icon name="send" className="text-base" />
              <span className="hidden sm:inline font-label-md">Send</span>
            </button>
          </div>
          <p className="text-center text-on-surface-variant text-xs mt-xs">Press Enter to send</p>
        </div>
      </main>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Chat Session"
        message="Are you sure you want to delete this chat session? This action cannot be undone."
        onConfirm={() => deleteTarget && deleteSession(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}