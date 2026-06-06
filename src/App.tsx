import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, MessageSquare, Phone, Mail, Share2, Plus, X, Smartphone, MessageCircle, Info, Image, Paperclip } from "lucide-react";
import { getNeoResponse, getNeoAudio, resetNeoSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";



type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "neo";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("neo_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("neo_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showMsgCenter, setShowMsgCenter] = useState(false);
  const [msgType, setMsgType] = useState<"whatsapp" | "whatsapp-call" | "sms" | "email">("whatsapp");
  const [msgRecipient, setMsgRecipient] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(10);
  const lockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const torchTrackRef = useRef<MediaStreamTrack | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<{ base64: string; mimeType: string } | null>(null);

  const handleImageSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file!");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      setSelectedImage({
        base64,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const toggleTorch = async (on: boolean) => {
    try {
      if (on) {
        if (!torchTrackRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
          });
          const track = stream.getVideoTracks()[0];
          torchTrackRef.current = track;
        }
        
        const track = torchTrackRef.current;
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          await track.applyConstraints({
            advanced: [{ torch: true }]
          } as any);
        }
      } else {
        if (torchTrackRef.current) {
          const track = torchTrackRef.current;
          await track.applyConstraints({
            advanced: [{ torch: false }]
          } as any);
          track.stop();
          torchTrackRef.current = null;
        }
      }
    } catch (e) {
      console.error("Torch error:", e);
    }
  };

  useEffect(() => {
    if (isLocked) {
      setLockCountdown(10);
      lockTimerRef.current = setInterval(() => {
        setLockCountdown((prev) => {
          if (prev <= 1) {
            setIsLocked(false);
            if (lockTimerRef.current) clearInterval(lockTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    }
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    };
  }, [isLocked]);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string, imgData?: { base64: string; mimeType: string } | null) => {
    if (!finalTranscript.trim() && !imgData) {
      setAppState("idle");
      return;
    }

    const userTextLog = finalTranscript.trim() 
      ? (imgData ? `${finalTranscript} [Attached Screenshot]` : finalTranscript)
      : "[Uploaded Screenshot]";

    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: userTextLog }]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-n", sender: "neo", text: responseText }]);
      
      if (commandResult.commandType === "lock") {
        setIsLocked(true);
      } else if (commandResult.commandType === "torch-on") {
        toggleTorch(true);
      } else if (commandResult.commandType === "torch-off") {
        toggleTorch(false);
      } else if (commandResult.commandType === "clear-screen") {
        setTimeout(() => {
          setMessages([]);
          resetNeoSession();
        }, 1600);
      }

      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getNeoAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          try {
            window.open(commandResult.url, "_blank");
          } catch (e) {
            console.error("Failed to open window seamlessly for path:", commandResult.url, e);
          }
        }
      }, 1500);
    } else {
      // 2. Chat / Screenshot analysis via Gemini
      const result = await getNeoResponse(finalTranscript, messagesRef.current, imgData);
      responseText = result.text;
      
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-n", sender: "neo", text: responseText }]);
      
      if (result.toolCall && result.toolCall.name === "send_voice_message") {
        const args = result.toolCall.args;
        const recipient = (args.recipient || "").replace(/[\s\-]/g, "");
        const messageBody = args.message_body || "";
        
        let url = "";
        
        if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(recipient)) {
          url = `mailto:${recipient}?subject=Message%20from%20Neo&body=${encodeURIComponent(messageBody)}`;
        } else {
          url = `https://web.whatsapp.com/send?phone=${recipient}&text=${encodeURIComponent(messageBody)}`;
        }

        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString() + "-tool", sender: "neo", text: `🚀 [Tool Triggered] Opening dispatch to ${args.recipient || recipient}: "${messageBody}"` }
        ]);

        if (!isMuted) {
          setAppState("speaking");
          const audioBase64 = await getNeoAudio(`opening dispatch to send: ${messageBody}`);
          if (audioBase64) {
            await playPCM(audioBase64);
          }
        }

        setTimeout(() => {
          try {
            window.open(url, "_blank");
          } catch (e) {
            console.error("Failed to open window seamlessly for tool dispatch:", url, e);
          }
        }, 1200);

      } else {
        if (!isMuted) {
          setAppState("speaking");
          const audioBase64 = await getNeoAudio(responseText);
          if (audioBase64) {
            await playPCM(audioBase64);
          }
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);



  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetNeoSession();
    } else {
      try {
        setIsSessionActive(true);
        resetNeoSession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url) => {
          if (url === "lock") {
            setIsLocked(true);
          } else if (url === "torch-on") {
            toggleTorch(true);
          } else if (url === "torch-off") {
            toggleTorch(false);
          } else {
            setTimeout(() => {
              try {
                window.open(url, "_blank");
              } catch (e) {
                console.error("Failed to open browser command window seamlessly:", url, e);
              }
            }, 1000);
          }
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleSendMessage = () => {
    if (!msgRecipient.trim()) {
      alert("Please enter a valid recipient phone number or email address!");
      return;
    }

    const recipient = msgRecipient.replace(/[\s\-]/g, "");
    const textEncoded = encodeURIComponent(msgBody.trim());
    let url = "";
    let actionLog = "";

    if (msgType === "whatsapp") {
      url = `https://web.whatsapp.com/send?phone=${recipient}&text=${textEncoded}`;
      actionLog = `Sent WhatsApp message to ${msgRecipient}: "${msgBody}"`;
    } else if (msgType === "whatsapp-call") {
      url = `https://web.whatsapp.com/send?phone=${recipient}`;
      actionLog = `Initiated WhatsApp call to ${msgRecipient}`;
    } else if (msgType === "sms") {
      url = `sms:${recipient}?body=${textEncoded}`;
      actionLog = `Sent SMS message to ${msgRecipient}: "${msgBody}"`;
    } else if (msgType === "email") {
      url = `mailto:${msgRecipient}?subject=Message%20from%20Neo%20Assistant&body=${textEncoded}`;
      actionLog = `Sent Email to ${msgRecipient}: "${msgBody}"`;
    }

    // Add to chat history
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), sender: "user", text: `[Active Task] ${actionLog}` },
      { id: (Date.now() + 1).toString(), sender: "neo", text: `Bilkul, dev! Maine message flow trigger kar diya hai. Opening your message client now.` }
    ]);

    setShowMsgCenter(false);
    // Reset values
    setMsgRecipient("");
    setMsgBody("");

    // Trigger open
    setTimeout(() => {
      try {
        window.open(url, "_blank");
      } catch (e) {
        console.error("Failed to open window seamlessly for direct dispatch center:", url, e);
      }
    }, 800);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() && !selectedImage) return;
    
    handleTextCommand(textInput, selectedImage);
    setTextInput("");
    setSelectedImage(null);
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#020202] text-white flex flex-col items-center justify-center font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Interactive Message Center Modal */}
      <AnimatePresence>
        {showMsgCenter && (
          <div className="absolute inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-950/90 border border-white/10 rounded-[32px] p-6 text-center select-none shadow-3xl text-white relative overflow-hidden pointer-events-auto"
            >
              <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
              
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] tracking-widest font-mono text-blue-400 uppercase font-semibold">Message Center</span>
                <button 
                  onClick={() => setShowMsgCenter(false)}
                  className="text-white/40 hover:text-white text-sm bg-white/5 hover:bg-white/10 rounded-full w-6 h-6 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>

              {/* Message Type Selector Tabs */}
              <div className="grid grid-cols-4 gap-1 bg-white/[0.03] border border-white/5 p-1 rounded-xl mb-4 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => { setMsgType("whatsapp"); setMsgRecipient(""); }}
                  className={`py-1.5 rounded-lg transition-all ${msgType === "whatsapp" ? "bg-green-500/10 text-green-400 font-semibold border border-green-500/20" : "text-zinc-400 hover:text-white"}`}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => { setMsgType("whatsapp-call"); setMsgRecipient(""); }}
                  className={`py-1.5 rounded-lg transition-all ${msgType === "whatsapp-call" ? "bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20" : "text-zinc-400 hover:text-white"}`}
                >
                  WA Call
                </button>
                <button
                  type="button"
                  onClick={() => { setMsgType("sms"); setMsgRecipient(""); }}
                  className={`py-1.5 rounded-lg transition-all ${msgType === "sms" ? "bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20" : "text-zinc-400 hover:text-white"}`}
                >
                  SMS
                </button>
                <button
                  type="button"
                  onClick={() => { setMsgType("email"); setMsgRecipient(""); }}
                  className={`py-1.5 rounded-lg transition-all ${msgType === "email" ? "bg-purple-500/10 text-purple-400 font-semibold border border-purple-500/20" : "text-zinc-400 hover:text-white"}`}
                >
                  Email
                </button>
              </div>

              {/* Form Inputs Container */}
              <div className="text-left space-y-3.5 mb-5">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 font-semibold">
                    {msgType === "email" ? "Recipient Email" : "Recipient Number"}
                  </label>
                  <div className="relative">
                    <input
                      type={msgType === "email" ? "email" : "text"}
                      value={msgRecipient}
                      onChange={(e) => setMsgRecipient(e.target.value)}
                      placeholder={msgType === "email" ? "example@email.com" : "e.g. 919876543210"}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
                      required
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                      {msgType === "email" ? <Mail size={12} /> : msgType === "whatsapp-call" ? <Phone size={12} /> : <Smartphone size={12} />}
                    </div>
                  </div>
                </div>

                {msgType !== "whatsapp-call" && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 font-semibold flex justify-between items-center">
                      <span>Message Body</span>
                      <span className="text-[9px] lowercase font-normal text-zinc-650">templates click karein</span>
                    </label>
                    <textarea
                      value={msgBody}
                      onChange={(e) => setMsgBody(e.target.value)}
                      placeholder="Type your message text here..."
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-650 focus:outline-none focus:border-blue-500/50 resize-none font-sans"
                    />

                    {/* Pre-populated Quick message chips */}
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pt-1.5">
                      {[
                        "Hey, kahan ho?",
                        "Abhi thoda busy hoon, baad mein call karo.",
                        "Neo Assistant is running perfectly!",
                        "Urgently click to open and connect!"
                      ].map((tmpl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setMsgBody(tmpl)}
                          className="px-2 py-1 text-[9px] rounded-lg bg-white/[0.04] border border-white/5 hover:bg-white/10 transition-colors text-zinc-400 whitespace-nowrap shrink-0"
                        >
                          {tmpl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSendMessage}
                  className={`w-full py-2.5 font-semibold rounded-xl text-black transition-all text-sm flex items-center justify-center gap-1.5 shadow-lg active:scale-95 cursor-pointer ${
                    msgType === "whatsapp" 
                      ? "bg-green-400 hover:bg-green-500 shadow-green-500/10" 
                      : msgType === "whatsapp-call"
                      ? "bg-amber-400 hover:bg-amber-500 shadow-amber-500/10"
                      : msgType === "sms"
                      ? "bg-blue-400 hover:bg-blue-500 shadow-blue-500/10"
                      : "bg-purple-400 hover:bg-purple-500 shadow-purple-500/10"
                  }`}
                >
                  {msgType === "whatsapp-call" ? <Phone size={13} /> : <MessageSquare size={13} />}
                  <span>{msgType === "whatsapp-call" ? "Call Now on WhatsApp" : `Send message now`}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Main Sleek Smartphone Frame Mockup */}
      <div className="w-full max-w-md h-full md:h-[92vh] md:max-h-[850px] bg-black md:rounded-[48px] md:border-[10px] md:border-zinc-900 md:shadow-[0_0_80px_rgba(29,78,216,0.25)] flex flex-col justify-between relative overflow-hidden">
        
        {/* Soft Indigo Gradient Glow behind the UI */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[10%] left-[-15%] w-[70%] h-[70%] bg-blue-900/10 blur-[130px] rounded-full" />
          <div className="absolute bottom-[0%] left-[10%] right-[10%] h-[40%] bg-blue-600/15 blur-[100px] rounded-full" />
        </div>

        {/* Lock Screen Overlay */}
        <AnimatePresence>
          {isLocked && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-zinc-950/80 border border-white/5 p-8 rounded-[32px] shadow-3xl max-w-xs relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-blue-500 to-indigo-500" />
                <div className="w-14 h-14 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-5 border border-white/10">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <VolumeX className="w-6 h-6 text-blue-400" />
                  </motion.div>
                </div>
                <h2 className="text-xl font-display font-medium mb-1.5 text-white">Screen Locked</h2>
                <p className="text-zinc-400 mb-6 text-xs leading-relaxed">
                  Neo is resting. Don't touch anything, dev. You might break it.
                </p>
                <div className="text-blue-400 font-mono text-sm mb-6 bg-blue-400/5 py-2.5 rounded-2xl border border-blue-500/20">
                  Unlocking in {lockCountdown}s
                </div>
                <button 
                  onClick={() => setIsLocked(false)}
                  className="w-full py-3.5 bg-white text-black font-semibold rounded-2xl active:scale-95 hover:bg-neutral-100 transition-all font-sans text-sm shadow-lg shadow-white/5"
                >
                  Unlock
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header - Sleek Minimal Floating Profile */}
        <header className="w-full flex justify-between items-center z-20 shrink-0 px-6 pt-6 pb-2 relative pointer-events-auto">
          <div className="flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.06] py-1.5 pl-2.5 pr-4 rounded-full backdrop-blur-md">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-[10px] text-white shadow-md shadow-blue-500/10">
              N
            </div>
            <h1 className="text-sm font-sans font-medium tracking-wider text-white/90">Neo</h1>
          </div>
        </header>

        {/* Main Body Layout */}
        <div className="flex-1 flex flex-col justify-between overflow-hidden z-10 p-5 relative">
          
          {/* Upper Half: Spectacular Pulsing Swirly Energy Orb */}
          <div className="h-[43%] flex items-center justify-center relative select-none">
            <Visualizer state={appState} />
          </div>

          {/* Core Dialogue Greeting Card - Under the Orb exactly like screenshot */}
          <div className="flex-1 flex flex-col items-center justify-start pt-6 px-4 text-center select-none">

            <div className="w-full mt-2 min-h-[90px] flex items-start justify-center">
              <AnimatePresence mode="wait">
                {messages.length > 0 ? (
                  <motion.div
                    key={messages[messages.length - 1].id}
                    initial={{ opacity: 0, scale: 0.98, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-[10px] font-mono tracking-widest uppercase text-blue-400 mb-1">
                      {messages[messages.length - 1].sender === "user" ? "You asked" : "Neo replied"}
                    </span>
                    <p className="text-white text-base font-sans leading-relaxed tracking-wide font-light max-w-xs overflow-hidden text-ellipsis line-clamp-3">
                      "{messages[messages.length - 1].text}"
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="intro"
                    initial={{ opacity: 0, scale: 0.98, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -8 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-[10px] font-mono tracking-widest uppercase text-purple-400 mb-1 font-bold">
                      Interactive Neo AI
                    </span>
                    <p className="text-white/70 text-sm font-sans leading-relaxed tracking-wide font-light max-w-xs">
                      Try saying <span className="text-blue-400 font-medium">"whatsapp message"</span> or attach screenshots! Clear screen anytime with <span className="text-cyan-400 font-medium">"clear screen"</span>.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Chat History View Drawer (Highly functional scroll area) */}
            {messages.length > 0 && (
              <div className="w-full h-[110px] bg-white/[0.02] border border-white/[0.05] rounded-2xl p-3 pr-2 mt-4 text-left pointer-events-auto">
                <div className="h-full overflow-y-auto scrollbar-hide space-y-2.5 font-sans">
                  {messages.map((m) => (
                    <div key={m.id} className="text-xs flex flex-col gap-0.5">
                      <span className={`text-[10px] uppercase font-semibold tracking-widest ${m.sender === 'user' ? 'text-zinc-500' : 'text-blue-400'}`}>
                        {m.sender === 'user' ? 'You' : 'Neo'}
                      </span>
                      <p className="text-white/80 font-light pr-1 break-words">{m.text}</p>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Quick status line */}
          <div className="h-5 flex items-center justify-center select-none text-[10px] tracking-widest uppercase font-mono text-white/20 mb-3">
            {appState === "idle" && "Neo is listening by tap"}
            {appState === "listening" && <span className="text-purple-400 animate-pulse">Neo is listening...</span>}
            {appState === "processing" && <span className="text-cyan-400 animate-pulse">Neo is processing...</span>}
            {appState === "speaking" && <span className="text-blue-400 animate-pulse">Neo is speaking...</span>}
          </div>

        </div>

        {/* Footer Pill Controller Panel */}
        <footer className="w-full p-6 pb-8 pt-2 z-20 shrink-0 pointer-events-auto bg-gradient-to-t from-black via-black/90 to-transparent">
          <input 
            type="file" 
            ref={fileInputRef} 
            accept="image/*" 
            className="hidden" 
            onChange={handleImageSelection} 
          />

          <AnimatePresence>
            {selectedImage && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-24 left-6 right-6 p-2 bg-zinc-950/95 border border-white/10 rounded-2xl flex items-center justify-between gap-3 shadow-2xl z-30 pointer-events-auto backdrop-blur-md"
              >
                <div className="flex items-center gap-2">
                  <img 
                    src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`} 
                    alt="Uploaded Screenshot" 
                    className="w-10 h-10 object-cover rounded-lg border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-left">
                    <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest block font-bold">Screenshot Attached</span>
                    <span className="text-xs text-white max-w-[150px] truncate block font-light">Ready to analyze</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showTextInput && (
              <motion.form 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                onSubmit={handleTextSubmit}
                className="w-full mb-3 flex items-center gap-2 bg-zinc-950/90 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl relative"
              >
                <input 
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type a message to Neo..."
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm py-1.5"
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={!textInput.trim() && !selectedImage}
                  className="p-2.5 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 transition-colors text-white"
                >
                  <Send size={14} />
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Pill Capsule Action Bar exactly matching the user's provided frame */}
          <div className="w-full flex items-center gap-3">
            
            {/* Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/70 hover:bg-white/[0.08] hover:text-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="Upload Screenshot"
            >
              <Image size={18} className="text-blue-400" />
            </button>

            {/* The Glass Capsule Input bar */}
            <div 
              onClick={() => {
                if (!isSessionActive) {
                  setShowTextInput(!showTextInput);
                }
              }}
              className={`flex-1 flex items-center justify-between bg-white/[0.04] border ${showTextInput ? 'border-blue-500/40' : 'border-white/[0.08]'} hover:bg-white/[0.07] px-5 py-3.5 rounded-full backdrop-blur-xl shadow-xl transition-all cursor-pointer`}
            >
              <span className="text-sm text-white/40 font-light select-none">
                {showTextInput ? "Input active..." : isSessionActive ? "Voice stream run..." : "Ask anything..."}
              </span>

              {/* Waveform graphic on the right side of the pill */}
              <div className="flex items-center gap-0.5 h-4 select-none">
                {[1, 2, 3, 4, 5].map((bar) => {
                  let animationDelay = `${bar * 0.15}s`;
                  return (
                    <motion.div
                      key={bar}
                      animate={
                        appState === "listening"
                          ? { height: [5, 16, 5] }
                          : appState === "speaking"
                          ? { height: [3, 20, 3] }
                          : appState === "processing"
                          ? { height: [10, 10, 10] }
                          : { height: [4, 4, 4] }
                      }
                      transition={{
                        duration: appState === "listening" ? 0.6 : appState === "speaking" ? 0.45 : 1,
                        repeat: Infinity,
                        delay: bar * 0.1,
                        ease: "easeInOut"
                      }}
                      className="w-[2px] rounded-full"
                      style={{
                        backgroundColor: appState === "listening" ? "#a855f7" : appState === "speaking" ? "#3b82f6" : appState === "processing" ? "#06b6d4" : "rgba(255, 255, 255, 0.3)"
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Microphone Toggle Button */}
            <button
              onClick={toggleListening}
              className={`
                p-4 rounded-full transition-all duration-300 shadow-2xl relative overflow-hidden group border
                ${
                  isSessionActive
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/50 hover:bg-rose-500/30"
                    : "bg-white/10 text-white border-white/20 hover:scale-105 active:scale-95"
                }
              `}
              title={isSessionActive ? "End Session" : "Start Voice Session"}
            >
              {isSessionActive ? (
                <MicOff size={20} />
              ) : (
                <Mic size={20} className="group-hover:scale-110 transition-transform" />
              )}
            </button>
            
          </div>
        </footer>

      </div>
    </div>
  );
}
