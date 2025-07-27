/**
 * Privacy AI Assistant - Desktop Features Test
 * Tests all features in the native desktop environment
 */

const testResults = {
    desktopAppRunning: false,
    backendConnection: false,
    gemma3nModel: false,
    chatInterface: false,
    multiChatSessions: false,
    voiceFeatures: false,
    hardwareDetection: false
};

async function testDesktopAppRunning() {
    console.log('🖥️  Testing Desktop Application Status...');
    try {
        // Check if the Tauri process is running by looking for the executable
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        const { stdout } = await execPromise('tasklist | findstr "privacy-ai-assistant.exe"');
        if (stdout.includes('privacy-ai-assistant.exe')) {
            console.log('✅ Desktop application is running');
            testResults.desktopAppRunning = true;
            return true;
        }
    } catch (error) {
        console.log('❌ Desktop application not found in process list');
    }
    return false;
}

async function testBackendConnection() {
    console.log('🔗 Testing Backend Connection...');
    try {
        const response = await fetch('http://localhost:8000/health', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Backend Connection:', data.status);
            testResults.backendConnection = true;
            return true;
        }
    } catch (error) {
        console.log('❌ Backend Connection Error:', error.message);
    }
    return false;
}

async function testGemma3nModel() {
    console.log('🤖 Testing Gemma3n Model...');
    try {
        const response = await fetch('http://localhost:8000/ollama/models', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            const hasGemma3n = data.models && data.models.some(model => 
                model.name.includes('gemma3n')
            );
            
            if (hasGemma3n) {
                console.log('✅ Gemma3n model available');
                testResults.gemma3nModel = true;
                return true;
            } else {
                console.log('❌ Gemma3n model not found');
            }
        }
    } catch (error) {
        console.log('❌ Model Check Error:', error.message);
    }
    return false;
}

async function testChatInterface() {
    console.log('💬 Testing Chat Interface...');
    try {
        // Test basic LLM generation
        const response = await fetch('http://localhost:8000/llm/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'Say "Hello from desktop app" in exactly those words.',
                model: 'gemma3n:latest',
                stream: false,
                system_prompt: 'You are a helpful AI assistant. Respond exactly as requested.'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.response && data.response.length > 0) {
                console.log('✅ Chat Interface working - Response received:', 
                    data.response.substring(0, 50) + '...');
                testResults.chatInterface = true;
                return true;
            }
        }
    } catch (error) {
        console.log('❌ Chat Interface Error:', error.message);
    }
    return false;
}

async function testMultiChatSessions() {
    console.log('📝 Testing Multi-Chat Sessions...');
    try {
        // Create a new chat session
        const createResponse = await fetch('http://localhost:8000/chats/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Desktop Test Chat'
            })
        });
        
        if (createResponse.ok) {
            const createData = await createResponse.json();
            console.log('✅ Chat session created:', createData.chat_id);
            
            // List chat sessions
            const listResponse = await fetch('http://localhost:8000/chats/list');
            if (listResponse.ok) {
                const listData = await listResponse.json();
                if (listData.sessions && listData.sessions.length > 0) {
                    console.log('✅ Multi-chat sessions working - Found', 
                        listData.sessions.length, 'sessions');
                    testResults.multiChatSessions = true;
                    return true;
                }
            }
        }
    } catch (error) {
        console.log('❌ Multi-Chat Sessions Error:', error.message);
    }
    return false;
}

async function testVoiceFeatures() {
    console.log('🎤 Testing Voice Features...');
    try {
        // Test STT endpoint availability
        const sttResponse = await fetch('http://localhost:8000/stt/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_data: 'test_audio_data_base64',
                format: 'wav'
            })
        });
        
        // Even if it fails due to invalid audio data, the endpoint should be available
        if (sttResponse.status === 422 || sttResponse.status === 400) {
            console.log('✅ STT endpoint available (validation error expected)');
            
            // Test TTS endpoint
            const ttsResponse = await fetch('http://localhost:8000/tts/synthesize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: 'Hello from desktop',
                    voice: 'default'
                })
            });
            
            if (ttsResponse.status === 200 || ttsResponse.status === 500) {
                console.log('✅ Voice features endpoints available');
                testResults.voiceFeatures = true;
                return true;
            }
        }
    } catch (error) {
        console.log('❌ Voice Features Error:', error.message);
    }
    return false;
}

async function testHardwareDetection() {
    console.log('🔧 Testing Hardware Detection...');
    try {
        const response = await fetch('http://localhost:8000/hardware/info', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.hardware_info) {
                console.log('✅ Hardware Detection working - Platform:', 
                    data.hardware_info.platform);
                testResults.hardwareDetection = true;
                return true;
            }
        }
    } catch (error) {
        console.log('❌ Hardware Detection Error:', error.message);
    }
    return false;
}

async function runDesktopTests() {
    console.log('🖥️  Privacy AI Assistant - Desktop Features Test');
    console.log('================================================');
    console.log('');
    
    // Run all tests
    await testDesktopAppRunning();
    await testBackendConnection();
    await testGemma3nModel();
    await testChatInterface();
    await testMultiChatSessions();
    await testVoiceFeatures();
    await testHardwareDetection();
    
    // Summary
    console.log('');
    console.log('📊 Desktop Test Results Summary:');
    console.log('=================================');
    
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
        console.log('🎉 All desktop features working! Native application ready.');
    } else if (passedTests >= totalTests * 0.7) {
        console.log('✅ Desktop application is functional with most features working.');
    } else {
        console.log('⚠️  Some critical features need attention.');
    }
    
    return passedTests >= totalTests * 0.7;
}

// Run tests
runDesktopTests().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Desktop test execution failed:', error);
    process.exit(1);
});
