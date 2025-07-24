#!/usr/bin/env python3
"""
Test script to evaluate model performance and hardware optimization
"""

import requests
import time
import json
from hardware_detection import get_hardware_summary, get_runtime_config

def test_model_performance(model_name, test_prompt="Hello, how are you?"):
    """Test the performance of a specific model."""
    print(f"🧪 Testing model: {model_name}")
    
    try:
        start_time = time.time()
        
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": model_name,
                "prompt": test_prompt,
                "stream": False
            },
            timeout=60
        )
        
        end_time = time.time()
        response_time = end_time - start_time
        
        if response.status_code == 200:
            result = response.json()
            response_text = result.get('response', '')
            
            print(f"  ✅ Success")
            print(f"  ⏱️  Response time: {response_time:.2f}s")
            print(f"  📝 Response length: {len(response_text)} chars")
            print(f"  💬 Response preview: {response_text[:100]}...")
            
            return {
                "success": True,
                "response_time": response_time,
                "response_length": len(response_text),
                "model": model_name
            }
        else:
            print(f"  ❌ HTTP Error: {response.status_code}")
            return {
                "success": False,
                "error": f"HTTP {response.status_code}",
                "model": model_name
            }
            
    except requests.exceptions.Timeout:
        print(f"  ⏰ Timeout after 60 seconds")
        return {
            "success": False,
            "error": "Timeout",
            "model": model_name
        }
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return {
            "success": False,
            "error": str(e),
            "model": model_name
        }

def get_available_models():
    """Get list of available models from Ollama."""
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=10)
        if response.status_code == 200:
            data = response.json()
            models = [model['name'] for model in data.get('models', [])]
            return models
        else:
            print(f"❌ Failed to get models: HTTP {response.status_code}")
            return []
    except Exception as e:
        print(f"❌ Failed to get models: {e}")
        return []

def main():
    print("🚀 Model Performance and Hardware Optimization Test\n")
    
    # Get hardware information
    print("🔧 Hardware Detection:")
    try:
        hardware_summary = get_hardware_summary()
        runtime_config = get_runtime_config()
        
        hardware = hardware_summary.get('hardware', {})
        runtime = hardware_summary.get('runtime', {})
        
        print(f"  CPU Cores: {hardware.get('cpu_cores', 'Unknown')}")
        print(f"  RAM Total: {hardware.get('ram_total_mb', 'Unknown')} MB")
        print(f"  RAM Available: {hardware.get('ram_available_mb', 'Unknown')} MB")
        print(f"  GPU Available: {hardware.get('has_gpu', False)}")
        if hardware.get('has_gpu'):
            print(f"  GPU Name: {hardware.get('gpu_name', 'Unknown')}")
            print(f"  VRAM Total: {hardware.get('vram_total_mb', 'Unknown')} MB")
        
        print(f"  Runtime Mode: {runtime.get('mode', 'Unknown')}")
        print(f"  Reason: {runtime.get('reason', 'Unknown')}")
        print(f"  Recommended Models: {runtime.get('recommended_models', [])}")
        
    except Exception as e:
        print(f"  ❌ Hardware detection failed: {e}")
    
    print("\n📋 Available Models:")
    available_models = get_available_models()
    if available_models:
        for i, model in enumerate(available_models, 1):
            print(f"  {i}. {model}")
    else:
        print("  ❌ No models found or Ollama not accessible")
        return
    
    # Test models
    print("\n🧪 Performance Tests:")
    test_models = available_models[:3]  # Test first 3 models
    results = []
    
    for model in test_models:
        result = test_model_performance(model)
        results.append(result)
        print()  # Empty line for readability
    
    # Summary
    print("📊 Performance Summary:")
    successful_tests = [r for r in results if r.get('success')]
    
    if successful_tests:
        # Sort by response time
        successful_tests.sort(key=lambda x: x.get('response_time', float('inf')))
        
        print("  🏆 Fastest to Slowest:")
        for i, result in enumerate(successful_tests, 1):
            print(f"    {i}. {result['model']}: {result['response_time']:.2f}s")
        
        fastest = successful_tests[0]
        print(f"\n  🥇 Recommended model for this hardware: {fastest['model']}")
        print(f"     Average response time: {fastest['response_time']:.2f}s")
    else:
        print("  ❌ No successful tests")
    
    # Hardware optimization recommendations
    print("\n💡 Hardware Optimization Recommendations:")
    try:
        runtime_config = get_runtime_config()
        if runtime_config.mode.value == 'cpu':
            print("  • Currently running in CPU mode")
            print("  • Consider using smaller models for better performance:")
            for model in runtime_config.recommended_models:
                print(f"    - {model}")
            print("  • Ensure sufficient RAM is available")
            print("  • Close other applications to free up memory")
        elif runtime_config.mode.value == 'gpu':
            print("  • Currently optimized for GPU acceleration")
            print("  • GPU models should provide faster inference")
        
    except Exception as e:
        print(f"  ❌ Failed to get optimization recommendations: {e}")

if __name__ == "__main__":
    main()
