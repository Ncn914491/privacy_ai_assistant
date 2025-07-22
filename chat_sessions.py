#!/usr/bin/env python3
"""
🗨️ Chat Session Management Module for Privacy AI Assistant

This module handles:
- Chat session CRUD operations
- Message history management
- Session persistence to JSON files
- Context window management
- Token counting and optimization

Architecture:
- ChatSession: Core session data model
- ChatMessage: Individual message model
- ChatSessionManager: Main management class
- File-based persistence in /chats/ directory
"""

import json
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from pydantic import BaseModel, Field
import re
from token_counter import create_context_builder, estimate_tokens, ContextBuilder

# Setup logging
logger = logging.getLogger(__name__)

# Configuration
CHATS_DIR = Path("chats")
CHATS_DIR.mkdir(exist_ok=True)
MAX_CONTEXT_TOKENS = 4096  # Default context window size
TOKEN_ESTIMATION_RATIO = 1.3  # Approximate tokens per word

# ===== PYDANTIC MODELS FOR API =====

class ChatMessage(BaseModel):
    """Individual chat message model."""
    id: str = Field(default_factory=lambda: f"msg_{uuid.uuid4().hex[:12]}")
    content: str
    role: str = Field(..., pattern="^(user|assistant|system)$")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    token_count: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None

class ChatSessionMetadata(BaseModel):
    """Metadata for chat sessions."""
    model: Optional[str] = "gemma3n:latest"
    token_count: Optional[int] = 0
    message_count: Optional[int] = 0
    last_activity: Optional[datetime] = None
    tags: Optional[List[str]] = []
    is_archived: Optional[bool] = False

class ChatSession(BaseModel):
    """Complete chat session model."""
    id: str = Field(default_factory=lambda: f"chat_{uuid.uuid4().hex[:12]}")
    title: str
    messages: List[ChatMessage] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Optional[ChatSessionMetadata] = Field(default_factory=ChatSessionMetadata)

    def update_metadata(self):
        """Update session metadata based on current state."""
        if not self.metadata:
            self.metadata = ChatSessionMetadata()
        
        self.metadata.message_count = len(self.messages)
        self.metadata.last_activity = datetime.now(timezone.utc)
        self.metadata.token_count = sum(msg.token_count or 0 for msg in self.messages)
        self.updated_at = datetime.now(timezone.utc)

class ChatSessionSummary(BaseModel):
    """Lightweight session summary for listing."""
    id: str
    title: str
    message_count: int
    last_activity: datetime
    created_at: datetime
    is_archived: Optional[bool] = False

# ===== REQUEST/RESPONSE MODELS =====

class CreateChatRequest(BaseModel):
    title: Optional[str] = None

class CreateChatResponse(BaseModel):
    chat_id: str
    title: str
    success: bool
    error: Optional[str] = None

class RenameChatRequest(BaseModel):
    chat_id: str
    new_title: str

class AddMessageRequest(BaseModel):
    chat_id: str
    content: str
    role: str = Field(..., pattern="^(user|assistant|system)$")
    model: Optional[str] = "gemma3n:latest"

class ChatListResponse(BaseModel):
    sessions: List[ChatSessionSummary]
    success: bool
    error: Optional[str] = None

class ChatSessionResponse(BaseModel):
    session: Optional[ChatSession] = None
    success: bool
    error: Optional[str] = None

# ===== UTILITY FUNCTIONS =====

def estimate_tokens(text: str) -> int:
    """
    Estimate token count for text.
    Uses a simple approximation: tokens ≈ words * 1.3
    For more accuracy, could integrate tiktoken library.
    """
    if not text:
        return 0
    
    # Simple word-based estimation
    words = len(text.split())
    return int(words * TOKEN_ESTIMATION_RATIO)

def generate_chat_title(first_message: str, max_length: int = 50) -> str:
    """Generate a chat title from the first user message."""
    if not first_message:
        return f"New Chat {datetime.now().strftime('%m/%d %H:%M')}"
    
    # Clean and truncate the message
    title = re.sub(r'\s+', ' ', first_message.strip())
    if len(title) > max_length:
        title = title[:max_length-3] + "..."
    
    return title

def serialize_datetime(obj):
    """JSON serializer for datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

# ===== CONTEXT WINDOW MANAGEMENT =====

class ContextWindow:
    """Manages conversation context within token limits."""
    
    def __init__(self, max_tokens: int = MAX_CONTEXT_TOKENS):
        self.max_tokens = max_tokens
    
    def build_context(self, messages: List[ChatMessage], system_prompt: Optional[str] = None) -> Tuple[List[Dict], int]:
        """
        Build context window from messages, respecting token limits.
        Returns (context_messages, total_tokens)
        """
        context_messages = []
        total_tokens = 0
        
        # Add system prompt if provided
        if system_prompt:
            system_tokens = estimate_tokens(system_prompt)
            if system_tokens < self.max_tokens:
                context_messages.append({
                    "role": "system",
                    "content": system_prompt
                })
                total_tokens += system_tokens
        
        # Add messages from newest to oldest until we hit token limit
        for message in reversed(messages):
            message_tokens = message.token_count or estimate_tokens(message.content)
            
            if total_tokens + message_tokens > self.max_tokens:
                break
            
            context_messages.insert(-1 if system_prompt else 0, {
                "role": message.role,
                "content": message.content
            })
            total_tokens += message_tokens
        
        return context_messages, total_tokens

# ===== MAIN SESSION MANAGER =====

class ChatSessionManager:
    """Main class for managing chat sessions."""

    def __init__(self, chats_dir: Path = CHATS_DIR):
        self.chats_dir = chats_dir
        self.chats_dir.mkdir(exist_ok=True)
        self.context_window = ContextWindow()
        self.context_builders = {}  # Cache context builders per model
        logger.info(f"📁 Chat session manager initialized with directory: {chats_dir}")

    def _get_context_builder(self, model_name: str = "gemma3n:latest") -> ContextBuilder:
        """Get or create a context builder for the specified model."""
        if model_name not in self.context_builders:
            self.context_builders[model_name] = create_context_builder(model_name)
            logger.info(f"🏗️ Created context builder for model: {model_name}")
        return self.context_builders[model_name]
    
    def _get_session_file(self, chat_id: str) -> Path:
        """Get the file path for a chat session."""
        return self.chats_dir / f"{chat_id}.json"
    
    def create_session(self, title: Optional[str] = None) -> ChatSession:
        """Create a new chat session."""
        session = ChatSession(
            title=title or f"New Chat {datetime.now().strftime('%m/%d %H:%M')}"
        )
        
        # Save to file
        self._save_session(session)
        logger.info(f"✅ Created new chat session: {session.id} - {session.title}")
        return session
    
    def _save_session(self, session: ChatSession) -> bool:
        """Save session to JSON file."""
        try:
            session.update_metadata()
            session_file = self._get_session_file(session.id)
            
            # Convert to dict and handle datetime serialization
            session_dict = session.dict()
            
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(session_dict, f, indent=2, default=serialize_datetime, ensure_ascii=False)
            
            logger.debug(f"💾 Saved session {session.id} to {session_file}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to save session {session.id}: {e}")
            return False
    
    def load_session(self, chat_id: str) -> Optional[ChatSession]:
        """Load a chat session from file."""
        try:
            session_file = self._get_session_file(chat_id)
            if not session_file.exists():
                logger.warning(f"⚠️ Session file not found: {session_file}")
                return None
            
            with open(session_file, 'r', encoding='utf-8') as f:
                session_data = json.load(f)
            
            # Parse datetime strings back to datetime objects
            session = ChatSession.parse_obj(session_data)
            logger.debug(f"📖 Loaded session {chat_id}")
            return session
        except Exception as e:
            logger.error(f"❌ Failed to load session {chat_id}: {e}")
            return None
    
    def list_sessions(self) -> List[ChatSessionSummary]:
        """List all chat sessions as summaries."""
        summaries = []
        
        for session_file in self.chats_dir.glob("*.json"):
            try:
                with open(session_file, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                
                summary = ChatSessionSummary(
                    id=session_data['id'],
                    title=session_data['title'],
                    message_count=len(session_data.get('messages', [])),
                    last_activity=datetime.fromisoformat(session_data['updated_at'].replace('Z', '+00:00')),
                    created_at=datetime.fromisoformat(session_data['created_at'].replace('Z', '+00:00')),
                    is_archived=session_data.get('metadata', {}).get('is_archived', False)
                )
                summaries.append(summary)
            except Exception as e:
                logger.error(f"❌ Failed to load session summary from {session_file}: {e}")
        
        # Sort by last activity (newest first)
        summaries.sort(key=lambda x: x.last_activity, reverse=True)
        logger.info(f"📋 Listed {len(summaries)} chat sessions")
        return summaries
    
    def add_message(self, chat_id: str, content: str, role: str, model_name: str = "gemma3n:latest") -> Optional[ChatMessage]:
        """Add a message to a chat session with token counting."""
        session = self.load_session(chat_id)
        if not session:
            logger.error(f"❌ Cannot add message: session {chat_id} not found")
            return None

        # Get context builder for accurate token counting
        context_builder = self._get_context_builder(model_name)

        # Create message with token count
        message = ChatMessage(
            content=content,
            role=role,
            token_count=context_builder.token_counter.count_tokens(content).count
        )

        # Update title if this is the first user message
        if not session.messages and role == "user":
            session.title = generate_chat_title(content)

        session.messages.append(message)

        # Update session metadata with current model
        if not session.metadata:
            session.metadata = ChatSessionMetadata()
        session.metadata.model = model_name

        # Save updated session
        if self._save_session(session):
            logger.info(f"✅ Added {role} message to session {chat_id} ({message.token_count} tokens)")
            return message
        else:
            logger.error(f"❌ Failed to save message to session {chat_id}")
            return None
    
    def rename_session(self, chat_id: str, new_title: str) -> bool:
        """Rename a chat session."""
        session = self.load_session(chat_id)
        if not session:
            return False
        
        session.title = new_title
        success = self._save_session(session)
        if success:
            logger.info(f"✅ Renamed session {chat_id} to '{new_title}'")
        return success
    
    def delete_session(self, chat_id: str) -> bool:
        """Delete a chat session."""
        try:
            session_file = self._get_session_file(chat_id)
            if session_file.exists():
                session_file.unlink()
                logger.info(f"🗑️ Deleted session {chat_id}")
                return True
            else:
                logger.warning(f"⚠️ Session file not found for deletion: {chat_id}")
                return False
        except Exception as e:
            logger.error(f"❌ Failed to delete session {chat_id}: {e}")
            return False
    
    def get_context_for_session(self, chat_id: str, system_prompt: Optional[str] = None, model_name: str = "gemma3n:latest") -> Optional[Dict]:
        """Get token-aware context window for a chat session."""
        session = self.load_session(chat_id)
        if not session:
            return None

        # Use the model from session metadata if available
        if session.metadata and session.metadata.model:
            model_name = session.metadata.model

        # Get context builder for this model
        context_builder = self._get_context_builder(model_name)

        # Convert messages to dict format for context building
        message_dicts = []
        for msg in session.messages:
            message_dicts.append({
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
                "token_count": msg.token_count
            })

        # Build context window
        context_window = context_builder.build_context(message_dicts, system_prompt)

        return {
            "messages": context_window.messages,
            "total_tokens": context_window.total_tokens,
            "max_tokens": context_window.max_tokens,
            "truncated_count": context_window.truncated_count,
            "token_utilization": context_window.token_utilization,
            "model": model_name
        }

# Global session manager instance
session_manager = ChatSessionManager()
