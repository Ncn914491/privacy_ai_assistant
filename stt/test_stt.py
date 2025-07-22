import os
from stt import STT

# Create a dummy hello.wav for testing
import wave
import numpy as np

with wave.open("hello.wav", "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(16000)
    wf.writeframes(np.zeros(16000, dtype=np.int16).tobytes())


model_path = "../models/vosk/vosk-model-small-en-us-0.15"
stt = STT(model_path)

result = stt.transcribe("hello.wav")

if result["success"]:
    print(f"Transcription: {result['text']}")
else:
    print(f"Error: {result['error']}")
