const http = require('http');
const url = require('url');

const PORT = 3001;

// Simple HTTP server for Agora proxy
const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.method === 'POST' && req.url === '/proxy/agora-join') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { appId, appCert, channelName, customerName, llmUrl, llmKey, ttsVendor, ttsKey } = data;
                
                console.log('=== AGORA PROXY REQUEST ===');
                console.log('App ID:', appId);
                console.log('Channel:', channelName);
                console.log('Agent:', customerName);
                
                // Create basic auth
                const auth = Buffer.from(`${appId}:${appCert || ''}`).toString('base64');
                
                // Build Agora payload
                const payload = {
                    name: customerName,
                    properties: {
                        channel: channelName,
                        token: "",
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
                                    content: "You are VORA, a helpful AI assistant. Be concise and natural. Use short sentences. Answer directly without formal openings. Use contractions. Sound like you're talking, not writing. Keep responses under 2-3 sentences."
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
                
                // Call Agora API
                const https = require('https');
                const url = require('url');
                
                const parsedUrl = url.parse(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`);
                
                const postData = JSON.stringify(payload);
                
                const options = {
                    hostname: 'api.agora.io',
                    port: 443,
                    path: `/api/conversational-ai-agent/v2/projects/${appId}/join`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            console.log('Agora response:', result);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(result));
                        } catch (e) {
                            console.error('Parse error:', e);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Parse error' }));
                        }
                    });
                });
                
                req.on('error', (e) => {
                    console.error('Request error:', e);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                });
                
                req.write(postData);
                req.end();
                
            } catch (error) {
                console.error('Proxy error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }
    
    if (req.method === 'POST' && req.url.startsWith('/proxy/agora-leave/')) {
        const agentId = req.url.split('/').pop();
        
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { appId, appCert } = data;
                
                console.log('=== AGORA LEAVE REQUEST ===');
                console.log('Agent ID:', agentId);
                
                const auth = Buffer.from(`${appId}:${appCert || ''}`).toString('base64');
                
                const fetch = require('node-fetch');
                const response = await fetch(`https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const result = await response.json();
                console.log('Agora leave response:', result);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                
            } catch (error) {
                console.error('Leave proxy error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Agora Proxy Server running on http://localhost:${PORT}`);
    console.log('📋 Update your frontend to use: http://localhost:${PORT}/proxy/agora-join');
    console.log('🎯 Ready for Agora Conversational AI Engine!');
});
