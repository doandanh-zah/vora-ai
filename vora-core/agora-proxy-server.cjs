const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://'],
    credentials: true
}));

app.use(express.json());

// Proxy endpoint for Agora Conversational AI Engine
app.post('/proxy/agora-join', async (req, res) => {
    try {
        const { appId, appCert, channelName, customerName, llmUrl, llmKey, ttsVendor, ttsKey } = req.body;
        
        console.log('=== AGORA PROXY REQUEST ===');
        console.log('App ID:', appId);
        console.log('Channel:', channelName);
        console.log('Agent:', customerName);
        
        // Create basic auth
        const auth = Buffer.from(`${appId}:${appCert || ''}`).toString('base64');
        
        const payload = {
            name: customerName,
            properties: {
                channel: channelName,
                token: "", // Let Agora generate token
                agent_rtc_uid: "0",
                remote_rtc_uids: ["1002"],
                enable_string_uid: false,
                idle_timeout: 60,
                llm: {
                    url: llmUrl,
                    api_key: llmKey,
                    system_messages: [
                        {
                            role: "system",
                            content: "You are VORA, a helpful AI assistant. Be concise and natural. Use short sentences. Answer directly without formal openings. Keep responses under 2-3 sentences."
                        }
                    ],
                    greeting_message: "Hello! I'm VORA, how can I help you today?",
                    failure_message: "Sorry, I didn't understand that. Could you please repeat?",
                    max_history: 10,
                    params: {
                        model: "llama-3.1-8b-instant",
                        temperature: 0.9,
                        max_tokens: 100
                    }
                },
                tts: {
                    vendor: ttsVendor,
                    params: ttsVendor === 'microsoft' ? {
                        key: ttsKey,
                        region: "eastus",
                        voice_name: "en-US-AriaNeural"
                    } : ttsVendor === 'hume' ? {
                        key: ttsKey
                    } : ttsVendor === 'openai' ? {
                        key: ttsKey,
                        model: "tts-1-hd"
                    } : ttsVendor === 'elevenlabs' ? {
                        key: ttsKey,
                        voice_id: "rachel"
                    } : {}
                }
            }
        };
        
        console.log('Sending to Agora:', JSON.stringify(payload, null, 2));
        
        const response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        console.log('Agora response:', data);
        
        res.json(data);
        
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/proxy/agora-leave/:agentId', async (req, res) => {
    try {
        const { appId, appCert, agentId } = req.params;
        const { agentId: actualAgentId } = req.params;
        
        console.log('=== AGORA LEAVE REQUEST ===');
        console.log('Agent ID:', actualAgentId);
        
        const auth = Buffer.from(`${appId}:${appCert || ''}`).toString('base64');
        
        const response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${actualAgentId}/leave`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('Agora leave response:', data);
        
        res.json(data);
        
    } catch (error) {
        console.error('Leave proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Agora Proxy Server running on http://localhost:${PORT}`);
    console.log('📋 Update your frontend to use: http://localhost:${PORT}/proxy/agora-join');
});
