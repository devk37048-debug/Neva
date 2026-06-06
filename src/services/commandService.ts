export function processCommand(command: string): {
  action: string;
  url?: string;
  isBrowserAction: boolean;
  commandType?: string;
} {
  const lowerCmd = command.toLowerCase().trim();

  // 1. Media Search: "Play [song/video] on YouTube"
  const ytMatch = lowerCmd.match(/^play\s+(.+?)\s+on\s+youtube$/);
  if (ytMatch) {
    const query = encodeURIComponent(ytMatch[1].trim());
    return {
      action: `Playing ${ytMatch[1]} on YouTube. Hopefully, your taste isn't as bad as your code, dev.`,
      url: `https://www.youtube.com/results?search_query=${query}`,
      isBrowserAction: true,
    };
  }

  // 2. Media Search: "Search [query] on Spotify"
  const spotifyMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = encodeURIComponent(spotifyMatch[1].trim());
    return {
      action: `Searching ${spotifyMatch[1]} on Spotify. Please, not another cringe song!`,
      url: `https://open.spotify.com/search/${query}`,
      isBrowserAction: true,
    };
  }

  // 3. WhatsApp Web Functions: Message & Calling (English & Hindi support)

  // A. Determine if it's a WhatsApp Call command
  let isWaCall = false;
  let callNumber = "";

  // Precise Matches for Calls
  // English: "whatsapp call to 9876543210", "make a whatsapp call to +919999999999", "call 9876543210 on whatsapp"
  const waCallEngA = lowerCmd.match(/^(?:make\s+)?(?:a\s+)?whatsapp\s+(?:voice\s+|video\s+)?call\s*(?:to)?\s*([\d\+\s\-]{7,15})$/);
  const waCallEngB = lowerCmd.match(/^call\s+([\d\+\s\-]{7,15})\s+(?:on\s+)?whatsapp$/);
  
  // Hindi/Hinglish: "9876543210 ko whatsapp call karo", "9999999999 par whatsapp call lagao"
  const waCallHinA = lowerCmd.match(/^([\d\+\s\-]{7,15})\s+(?:ko|par)\s+whatsapp\s+(?:voice\s+|video\s+)?call\s*(?:karo|lagao|milao|kijiye|kar|de)?$/);
  
  if (waCallEngA) {
    isWaCall = true;
    callNumber = waCallEngA[1].replace(/[\s\-]/g, "");
  } else if (waCallEngB) {
    isWaCall = true;
    callNumber = waCallEngB[1].replace(/[\s\-]/g, "");
  } else if (waCallHinA) {
    isWaCall = true;
    callNumber = waCallHinA[1].replace(/[\s\-]/g, "");
  } else if (lowerCmd.includes("whatsapp") && (lowerCmd.includes("call") || lowerCmd.includes("lagao") || lowerCmd.includes("milao") || lowerCmd.includes("connect"))) {
    // Fallback heuristic for call containing a number
    const numMatch = lowerCmd.match(/(\+?[\d\s\-]{7,15})/);
    if (numMatch) {
      isWaCall = true;
      callNumber = numMatch[1].replace(/[\s\-]/g, "");
    }
  }

  if (isWaCall && callNumber) {
    return {
      action: `WhatsApp call lagane ki koshish kar rahi hoon to ${callNumber}. Ab unhe directly pareshaan karo, dev! Opening the chat... just click the call icon at the top right.`,
      url: `https://web.whatsapp.com/send?phone=${callNumber}`,
      isBrowserAction: true,
      commandType: "whatsapp-call"
    };
  }

  // B. WhatsApp Messages
  // English: "send a whatsapp message to 9876543210 saying Hello", "whatsapp message to 9999999999 saying kya haal hai"
  const waMsgEng = lowerCmd.match(/^(?:send\s+)?(?:a\s+)?whatsapp\s+(?:message|msg|text)?\s*(?:to)?\s*([\d\+\s\-]{7,15})\s+(?:saying|with|text|ki)?\s+(.+)$/);
  
  // Hindi/Hinglish: "9876543210 ko whatsapp message bhejo saying Hello", "9999999999 par whatsapp karo Hello"
  const waMsgHin = lowerCmd.match(/^([\d\+\s\-]{7,15})\s+(?:ko|par)\s+(?:whatsapp\s+(?:message\s+bhejo|message\s+karo|karo|msg\s+bhejo|bhejo)|whatsapp)\s*(?:saying|with|text|ki)?\s*(.+)$/);

  // Fallback heuristic for messages
  let waMsgMatched = false;
  let msgNumber = "";
  let msgContent = "";

  if (waMsgEng) {
    waMsgMatched = true;
    msgNumber = waMsgEng[1].replace(/[\s\-]/g, "");
    msgContent = waMsgEng[2].trim();
  } else if (waMsgHin) {
    waMsgMatched = true;
    msgNumber = waMsgHin[1].replace(/[\s\-]/g, "");
    msgContent = waMsgHin[2].trim();
  } else if (lowerCmd.includes("whatsapp") && (lowerCmd.includes("message") || lowerCmd.includes("msg") || lowerCmd.includes("bhejo") || lowerCmd.includes("chat") || lowerCmd.includes("text"))) {
    const numMatch = lowerCmd.match(/(\+?[\d\s\-]{7,15})/);
    if (numMatch) {
      msgNumber = numMatch[1].replace(/[\s\-]/g, "");
      // Extract what follows the number or key phrases
      const afterNum = lowerCmd.split(numMatch[1])[1] || "";
      const cleanedAfter = afterNum.replace(/^(?:\s*(?:ko|par|saying|text|with|message|msg|bhejo|karo|ki))+\s*/i, "").trim();
      if (cleanedAfter) {
        waMsgMatched = true;
        msgContent = cleanedAfter;
      }
    }
  }

  if (waMsgMatched && msgNumber && msgContent) {
    return {
      action: `Sending WhatsApp message to ${msgNumber}. Let's hope they don't block you immediately for this text, dev.`,
      url: `https://web.whatsapp.com/send?phone=${msgNumber}&text=${encodeURIComponent(msgContent)}`,
      isBrowserAction: true,
      commandType: "whatsapp-msg"
    };
  }

  // C. SMS Message Parsing
  // English: "send sms to 9876543210 saying Hello"
  const smsMsgEng = lowerCmd.match(/^(?:send\s+)?(?:an\s+)?sms\s*(?:to)?\s*([\d\+\s\-]{7,15})\s+(?:saying|with|text|ki)\s+(.+)$/);
  // Hindi: "9876543210 par sms bhejo saying Hello"
  const smsMsgHin = lowerCmd.match(/^([\d\+\s\-]{7,15})\s+(?:ko|par)\s+(?:sms\s+bhejo|sms\s+karo|sms)\s*(?:saying|with|text|ki)?\s*(.+)$/);

  let smsMsgMatched = false;
  let smsNumber = "";
  let smsContent = "";

  if (smsMsgEng) {
    smsMsgMatched = true;
    smsNumber = smsMsgEng[1].replace(/[\s\-]/g, "");
    smsContent = smsMsgEng[2].trim();
  } else if (smsMsgHin) {
    smsMsgMatched = true;
    smsNumber = smsMsgHin[1].replace(/[\s\-]/g, "");
    smsContent = smsMsgHin[2].trim();
  }

  if (smsMsgMatched && smsNumber && smsContent) {
    return {
      action: `SMS client open kar rahi hoon to send "${smsContent}" to ${smsNumber}.`,
      url: `sms:${smsNumber}?body=${encodeURIComponent(smsContent)}`,
      isBrowserAction: true,
      commandType: "sms"
    };
  }

  // D. Email Parsing
  // English: "send email to address@gmail.com saying Hello"
  const emailMsgEng = lowerCmd.match(/^(?:send\s+)?(?:an\s+)?email\s*(?:to)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s+(?:saying|with|text|ki|subject)?\s+(.+)$/);
  if (emailMsgEng) {
    const emailAddr = emailMsgEng[1].trim();
    const emailBody = emailMsgEng[2].trim();
    return {
      action: `Email client open kar rahi hoon with your message to ${emailAddr}.`,
      url: `mailto:${emailAddr}?subject=Message%20from%20Neo%20Assistant&body=${encodeURIComponent(emailBody)}`,
      isBrowserAction: true,
      commandType: "email"
    };
  }

  // Clear Screen / Reset Chat (English & Hindi)
  if (
    lowerCmd === "clear screen" || 
    lowerCmd === "clear" || 
    lowerCmd === "clearchat" || 
    lowerCmd === "clear chat" || 
    lowerCmd === "reset chat" || 
    lowerCmd === "screen clear" ||
    lowerCmd === "saaf karo" ||
    lowerCmd === "khali karo" ||
    lowerCmd.includes("screen saaf") ||
    lowerCmd.includes("chat clear") ||
    lowerCmd.includes("clear history")
  ) {
    return {
      action: "Screen bilkul saaf kar rahi hoon dev! Zero traces left.",
      isBrowserAction: true,
      commandType: "clear-screen"
    };
  }

  // 4. Lock/Unlock Screen
  if (lowerCmd.includes("lock") || lowerCmd.includes("band kar") || lowerCmd.includes("screen off")) {
    return {
      action: "Screen lock kar rahi hoon. Ab clumsy mat banna, dev!",
      isBrowserAction: true,
      commandType: "lock"
    };
  }

  // 5. Torch/Flashlight
  if (lowerCmd.includes("torch on") || lowerCmd.includes("flashlight on") || lowerCmd.includes("light on") || lowerCmd.includes("jalado")) {
    return {
      action: "Torch on kar rahi hoon. Use that light to find some better code, dev.",
      isBrowserAction: true,
      commandType: "torch-on"
    };
  }

  if (lowerCmd.includes("torch off") || lowerCmd.includes("flashlight off") || lowerCmd.includes("light off") || lowerCmd.includes("bhujao")) {
    return {
      action: "Torch off! Back to the darkness where you belong, dev.",
      isBrowserAction: true,
      commandType: "torch-off"
    };
  }

  // 6. Direct Domain/URL match (e.g. "google.com", "https://chess.com/play", "github.com")
  const directUrlMatch = lowerCmd.match(/^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/\S*)?)$/);
  if (directUrlMatch) {
    const rawDomain = directUrlMatch[0];
    let url = rawDomain;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    return {
      action: `Opening ${rawDomain} for you. Ek toh kaam mujhse hi karwana hota hai, dev...`,
      url: url,
      isBrowserAction: true,
    };
  }

  // 7. English command prefixes to open any arbitrary website
  const actionPrefixes = [
    "open ", "go to ", "goto ", "browse ", "visit ", "launch ", "show ", "start "
  ];
  for (const prefix of actionPrefixes) {
    if (lowerCmd.startsWith(prefix)) {
      const targetSite = lowerCmd.substring(prefix.length).trim();
      if (targetSite) {
        let cleanWebsite = targetSite.replace(/^(?:the\s+)?(?:website\s+)?/, "").trim();
        
        if (cleanWebsite.startsWith("about:") || cleanWebsite === "about:blank") {
          return {
            action: `Opening ${cleanWebsite} for you. Chalo ab safe search karo, dev!`,
            url: cleanWebsite,
            isBrowserAction: true,
          };
        }

        let domain = cleanWebsite.replace(/\s+/g, "");
        if (!domain.includes(".")) {
          domain += ".com";
        }
        const url = (domain.startsWith("http://") || domain.startsWith("https://")) 
          ? domain 
          : `https://${domain}`;
        return {
          action: `Opening ${cleanWebsite} for you. Ugh, always making me do your browsing, dev...`,
          url: url,
          isBrowserAction: true,
        };
      }
    }
  }

  // 8. Hindi/Hinglish command suffixes (e.g., "google kholo", "netflix open karo", "facebook pe jao")
  const hindiVerbs = [
    "kholo", "khol do", "khol de", "kholna", "kholiye",
    "open kar", "open karo", "open kijiye", "open kar do", "open kar de",
    "par jao", "pe jao", "de par jao", "par chala jao",
    "chalao", "dikhao", "start kar", "start karo", "launch kar", "launch karo"
  ];
  
  // Sort longer phrases first
  const sortedHindiVerbs = [...hindiVerbs].sort((a, b) => b.length - a.length);
  
  for (const verb of sortedHindiVerbs) {
    if (lowerCmd.endsWith(" " + verb) || lowerCmd.endsWith(verb)) {
      let targetSite = "";
      if (lowerCmd.endsWith(" " + verb)) {
        targetSite = lowerCmd.substring(0, lowerCmd.length - verb.length - 1).trim();
      } else {
        targetSite = lowerCmd.substring(0, lowerCmd.length - verb.length).trim();
      }
      
      if (targetSite) {
        let cleanWebsite = targetSite.replace(/^(?:the\s+)?(?:website\s+)?/, "").trim();
        
        if (cleanWebsite.startsWith("about:") || cleanWebsite === "about:blank") {
          return {
            action: `Opening ${cleanWebsite} for you. Chalo ab safe search karo, dev!`,
            url: cleanWebsite,
            isBrowserAction: true,
          };
        }

        let domain = cleanWebsite.replace(/\s+/g, "");
        if (!domain.includes(".")) {
          domain += ".com";
        }
        const url = (domain.startsWith("http://") || domain.startsWith("https://")) 
          ? domain 
          : `https://${domain}`;
        return {
          action: `Opening ${cleanWebsite} for you. Chalo ab aish karo, dev!`,
          url: url,
          isBrowserAction: true,
        };
      }
    }
  }

  return { action: "", isBrowserAction: false };
}
