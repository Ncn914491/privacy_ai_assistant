// Simple test script to verify LLM streaming functionality
// This can be run in the browser console to test the streaming

console.log('🧪 Starting LLM Streaming Test...');

// Test function to simulate sending a message
async function testLLMStreaming() {
  try {
    console.log('📡 Testing Tauri environment detection...');
    
    // Check if we're in Tauri environment
    const isTauri = window.__TAURI__ !== undefined;
    console.log('🔍 Tauri detected:', isTauri);
    
    if (!isTauri) {
      console.error('❌ Not running in Tauri environment');
      return;
    }
    
    // Import Tauri APIs
    const { invoke } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;
    
    console.log('📦 Tauri APIs imported successfully');
    
    // Generate a test stream ID
    const streamId = `test_${Date.now()}`;
    console.log('🆔 Generated stream ID:', streamId);
    
    // Set up event listener
    console.log('👂 Setting up event listener...');
    const unlisten = await listen('llm-stream-event', (event) => {
      const { stream_id, event_type, data } = event.payload;
      console.log(`📨 Event received: ${event_type} for stream: ${stream_id}`);
      
      if (stream_id === streamId) {
        switch (event_type) {
          case 'chunk':
            console.log(`📝 Chunk: "${data}"`);
            break;
          case 'complete':
            console.log('✅ Stream completed');
            break;
          case 'error':
            console.error('❌ Stream error:', data);
            break;
        }
      }
    });
    
    console.log('🚀 Invoking start_llm_stream command...');
    
    // Test with a simple prompt
    const result = await invoke('start_llm_stream', {
      streamId: streamId,
      prompt: 'Hello, how are you?',
      model: 'llama3.1:8b',
      systemPrompt: 'You are a helpful AI assistant.'
    });
    
    console.log('✅ Command invoked successfully:', result);
    
    // Clean up after 30 seconds
    setTimeout(() => {
      unlisten();
      console.log('🧹 Test cleanup completed');
    }, 30000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testLLMStreaming();
