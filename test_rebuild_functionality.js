/**
 * Privacy AI Assistant - Rebuild Functionality Test
 * Tests all core features after rebuild
 */

const testResults = {
    backendHealth: false,
    ollamaConnection: false,
    gemma3nModel: false,
    frontendAccess: false,
    modelConfiguration: false,
    hybridModeToggle: false,
    sidebarFunctionality: false,
    chatInterface: false,
    streamingResponse: false
};

async function testBackendHealth() {
    console.log('🔍 Testing Backend Health...');
    try {
        const response = await fetch('http://localhost:8000/health', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Backend Health:', data);
            testResults.backendHealth = true;
            return true;
        }
    } catch (error) {
        console.log('❌ Backend Health Error:', error.message);
    }
    return false;
}

async function testOllamaConnection() {
    console.log('🔍 Testing Ollama Connection...');
    try {
        const response = await fetch('http://localhost:8000/ollama/models', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Ollama Models:', data);
            testResults.ollamaConnection = true;

            // Check for gemma3n model
            if (data.models && data.models.some(model => model.name.includes('gemma3n'))) {
                console.log('✅ Gemma3n model found');
                testResults.gemma3nModel = true;
            }
            return true;
        }
    } catch (error) {
        console.log('❌ Ollama Connection Error:', error.message);
    }
    return false;
}

async function testFrontendAccess() {
    console.log('🔍 Testing Frontend Access...');
    try {
        const response = await fetch('http://localhost:3000', {
            method: 'GET'
        });
        
        if (response.ok) {
            console.log('✅ Frontend accessible on port 3000');
            testResults.frontendAccess = true;
            return true;
        }
    } catch (error) {
        console.log('❌ Frontend Access Error:', error.message);
    }
    return false;
}

async function testModelConfiguration() {
    console.log('🔍 Testing Model Configuration...');
    try {
        const response = await fetch('http://localhost:8000/hardware/runtime-config', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const config = await response.json();
            console.log('✅ Runtime Configuration:', config);

            // Check if configuration is available
            if (config.success) {
                console.log('✅ Model configuration accessible');
                testResults.modelConfiguration = true;
            }
            return true;
        }
    } catch (error) {
        console.log('❌ Model Configuration Error:', error.message);
    }
    return false;
}

async function testStreamingResponse() {
    console.log('🔍 Testing Streaming Response...');
    try {
        const response = await fetch('http://localhost:8000/llm/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'Hello, this is a test message',
                model: 'gemma3n:latest',
                stream: false,
                system_prompt: 'You are a helpful AI assistant.'
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ LLM Response received:', data.response ? data.response.substring(0, 100) + '...' : 'No response text');
            testResults.streamingResponse = true;
            return true;
        }
    } catch (error) {
        console.log('❌ LLM Response Error:', error.message);
    }
    return false;
}

async function runAllTests() {
    console.log('🚀 Privacy AI Assistant - Rebuild Functionality Test');
    console.log('====================================================');
    console.log('');
    
    // Test backend components
    await testBackendHealth();
    await testOllamaConnection();
    await testModelConfiguration();
    await testStreamingResponse();
    
    // Test frontend access
    await testFrontendAccess();
    
    // Summary
    console.log('');
    console.log('📊 Test Results Summary:');
    console.log('========================');
    
    const totalTests = Object.keys(testResults).length;
    const passedTests = Object.values(testResults).filter(result => result).length;
    
    Object.entries(testResults).forEach(([test, passed]) => {
        const status = passed ? '✅' : '❌';
        const testName = test.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        console.log(`${status} ${testName}: ${passed ? 'PASSED' : 'FAILED'}`);
    });
    
    console.log('');
    console.log(`📈 Overall Result: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed! Application rebuild successful.');
    } else {
        console.log('⚠️  Some tests failed. Please check the issues above.');
    }
    
    return passedTests === totalTests;
}

// Run tests
runAllTests().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});
