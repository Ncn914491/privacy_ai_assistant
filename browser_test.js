// Browser console test for LLM streaming
// Copy and paste this into the browser console when the app is open

console.log('🧪 Starting LLM Streaming Test...');

async function testLLMStreaming() {
  try {
    console.log('🔍 Checking Tauri environment...');
    
    // Check if we're in Tauri environment
    if (!window.__TAURI__) {
      console.error('❌ Not running in Tauri environment');
      return;
    }
    
    console.log('✅ Tauri detected');
    
    // Import Tauri APIs
    const { invoke } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;
    
    console.log('📦 Tauri APIs imported successfully');
    
    // Test basic ping first
    try {
      const pingResult = await invoke('ping');
      console.log(`✅ Ping successful: ${pingResult}`);
    } catch (pingError) {
      console.error('❌ Ping failed:', pingError);
      return;
    }
    
    // Generate a test stream ID
    const streamId = `test_${Date.now()}`;
    console.log(`🆔 Generated stream ID: ${streamId}`);
    
    // Set up event listener
    console.log('👂 Setting up event listener...');
    let receivedChunks = [];
    let streamCompleted = false;
    
    const unlisten = await listen('llm-stream-event', (event) => {
      const { stream_id, event_type, data } = event.payload;
      console.log(`📨 Event received: ${event_type} for stream: ${stream_id}`);
      
      if (stream_id === streamId) {
        switch (event_type) {
          case 'chunk':
            console.log(`📝 Chunk: "${data}"`);
            receivedChunks.push(data);
            break;
          case 'complete':
            console.log('✅ Stream completed');
            streamCompleted = true;
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
      prompt: 'Hello, please respond with just "Hi there!"',
      model: 'gemma3n:latest',
      systemPrompt: 'You are a helpful AI assistant. Keep responses very short.'
    });
    
    console.log('✅ Command invoked successfully:', result);
    
    // Wait for streaming to complete or timeout
    let waitTime = 0;
    const maxWait = 30000; // 30 seconds
    
    while (!streamCompleted && waitTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      waitTime += 1000;
      console.log(`⏳ Waiting for stream completion... ${waitTime/1000}s`);
    }
    
    // Report results
    if (streamCompleted) {
      console.log(`🎉 Test completed successfully!`);
      console.log(`📊 Received ${receivedChunks.length} chunks`);
      console.log(`📄 Full response: "${receivedChunks.join('')}"`);
    } else {
      console.log(`⏰ Test timed out after ${maxWait/1000} seconds`);
      console.log(`📊 Received ${receivedChunks.length} chunks so far`);
      if (receivedChunks.length > 0) {
        console.log(`📄 Partial response: "${receivedChunks.join('')}"`);
      }
    }
    
    // Clean up
    unlisten();
    console.log('🧹 Test cleanup completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testLLMStreaming();

console.log('📋 Test script loaded. Check the console output above for results.');
console.log('💡 If the test fails, check:');
console.log('   1. Ollama is running (ollama serve)');
console.log('   2. gemma3n:latest model is available (ollama list)');
console.log('   3. No firewall blocking localhost:11434');
console.log('   4. Tauri backend is running without errors');
