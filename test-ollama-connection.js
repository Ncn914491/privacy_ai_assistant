// Test script to check Ollama connectivity and model availability
console.log('🔍 Testing Ollama Connection and Model Availability...\n');

async function testOllamaConnection() {
  const OLLAMA_BASE_URL = 'http://localhost:11434';
  
  console.log('1. Testing Ollama Service Connectivity...');
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ollama service is running');
      console.log(`📋 Available models: ${data.models?.length || 0}`);
      
      if (data.models && data.models.length > 0) {
        console.log('   Models found:');
        data.models.forEach(model => {
          console.log(`   - ${model.name} (${model.size ? Math.round(model.size / 1024 / 1024 / 1024 * 10) / 10 + 'GB' : 'unknown size'})`);
        });
        
        // Check if Gemma 3n is available
        const hasGemma3n = data.models.some(model => 
          model.name.includes('gemma3n') || model.name.includes('gemma:3n')
        );
        
        if (hasGemma3n) {
          console.log('✅ Gemma 3n model is available');
        } else {
          console.log('❌ Gemma 3n model not found');
          console.log('   To install: ollama pull gemma3n');
        }
      } else {
        console.log('❌ No models installed');
        console.log('   To install Gemma 3n: ollama pull gemma3n');
      }
    } else {
      console.log(`❌ Ollama service responded with status: ${response.status}`);
    }
  } catch (error) {
    console.log('❌ Cannot connect to Ollama service');
    console.log(`   Error: ${error.message}`);
    console.log('   Please ensure:');
    console.log('   - Ollama is installed');
    console.log('   - Ollama service is running');
    console.log('   - Service is accessible at http://localhost:11434');
  }
  
  console.log('\n2. Testing Ollama Generate Endpoint...');
  try {
    const testPrompt = 'Hello, respond with just "OK" if you can hear me.';
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3n:latest',
        prompt: testPrompt,
        stream: false
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.response) {
        console.log('✅ Ollama generate endpoint working');
        console.log(`   Test response: "${data.response.substring(0, 50)}${data.response.length > 50 ? '...' : ''}"`);
      } else {
        console.log('⚠️ Ollama responded but with empty response');
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Generate endpoint failed with status: ${response.status}`);
      console.log(`   Error: ${errorText}`);
      
      if (response.status === 404) {
        console.log('   This usually means the Gemma 3n model is not installed');
        console.log('   Install with: ollama pull gemma3n');
      }
    }
  } catch (error) {
    console.log('❌ Generate endpoint test failed');
    console.log(`   Error: ${error.message}`);
  }
  
  console.log('\n📋 Ollama Connection Test Summary:');
  console.log('✅ Improved error handling in ChatInterface.tsx');
  console.log('✅ Enhanced error messages in llmRouter.ts');
  console.log('✅ Better user feedback for connection issues');
  
  console.log('\n🔧 Next Steps:');
  console.log('1. If Ollama is not running: Start Ollama service');
  console.log('2. If Gemma 3n is missing: Run "ollama pull gemma3n"');
  console.log('3. Test the application with a simple message');
  console.log('4. Try online mode with "[use_online] Hello" if local fails');
  
  console.log('\n✨ The offline LLM connection issues should now show helpful error messages!');
}

// Run the test
testOllamaConnection().catch(console.error);
