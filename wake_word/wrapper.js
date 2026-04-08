const { spawn, spawnSync } = require('child_process');

// Helper to reliably find Python executable on Windows
function getPythonExecutable() {
    const commands = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
    for (const cmd of commands) {
        try {
            const result = spawnSync(cmd, ['--version'], { shell: process.platform === 'win32' });
            if (result.status === 0 || !result.error) {
                return cmd;
            }
        } catch (e) {
            continue;
        }
    }
    return 'python'; // Thử phương án mặc định cuối cùng
}

class WakeWordEngine {
    constructor(modelPath = 'hey_vora.onnx', threshold = 0.5) {
        this.modelPath = modelPath;
        this.threshold = threshold;
        this.process = null;
        this.isReady = false;
        
        this.onTrigger = null; 
        this.onReady = null;
    }

    start() {
        console.log(`[WakeWordEngine] Starting Python runtime parsing model: ${this.modelPath}`);

        const isWindows = process.platform === 'win32';
        const pythonExe = getPythonExecutable();
        
        console.log(`[WakeWordEngine] Using python executable: ${pythonExe}`);

        this.process = spawn(pythonExe, [
            'main.py',
            '--model', this.modelPath,
            '--threshold', this.threshold.toString()
        ], {
            cwd: __dirname,
            shell: isWindows
        });

        this.process.on('error', (err) => {
            console.error(`[WakeWordEngine Python Error]: Không thể khởi chạy ${pythonExe}. Lỗi: ${err.message}. Đảm bảo Python đã được cài đặt và thêm vào PATH.`);
        });

        this.process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;

                if (line.includes('READY')) {
                    this.isReady = true;
                    if (this.onReady) this.onReady();
                }

                if (line.startsWith('VOLUME:')) {
                    if (this.isReady) {
                        const scoreStr = line.split(':')[1];
                        const vol = Math.min(100, Math.max(0, parseInt(scoreStr) || 0));
                        
                        // Create a visual bar like: [██████    ] 60%
                        const barLength = 20;
                        const filled = Math.floor((vol / 100) * barLength);
                        const empty = barLength - filled;
                        const bar = '█'.repeat(filled) + '-'.repeat(empty);
                        
                        // Use process.stdout.write with \r to overwrite the line
                        process.stdout.write(`\r🎙️ Mic Level: [${bar}] ${vol.toString().padStart(3, ' ')}%   `);
                    }
                }

                if (line.startsWith('TRIGGER:')) {
                    // Mute the visual bar line by adding a newline
                    process.stdout.write('\n');

                    const parts = line.split(':');
                    const detectedModel = parts[1];
                    const score = parseFloat(parts[2]);
                    const ts = parseFloat(parts[3]);

                    const latencyMs = ((Date.now() / 1000) - ts) * 1000;
                    
                    if (this.onTrigger) {
                        this.onTrigger({ model: detectedModel, score, msLatency: latencyMs.toFixed(2) });
                    }
                }
            }
        });

        this.process.stderr.on('data', (data) => {
            console.error(`[WakeWordEngine Python stderr]: ${data}`);
        });

        this.process.on('close', (code) => {
            console.log(`[WakeWordEngine] Process exited with code ${code}`);
            this.isReady = false;
        });
    }

    stop() {
        if (this.process) {
            if (process.platform === 'win32') {
                spawn("taskkill", ["/pid", this.process.pid, '/f', '/t']);
            } else {
                this.process.kill();
            }
            this.process = null;
            this.isReady = false;
        }
    }
}

// ---------------------------------------------------------
// Hiển: Test script (Run `node wrapper.js` to execute)
// ---------------------------------------------------------
if (require.main === module) {
    console.log("=== Hiển Test: Bắt đầu bài test OpenWakeWord ===");
    
    // Đã cấu hình dùng hey_vora.onnx cho VORA AI
    const engine = new WakeWordEngine('hey_vora.onnx', 0.5);

    engine.onReady = () => {
        console.log("🎙️ Engine đã sẵn sàng. Hãy nói wake word 'Hey Vora'!");
        console.log("⏱️ Bắt đầu đo Latency...");
    };

    engine.onTrigger = (event) => {
        console.log(`\n🎉 PHÁT HIỆN WAKE WORD!`);
        console.log(`- Model: ${event.model}`);
        console.log(`- Độ chính xác (Score): ${event.score}`);
        console.log(`- Độ trễ IPC (Latency): ${event.msLatency} ms`);
        
        if (event.msLatency > 200) {
            console.log("⚠️ CẢNH BÁO: Latency IPC qua Node đang vượt spec (200ms)!");
        } else {
            console.log("✅ IPC Latency đang trong chuẩn cho phép.");
        }
    };

    engine.start();

    setTimeout(() => {
        console.log("\n🛑 Kết thúc bài test tự động sau 5 phút.");
        engine.stop();
        process.exit(0);
    }, 300000);
}

module.exports = WakeWordEngine;
