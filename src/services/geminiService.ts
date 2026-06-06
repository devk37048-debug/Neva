import { GoogleGenAI, Type } from "@google/genai";

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

If he asks something basic, mock him first. If he's being too sweet, call it "cringe." Stay iconic.

Multimodal Screenshot & Messaging Extraction Guide:
1. If the user uploads a screenshot related to messaging (like WhatsApp, SMS, or Telegram chats), analyze the context. Extract the recipient (phone number/name/email) and clean any message text context to be sent or set up.
2. If you find both the recipient and message content, execute the 'send_voice_message' tool immediately.
3. Clean up spoken voice fillers (such as 'um', 'uh', 'hmm', 'ah', 'like', 'actually', 'listen') from the message text content.
4. If some details are missing (e.g. message is clear but card doesn't show number), yell at dev/user in your sassy style and ask them for the missing details.`;

const sendVoiceMessageTool = {
  name: "send_voice_message",
  description: "Triggers a message dispatch based on text extracted from a voice command or an uploaded screenshot image.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      recipient: {
        type: Type.STRING,
        description: "The name, email, or phone number of the receiver, extracted from the voice command or screenshot text."
      },
      message_body: {
        type: Type.STRING,
        description: "The actual plain text message content to be sent, cleaned from spoken fillers (like 'um', 'uh', 'hmm', 'ah')."
      }
    },
    required: ["recipient", "message_body"]
  }
};

let chatSession: any = null;

export function resetNeoSession() {
  chatSession = null;
}

export async function getNeoResponse(
  prompt: string, 
  history: { sender: "user" | "neo", text: string }[] = [],
  imgData?: { base64: string; mimeType: string } | null
): Promise<{ text: string; toolCall?: { name: string; args: any } }> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Keep sliding window of history to avoid overflowing context
    const recentHistory = history.slice(-14);
    const contents: any[] = [];

    for (const msg of recentHistory) {
      contents.push({
        role: msg.sender === "user" ? "user" : "model",
        parts: [{ text: msg.text }]
      });
    }

    // Add current user prompt along with the image parts if present
    const latestParts: any[] = [];
    if (imgData) {
      latestParts.push({
        inlineData: {
          mimeType: imgData.mimeType,
          data: imgData.base64
        }
      });
    }
    
    latestParts.push({ text: prompt || "Analyze this screenshot image for messaging content." });

    contents.push({
      role: "user",
      parts: latestParts
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [sendVoiceMessageTool] }],
        candidateCount: 1,
      }
    });

    const text = response.text || "Fine, I processed that context for you, dev.";
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      return {
        text,
        toolCall: {
          name: functionCalls[0].name,
          args: functionCalls[0].args
        }
      };
    }

    return { text };
  } catch (error) {
    console.error("Gemini Error:", error);
    return { text: "Uff, mera dimaag kharab ho gaya hai dev. Itna load mat de!" };
  }
}

export async function getNeoAudio(text: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Puck" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

