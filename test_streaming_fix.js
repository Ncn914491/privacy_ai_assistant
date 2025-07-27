// Test script to verify streaming fixes
// Run this in the browser console to test the fixed streaming functionality

async function testStreamingFix() {
  console.log('🧪 Testing Streaming Fixes...');
  
  try {
    // Check Tauri environment
    if (!window.__TAURI__) {
      console.error('❌ Not running in Tauri environment');
      return;
    }
    
    const { invoke } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;
    
    console.log('✅ Tauri environment detected');
    
    // Test 1: Basic ping
    console.log('\n📡 Test 1: Basic ping...');
    try {
      const pingResult = await invoke('ping');
      console.log('✅ Ping successful:', pingResult);
    } catch (error) {
      console.error('❌ Ping failed:', error);
      return;
    }
    
    // Test 2: Check LLM health
    console.log('\n🏥 Test 2: LLM health check...');
    try {
      const healthResult = await invoke('check_llm_health');
      console.log('✅ LLM health check:', healthResult);
    } catch (error) {
      console.error('❌ LLM health check failed:', error);
    }
    
    // Test 3: Streaming with correct parameters
    console.log('\n🚀 Test 3: Streaming with fixed parameters...');
    const streamId = `test_${Date.now()}`;
    let receivedChunks = [];
    let streamCompleted = false;
    let streamError = null;
    
    // Set up event listener
    const unlisten = await listen('llm-stream-event', (event) => {
      const { stream_id, event_type, data } = event.payload;
      console.log(`📨 Event: ${event_type} for stream: ${stream_id}`);
      
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
            streamError = data;
            break;
        }
      }
    });
    
    // Start streaming with correct parameter names
    console.log('🚀 Starting stream with ID:', streamId);
    const result = await invoke('start_llm_stream', {
      streamId: streamId,  // FIXED: camelCase
      prompt: 'Hello, how are you? Please give a short response.',
      model: 'gemma3n:latest',
      systemPrompt: 'You are a helpful AI assistant.'
    });
    
    console.log('✅ Stream command result:', result);
    
    // Wait for completion or timeout
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds
    
    while (!streamCompleted && !streamError && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    // Clean up
    unlisten();
    
    if (streamCompleted) {
      console.log('✅ Streaming test PASSED');
      console.log('📊 Total chunks received:', receivedChunks.length);
      console.log('📝 Full response:', receivedChunks.join(''));
    } else if (streamError) {
      console.error('❌ Streaming test FAILED with error:', streamError);
    } else {
      console.error('❌ Streaming test TIMEOUT - no completion received');
    }
    
    // Test 4: Test streaming with simple prompt
    console.log('\n🧪 Test 4: Simple prompt test...');
    const simpleStreamId = `simple_${Date.now()}`;
    let simpleCompleted = false;
    
    const simpleUnlisten = await listen('llm-stream-event', (event) => {
      const { stream_id, event_type, data } = event.payload;
      if (stream_id === simpleStreamId && event_type === 'complete') {
        simpleCompleted = true;
      }
    });
    
    await invoke('start_llm_stream', {
      streamId: simpleStreamId,
      prompt: 'Hi',
      model: 'gemma3n:latest',
      systemPrompt: null
    });
    
    // Wait for simple test
    attempts = 0;
    while (!simpleCompleted && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    simpleUnlisten();
    
    if (simpleCompleted) {
      console.log('✅ Simple prompt test PASSED');
    } else {
      console.log('❌ Simple prompt test FAILED');
    }
    
    console.log('\n🏁 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testStreamingFix(); 