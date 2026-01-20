import React, { useState, useEffect, useRef } from 'react';
// import axios from 'axios';
import { Send, Bot, Loader2, LogOut, Calendar, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// 模拟 API 调用（用户需要替换为真实的微信云函数 HTTP 触发 URL）
// const CLOUD_FUNCTION_URL = 'https://YOUR_CLOUD_BASE_HTTP_URL/assistant';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: '您好！我是您的智能预约助手。请问想约哪位教练或什么课程？' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsLoggedIn(true);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 这里的逻辑需要对接真实的微信云函数 HTTP 访问
      // 由于环境限制，这里先模拟 AI 回复
      // 实际使用时，用户需要在微信云开发后台开启“云函数 HTTP 访问”

      /* 
      const response = await axios.post(CLOUD_FUNCTION_URL, {
        messages: messages.concat(userMessage).map(m => ({ role: m.role, content: m.content })),
        currentDate: new Date().toISOString()
      });
      const reply = response.data.reply;
      */

      // 模拟延迟
      await new Promise(resolve => setTimeout(resolve, 1500));

      const mockReply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `好的${username}，我已经收到了您的需求：“${input}”。正在为您查询教练日程... (演示环境下 AI 回复已模拟)`
      };

      setMessages(prev => [...prev, mockReply]);
    } catch (error) {
      console.error('API Error:', error);
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: '抱歉，连接助手系统出错，请稍后再试。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="login-container animate-fade-in">
        <div className="glass-card login-card">
          <div className="login-header">
            <div className="logo-box">
              <Calendar size={32} />
            </div>
            <h1>智能预约系统</h1>
            <p>使用自然语言，轻松预定您的运动课程</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label>您的姓名</label>
              <input
                type="text"
                placeholder="请输入您的姓名以开始"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary login-btn">
              开始预约 <ChevronRight size={18} />
            </button>
          </form>
          <div className="login-footer">
            <p>Powered by WeChat Cloud & AI</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="glass-card chat-container">
        <header className="chat-header">
          <div className="header-info">
            <div className="avatar assistant-avatar">
              <Bot size={20} />
            </div>
            <div>
              <h3>预约助手</h3>
              <span className="status-indicator">在线</span>
            </div>
          </div>
          <button className="logout-btn" onClick={() => setIsLoggedIn(false)}>
            <LogOut size={18} />
          </button>
        </header>

        <div className="messages-area" ref={scrollRef}>
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`message-row ${m.role}`}
              >
                <div className={`message-bubble ${m.role}`}>
                  {m.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble assistant loading">
                <Loader2 size={18} className="spin" />
                <span>助手正在思考...</span>
              </div>
            </div>
          )}
        </div>

        <footer className="chat-footer">
          <div className="input-wrapper">
            <input
              type="text"
              placeholder="输入预约需求，例如：我想约明晚8点张教练的课"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            />
            <button
              className={`send-btn ${!input.trim() || isLoading ? 'disabled' : ''}`}
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              <Send size={18} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
