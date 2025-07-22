#!/usr/bin/env python3
"""
🔧 Hardware Detection Module for Privacy AI Assistant

This module handles:
- GPU detection and VRAM measurement
- CPU core counting
- RAM availability checking
- Optimal Ollama runtime configuration
- Hardware-adaptive model execution

Architecture:
- HardwareDetector: Main detection class
- RuntimeOptimizer: Determines optimal Ollama configuration
- Hardware monitoring and logging
"""

import logging
import platform
import psutil
import subprocess
import json
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

# Setup logging
logger = logging.getLogger(__name__)

class RuntimeMode(Enum):
    """Available runtime modes for Ollama."""
    GPU = "gpu"
    HYBRID = "hybrid"
    CPU = "cpu"

@dataclass
class HardwareInfo:
    """Hardware information structure."""
    has_gpu: bool = False
    gpu_name: Optional[str] = None
    vram_total: Optional[int] = None  # in MB
    vram_available: Optional[int] = None  # in MB
    cpu_cores: int = 0
    cpu_name: Optional[str] = None
    ram_total: Optional[int] = None  # in MB
    ram_available: Optional[int] = None  # in MB
    platform_info: Optional[str] = None

@dataclass
class RuntimeConfig:
    """Runtime configuration for Ollama."""
    mode: RuntimeMode
    reason: str
    ollama_args: List[str]
    hardware_info: HardwareInfo
    recommended_models: List[str]

class HardwareDetector:
    """Main hardware detection class."""
    
    def __init__(self):
        self.hardware_info = HardwareInfo()
        self._detect_basic_info()
    
    def _detect_basic_info(self):
        """Detect basic system information."""
        try:
            # CPU information
            self.hardware_info.cpu_cores = psutil.cpu_count(logical=False) or psutil.cpu_count()
            self.hardware_info.platform_info = f"{platform.system()} {platform.release()}"
            
            # RAM information
            memory = psutil.virtual_memory()
            self.hardware_info.ram_total = int(memory.total / (1024 * 1024))  # Convert to MB
            self.hardware_info.ram_available = int(memory.available / (1024 * 1024))  # Convert to MB
            
            logger.info(f"💻 Detected {self.hardware_info.cpu_cores} CPU cores")
            logger.info(f"🧠 RAM: {self.hardware_info.ram_total}MB total, {self.hardware_info.ram_available}MB available")
            
        except Exception as e:
            logger.error(f"❌ Failed to detect basic hardware info: {e}")
    
    def detect_gpu(self) -> bool:
        """Detect GPU and VRAM information."""
        try:
            # Try NVIDIA first
            if self._detect_nvidia_gpu():
                return True
            
            # Try AMD GPU detection
            if self._detect_amd_gpu():
                return True
            
            # Try Intel GPU detection
            if self._detect_intel_gpu():
                return True
            
            logger.info("🔍 No compatible GPU detected")
            return False
            
        except Exception as e:
            logger.error(f"❌ GPU detection failed: {e}")
            return False
    
    def _detect_nvidia_gpu(self) -> bool:
        """Detect NVIDIA GPU using nvidia-smi."""
        try:
            # Try to run nvidia-smi
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0 and result.stdout.strip():
                lines = result.stdout.strip().split('\n')
                if lines:
                    # Parse first GPU
                    parts = lines[0].split(', ')
                    if len(parts) >= 3:
                        self.hardware_info.has_gpu = True
                        self.hardware_info.gpu_name = parts[0].strip()
                        self.hardware_info.vram_total = int(parts[1].strip())
                        self.hardware_info.vram_available = int(parts[2].strip())
                        
                        logger.info(f"🎮 NVIDIA GPU detected: {self.hardware_info.gpu_name}")
                        logger.info(f"📊 VRAM: {self.hardware_info.vram_total}MB total, {self.hardware_info.vram_available}MB available")
                        return True
            
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
            logger.debug("nvidia-smi not available or failed")
        except Exception as e:
            logger.debug(f"NVIDIA detection error: {e}")
        
        return False
    
    def _detect_amd_gpu(self) -> bool:
        """Detect AMD GPU using rocm-smi or other methods."""
        try:
            # Try rocm-smi for AMD GPUs
            result = subprocess.run(
                ['rocm-smi', '--showmeminfo', 'vram', '--json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0 and result.stdout.strip():
                data = json.loads(result.stdout)
                # Parse AMD GPU info (simplified)
                if data:
                    self.hardware_info.has_gpu = True
                    self.hardware_info.gpu_name = "AMD GPU (ROCm)"
                    logger.info(f"🎮 AMD GPU detected: {self.hardware_info.gpu_name}")
                    return True
                    
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError):
            logger.debug("rocm-smi not available or failed")
        except Exception as e:
            logger.debug(f"AMD detection error: {e}")
        
        return False
    
    def _detect_intel_gpu(self) -> bool:
        """Detect Intel GPU (basic detection)."""
        try:
            # On Windows, check for Intel GPU in device manager style
            if platform.system() == "Windows":
                result = subprocess.run(
                    ['wmic', 'path', 'win32_VideoController', 'get', 'name'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0 and 'Intel' in result.stdout:
                    self.hardware_info.has_gpu = True
                    self.hardware_info.gpu_name = "Intel Integrated GPU"
                    logger.info(f"🎮 Intel GPU detected: {self.hardware_info.gpu_name}")
                    return True
            
            # On Linux, check lspci
            elif platform.system() == "Linux":
                result = subprocess.run(
                    ['lspci', '-nn'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0 and 'Intel' in result.stdout and 'VGA' in result.stdout:
                    self.hardware_info.has_gpu = True
                    self.hardware_info.gpu_name = "Intel Integrated GPU"
                    logger.info(f"🎮 Intel GPU detected: {self.hardware_info.gpu_name}")
                    return True
                    
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
            logger.debug("Intel GPU detection failed")
        except Exception as e:
            logger.debug(f"Intel detection error: {e}")
        
        return False
    
    def get_hardware_info(self) -> HardwareInfo:
        """Get complete hardware information."""
        self.detect_gpu()
        return self.hardware_info

class RuntimeOptimizer:
    """Determines optimal runtime configuration based on hardware."""
    
    # VRAM thresholds in MB
    HIGH_VRAM_THRESHOLD = 6144  # 6GB
    MID_VRAM_THRESHOLD = 2048   # 2GB
    
    # RAM thresholds in MB
    MIN_RAM_THRESHOLD = 4096    # 4GB
    RECOMMENDED_RAM_THRESHOLD = 8192  # 8GB
    
    def __init__(self, hardware_info: HardwareInfo):
        self.hardware_info = hardware_info
    
    def determine_optimal_config(self) -> RuntimeConfig:
        """Determine the optimal runtime configuration."""
        
        # Check if we have sufficient RAM
        if self.hardware_info.ram_available and self.hardware_info.ram_available < self.MIN_RAM_THRESHOLD:
            return RuntimeConfig(
                mode=RuntimeMode.CPU,
                reason=f"Insufficient RAM: {self.hardware_info.ram_available}MB < {self.MIN_RAM_THRESHOLD}MB required",
                ollama_args=["--adapter", "cpu"],
                hardware_info=self.hardware_info,
                recommended_models=["gemma3n:2b", "phi3:mini"]
            )
        
        # GPU-based decisions
        if self.hardware_info.has_gpu and self.hardware_info.vram_total:
            if self.hardware_info.vram_total >= self.HIGH_VRAM_THRESHOLD:
                return RuntimeConfig(
                    mode=RuntimeMode.GPU,
                    reason=f"High VRAM available: {self.hardware_info.vram_total}MB >= {self.HIGH_VRAM_THRESHOLD}MB",
                    ollama_args=["--adapter", "gpu"],
                    hardware_info=self.hardware_info,
                    recommended_models=["gemma3n:latest", "llama3.1:8b", "mistral:7b"]
                )
            
            elif self.hardware_info.vram_total >= self.MID_VRAM_THRESHOLD:
                return RuntimeConfig(
                    mode=RuntimeMode.HYBRID,
                    reason=f"Medium VRAM available: {self.hardware_info.vram_total}MB >= {self.MID_VRAM_THRESHOLD}MB",
                    ollama_args=["--adapter", "hybrid"],
                    hardware_info=self.hardware_info,
                    recommended_models=["gemma3n:7b", "phi3:medium", "llama3.1:7b"]
                )
        
        # Fallback to CPU
        cpu_reason = "No compatible GPU detected" if not self.hardware_info.has_gpu else f"Low VRAM: {self.hardware_info.vram_total}MB < {self.MID_VRAM_THRESHOLD}MB"
        
        return RuntimeConfig(
            mode=RuntimeMode.CPU,
            reason=cpu_reason,
            ollama_args=["--adapter", "cpu"],
            hardware_info=self.hardware_info,
            recommended_models=["gemma3n:2b", "phi3:mini", "tinyllama:1.1b"]
        )
    
    def get_ollama_startup_command(self, config: RuntimeConfig) -> List[str]:
        """Generate Ollama startup command with optimal configuration."""
        base_cmd = ["ollama", "serve"]
        
        # Add hardware-specific arguments
        if config.ollama_args:
            base_cmd.extend(config.ollama_args)
        
        # Add memory management
        if config.mode == RuntimeMode.CPU:
            # Limit CPU usage for better system responsiveness
            base_cmd.extend(["--max-cpu-threads", str(max(1, self.hardware_info.cpu_cores - 1))])
        
        return base_cmd

# Global hardware detector instance
hardware_detector = HardwareDetector()

def get_runtime_config() -> RuntimeConfig:
    """Get the optimal runtime configuration for the current system."""
    hardware_info = hardware_detector.get_hardware_info()
    optimizer = RuntimeOptimizer(hardware_info)
    config = optimizer.determine_optimal_config()
    
    logger.info(f"🔧 Optimal runtime mode: {config.mode.value}")
    logger.info(f"📝 Reason: {config.reason}")
    logger.info(f"⚙️ Ollama args: {' '.join(config.ollama_args)}")
    logger.info(f"🎯 Recommended models: {', '.join(config.recommended_models)}")
    
    return config

def get_hardware_summary() -> Dict[str, Any]:
    """Get a summary of hardware information for UI display."""
    hardware_info = hardware_detector.get_hardware_info()
    config = get_runtime_config()
    
    return {
        "hardware": {
            "cpu_cores": hardware_info.cpu_cores,
            "ram_total_mb": hardware_info.ram_total,
            "ram_available_mb": hardware_info.ram_available,
            "has_gpu": hardware_info.has_gpu,
            "gpu_name": hardware_info.gpu_name,
            "vram_total_mb": hardware_info.vram_total,
            "vram_available_mb": hardware_info.vram_available,
            "platform": hardware_info.platform_info
        },
        "runtime": {
            "mode": config.mode.value,
            "reason": config.reason,
            "ollama_args": config.ollama_args,
            "recommended_models": config.recommended_models
        }
    }

if __name__ == "__main__":
    # Test hardware detection
    logging.basicConfig(level=logging.INFO)
    
    print("🔍 Hardware Detection Test")
    print("=" * 50)
    
    config = get_runtime_config()
    summary = get_hardware_summary()
    
    print(f"Runtime Mode: {config.mode.value}")
    print(f"Reason: {config.reason}")
    print(f"Ollama Command: {' '.join(['ollama', 'serve'] + config.ollama_args)}")
    print(f"Recommended Models: {', '.join(config.recommended_models)}")
