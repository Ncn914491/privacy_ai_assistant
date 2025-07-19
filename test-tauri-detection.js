// Test script to verify Tauri detection logic
// Run this in the browser console when the app is running

console.log('🧪 Testing Tauri Detection...');

// Simulate different environments
const testCases = [
  {
    name: 'Real Tauri Environment',
    setup: () => {
      // This would be set by Tauri automatically
      window.__TAURI__ = {
        invoke: () => Promise.resolve('test'),
        tauri: { version: '2.0.0' }
      };
    }
  },
  {
    name: 'Development localhost (with Tauri)',
    setup: () => {
      // Simulate localhost development with Tauri
      Object.defineProperty(window, 'location', {
        value: { 
          hostname: 'localhost', 
          protocol: 'http:',
          href: 'http://localhost:5173'
        },
        writable: true
      });
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0... Tauri/2.0.0',
        writable: true
      });
    }
  },
  {
    name: 'Pure Browser Environment',
    setup: () => {
      delete window.__TAURI__;
      Object.defineProperty(window, 'location', {
        value: { 
          hostname: 'example.com', 
          protocol: 'https:',
          href: 'https://example.com'
        },
        writable: true
      });
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 Chrome/120.0.0.0',
        writable: true
      });
    }
  }
];

// Test each case
testCases.forEach(testCase => {
  console.log(`\n--- Testing: ${testCase.name} ---`);
  testCase.setup();
  
  // Import and test our detection function
  // Note: This would need to be adapted to work in the actual environment
  const result = window.detectTauriEnvironment?.() || 'Function not available';
  console.log('Result:', result);
});

console.log('\n🧪 Test complete. Check the results above.');
