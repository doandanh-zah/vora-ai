import os
import argparse
import pyaudio
import numpy as np
import time
import sys
from openwakeword.model import Model

FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
CHUNK = 1280

def main():
    parser = argparse.ArgumentParser(description="VORA AI Wake Word - OpenWakeWord Engine")
    parser.add_argument("--model", type=str, default="hey_vora.onnx", help="Wake word model path or name")
    parser.add_argument("--threshold", type=float, default=0.5, help="Detection threshold")
    args = parser.parse_args()

    # Disable stdout buffering to ensure Node.js sidecar receives events immediately
    sys.stdout.reconfigure(line_buffering=True)
    
    # Initialize the openWakeWord model
    try:
        owwModel = Model(wakeword_models=[args.model], inference_framework="onnx")
    except Exception as e:
        print(f"ERROR: Failed to load model {args.model}: {e}")
        return

    print("READY", flush=True)

    audio = pyaudio.PyAudio()
    
    try:
        mic_stream = audio.open(
            format=FORMAT, 
            channels=CHANNELS, 
            rate=RATE, 
            input=True, 
            frames_per_buffer=CHUNK
        )
    except Exception as e:
        print(f"ERROR: Failed to open microphone: {e}")
        return

    last_detection_time = 0
    loop_counter = 0

    try:
        while True:
            # Read audio chunk
            data = mic_stream.read(CHUNK, exception_on_overflow=False)
            audio_data = np.frombuffer(data, dtype=np.int16)
            
            # Predict
            prediction = owwModel.predict(audio_data)
            
            # Calculate and output Volume level for visual indicator (every 5 loops = ~400ms)
            loop_counter += 1
            if loop_counter % 5 == 0:
                rms = np.sqrt(np.mean(np.square(audio_data, dtype=np.float32)))
                # Int16 max is 32768. We multiply by a sensitivity factor (e.g. 15) to make standard speech visible
                vol = min(100, int((rms / 32768.0) * 100 * 15))
                print(f"VOLUME:{vol}", flush=True)

            # Since openwakeword evaluates 80ms chunks, tracking time here guarantees latency measurement.
            current_time = time.time()
            for mdl, score in prediction.items():
                if score > args.threshold:
                    if current_time - last_detection_time > 1.0: # 1 sec debounce
                        print(f"TRIGGER:{mdl}:{score:.2f}:{current_time}", flush=True)
                        last_detection_time = current_time
                        
    except KeyboardInterrupt:
        pass
    finally:
        mic_stream.stop_stream()
        mic_stream.close()
        audio.terminate()

if __name__ == "__main__":
    main()
