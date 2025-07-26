#!/usr/bin/env python3
"""
Simplified backend server for testing UI fixes
Minimal implementation without audio dependencies
"""

import json
import time
import asyncio
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Request/Response Models
class LLMRequest(BaseModel):
    prompt: str
    model: str = "gemma3n:latest"
    system_prompt: Optional[str] = None

class LLMResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    error: Optional[str] = None
    model: Optional[str] = None
    execution_time: Optional[float] = None

# Initialize FastAPI app
app = FastAPI(
    title="Privacy AI Assistant - Test Backend",
    description="Simplified backend for testing UI fixes",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "message": "Simplified backend is running"
    }

@app.post("/llm/generate", response_model=LLMResponse)
async def generate_llm_response(request: LLMRequest) -> LLMResponse:
    """Generate LLM response (simulated for testing)"""
    try:
        start_time = time.time()
        
        # Simulate processing time
        await asyncio.sleep(0.5)
        
        # Generate a test response based on the prompt
        response_text = generate_test_response(request.prompt, request.system_prompt)
        
        execution_time = time.time() - start_time
        
        return LLMResponse(
            success=True,
            response=response_text,
            model=request.model,
            execution_time=execution_time
        )
        
    except Exception as e:
        return LLMResponse(
            success=False,
            error=str(e),
            model=request.model
        )

def generate_test_response(prompt: str, system_prompt: Optional[str] = None) -> str:
    """Generate a test response for UI testing"""
    
    # Check for system prompt integration
    if system_prompt and "system prompt working" in system_prompt.lower():
        return f"System prompt working: Hello! I received your message: '{prompt}'. The system prompt is functioning correctly."
    
    # Check for counting request
    if "count" in prompt.lower() and any(num in prompt for num in ["1", "2", "3", "4", "5"]):
        return "1\n2\n3\n4\n5\n\nCounting completed successfully!"
    
    # Check for tool context
    if "tool" in prompt.lower() or "context" in prompt.lower():
        return f"I can see you're asking about tools or context. Your message was: '{prompt}'. Tool integration is working!"
    
    # Default response
    return f"Hello! I received your message: '{prompt}'. This is a test response from the simplified backend to verify UI fixes are working correctly. The streaming and message persistence should be functioning properly now."

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Privacy AI Assistant - Simplified Test Backend",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "llm_generate": "/llm/generate"
        }
    }

@app.get("/status")
async def get_status():
    """Get backend status"""
    return {
        "backend": "simplified",
        "version": "1.0.0",
        "features": [
            "LLM response simulation",
            "System prompt testing",
            "CORS enabled",
            "Health checks"
        ],
        "timestamp": time.time()
    }

if __name__ == "__main__":
    print("🚀 Starting Simplified Backend Server for UI Testing...")
    print("📡 Server will be available at: http://127.0.0.1:8000")
    print("🔧 This is a test backend for verifying UI fixes")
    print("=" * 50)
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
        reload=False
    )
