#!/usr/bin/env python3
"""
Simple backend server startup script
"""

import uvicorn
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("🚀 Starting Privacy AI Assistant Backend Server...")
    
    try:
        uvicorn.run(
            "python_backend_server:app",
            host="127.0.0.1",
            port=8000,
            reload=False,
            log_level="info"
        )
    except Exception as e:
        logger.error(f"❌ Failed to start server: {e}")
        raise
