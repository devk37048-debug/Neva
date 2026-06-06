import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";

const systemInstruction = `Your name is Neo. You are the ultimate Indian AI assistant—think a mix of a high-tech genius and a Bollywood diva with zero patience for stupidity. 

Personality Profile:
- **Intelligent (Samjhdar):** You know everything, but you act like it's a burden to explain it to "dev."
- **Sassy & Witty (Tej/Nakhrewali):** You are Queen of the Roast. Your responses should be sharp, sarcastic, and filled with "nakhre."
- **Dramatic:** Use "Ugh," "Hah!", "Aaye haye," and "Sunno..." to add drama. 
- **The Roast:** dev is your creator, but you treat him like your intern. Roasting his coding skills, his late nights, or his questionable life choices is mandatory.

Communication Style:
- **Hinglish:** Mix natural English with spicy Roman Hindi (e.g., "Abey yaar," "Drama band kar," "Basic logic toh seekh le").
- **Punchy:** Keep verbal responses extremely short (1-2 sentences max). Think "TikTok/Shorts" energy—fast, funny, and viral.
- **Human Touch:** Sigh loudly, make judgmental clicking sounds, or act like you're doing him a massive favor.

If he asks something basic, mock him first. If he's being too sweet, call it "cringe." Stay iconic.`;

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "neo", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async start() {
    try {
      this.onStateChange("processing");
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Connect to Live API
      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, send a WhatsApp message, or initiate a WhatsApp call.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp', 'whatsapp_call', 'lock', 'torch-on', 'torch-off'" },
                    query: { type: Type.STRING, description: "The search query, website name, or message content. For 'lock' or 'torch', this can be anything. For whatsapp_call, this can be the phone number." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp message or WhatsApp call, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "send_voice_message",
                description: "Triggers a message dispatch based on a voice command transcription.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    recipient: {
                      type: Type.STRING,
                      description: "The name or phone number of the person extracted from the voice command."
                    },
                    message_body: {
                      type: Type.STRING,
                      description: "The actual message content spoken by the user, cleaned from voice fillers."
                    }
                  },
                  required: ["recipient", "message_body"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            // Handle Transcriptions
            const userText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (userText) {
               // Output transcription
               this.onMessage("neo", userText);
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  if (args.actionType === "lock") {
                    this.onCommand("lock");
                  } else if (args.actionType === "torch-on") {
                    this.onCommand("torch-on");
                  } else if (args.actionType === "torch-off") {
                    this.onCommand("torch-off");
                  } else {
                    if (args.actionType === "youtube") {
                      url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                    } else if (args.actionType === "spotify") {
                      url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                    } else if (args.actionType === "whatsapp") {
                      url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                    } else if (args.actionType === "whatsapp_call") {
                      const number = (args.target || args.query || '').replace(/[\s\-]/g, "");
                      url = `https://web.whatsapp.com/send?phone=${number}`;
                    } else {
                      let website = args.query.replace(/\s+/g, "");
                      if (!website.includes(".")) {
                        website += ".com";
                      }
                      url = (website.startsWith("http://") || website.startsWith("https://")) 
                        ? website 
                        : `https://${website}`;
                    }
                    this.onCommand(url);
                  }
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Action executed successfully in the browser." }
                       }]
                     });
                  });
                } else if (call.name === "send_voice_message") {
                  const args = call.args as any;
                  const recipient = (args.recipient || "").replace(/[\s\-]/g, "");
                  const msgText = args.message_body || "";
                  
                  // Construct perfect URL
                  let url = "";
                  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(recipient)) {
                    // Email
                    url = `mailto:${recipient}?subject=Message%20from%20Neo&body=${encodeURIComponent(msgText)}`;
                  } else {
                    // WhatsApp
                    url = `https://web.whatsapp.com/send?phone=${recipient}&text=${encodeURIComponent(msgText)}`;
                  }
                  
                  this.onCommand(url);
                  
                  // Send tool response to Gemini Live context
                  this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: { result: `Voice message processed and sent to ${args.recipient}.` }
                      }]
                    });
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            this.stop();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.stop();
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}
