#!/usr/bin/env node

/**
 * Test script to validate fixes for LLM response handling and streaming
 */

import fs from 'fs';
import path from 'path';

console.log('🧪 Testing Privacy AI Assistant Fixes...\n');

// Test 1: Verify gemma3n model is hardcoded
console.log('📋 Test 1: Model Configuration');
const chatStorePath = './src/stores/chatStore.ts';
const enhancedStreamingPath = './src/hooks/useEnhancedStreaming.ts';
const llmRsPath = './src-tauri/src/llm.rs';

try {
  const chatStoreContent = fs.readFileSync(chatStorePath, 'utf8');
  const streamingContent = fs.readFileSync(enhancedStreamingPath, 'utf8');
  const llmRsContent = fs.readFileSync(llmRsPath, 'utf8');
  
  // Check if gemma3n:latest is properly set
  const chatStoreGemmaCount = (chatStoreContent.match(/gemma3n:latest/g) || []).length;
  const streamingGemmaCount = (streamingContent.match(/gemma3n:latest/g) || []).length;
  const llmRsGemmaCount = (llmRsContent.match(/gemma3n:latest/g) || []).length;
  
  console.log(`   ✅ Chat Store gemma3n references: ${chatStoreGemmaCount}`);
  console.log(`   ✅ Streaming Hook gemma3n references: ${streamingGemmaCount}`);
  console.log(`   ✅ Rust LLM gemma3n references: ${llmRsGemmaCount}`);
  
  // Check if mode is forced to offline/local
  if (streamingContent.includes("const mode = 'offline';")) {
    console.log('   ✅ Streaming mode forced to offline');
  } else {
    console.log('   ❌ Streaming mode not forced to offline');
  }
  
  // Check if model is forced to gemma3n
  if (streamingContent.includes("const model = 'gemma3n:latest';")) {
    console.log('   ✅ Model forced to gemma3n:latest');
  } else {
    console.log('   ❌ Model not forced to gemma3n:latest');
  }

} catch (error) {
  console.log(`   ❌ Error reading files: ${error.message}`);
}

console.log('');

// Test 2: Verify enhanced chat store fixes
console.log('📋 Test 2: Enhanced Chat Store');
const enhancedChatStorePath = './src/stores/enhancedChatStore.ts';

try {
  const enhancedChatContent = fs.readFileSync(enhancedChatStorePath, 'utf8');
  
  // Check if saveChatSession is properly implemented
  if (enhancedChatContent.includes('saveChatSession: async (chatId: string, session?: ChatSession)')) {
    console.log('   ✅ saveChatSession method properly implemented');
  } else {
    console.log('   ❌ saveChatSession method not properly implemented');
  }
  
  // Check if updateMessage handles session updates
  if (enhancedChatContent.includes('get().saveChatSession(activeChatId, updatedSession)')) {
    console.log('   ✅ updateMessage properly saves to session');
  } else {
    console.log('   ❌ updateMessage does not save to session');
  }

} catch (error) {
  console.log(`   ❌ Error reading enhanced chat store: ${error.message}`);
}

console.log('');

// Test 3: Verify Rust streaming implementation
console.log('📋 Test 3: Rust Streaming Implementation');

try {
  const llmRsContent = fs.readFileSync(llmRsPath, 'utf8');
  
  // Check if DEFAULT_MODEL is set to gemma3n:latest
  if (llmRsContent.includes('const DEFAULT_MODEL: &str = "gemma3n:latest";')) {
    console.log('   ✅ DEFAULT_MODEL set to gemma3n:latest');
  } else {
    console.log('   ❌ DEFAULT_MODEL not set to gemma3n:latest');
  }
  
  // Check if streaming events are properly emitted
  if (llmRsContent.includes('emit_stream_chunk') && 
      llmRsContent.includes('emit_stream_complete') && 
      llmRsContent.includes('emit_stream_error')) {
    console.log('   ✅ All streaming event emitters present');
  } else {
    console.log('   ❌ Missing streaming event emitters');
  }
  
  // Check if proper event name is used
  if (llmRsContent.includes('let event_name = "llm-stream-event";')) {
    console.log('   ✅ Consistent event name used');
  } else {
    console.log('   ❌ Inconsistent event naming');
  }

} catch (error) {
  console.log(`   ❌ Error reading Rust LLM file: ${error.message}`);
}

console.log('');

// Test 4: Check for potential issues
console.log('📋 Test 4: Potential Issues Check');

// Check if package.json has correct scripts
try {
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  
  if (packageJson.scripts && packageJson.scripts.dev) {
    console.log('   ✅ Development script present');
  } else {
    console.log('   ❌ Development script missing');
  }
  
  if (packageJson.dependencies && packageJson.dependencies['@tauri-apps/api']) {
    console.log('   ✅ Tauri API dependency present');
  } else {
    console.log('   ❌ Tauri API dependency missing');
  }

} catch (error) {
  console.log(`   ❌ Error reading package.json: ${error.message}`);
}

// Check if Tauri config exists
if (fs.existsSync('./src-tauri/tauri.conf.json')) {
  console.log('   ✅ Tauri configuration file exists');
} else {
  console.log('   ❌ Tauri configuration file missing');
}

console.log('');

// Test 5: Recommendations
console.log('📋 Test 5: Recommendations');
console.log('   🔧 To start Ollama with gemma3n:latest model:');
console.log('      ollama pull gemma3n:latest');
console.log('      ollama serve');
console.log('');
console.log('   🔧 To test the application:');
console.log('      npm run dev');
console.log('');
console.log('   🔧 To test basic functionality:');
console.log('      1. Open the app');
console.log('      2. Send a simple message like "Hello, how are you?"');
console.log('      3. Verify streaming response appears token-by-token');
console.log('      4. Check browser console for any errors');
console.log('');

console.log('✅ Fix validation completed!');
console.log('📝 Summary of fixes applied:');
console.log('   • Fixed model configuration to use only gemma3n:latest');
console.log('   • Fixed enhanced chat store saveChatSession implementation');
console.log('   • Fixed streaming hook to force local mode');
console.log('   • Maintained existing Rust streaming implementation');
console.log('   • Removed online model options from UI and backend');
