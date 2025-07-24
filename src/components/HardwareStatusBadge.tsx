import React, { useState, useEffect } from 'react';
import {
  Cpu,
  HardDrive,
  Monitor,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '../utils/cn';

interface HardwareStatusProps {
  className?: string;
  showDetails?: boolean;
}

interface HardwareData {
  hardware: {
    cpu_cores: number;
    ram_total_mb: number;
    ram_available_mb: number;
    has_gpu: boolean;
    gpu_name?: string;
    vram_total_mb?: number;
    vram_available_mb?: number;
    platform?: string;
  };
  runtime: {
    mode: string;
    reason: string;
    ollama_args: string[];
    recommended_models: string[];
  };
}

const HardwareStatusBadge: React.FC<HardwareStatusProps> = ({ 
  className, 
  showDetails = false 
}) => {
  const [hardwareData, setHardwareData] = useState<HardwareData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(showDetails);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHardwareInfo = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔧 Loading hardware information from backend...');

      const response = await fetch('http://127.0.0.1:8000/hardware/info', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🔧 Hardware data received:', data);

      if (data.success && data.data) {
        setHardwareData(data.data);
        console.log('✅ Hardware data loaded successfully');
      } else {
        const errorMsg = data.error || 'Failed to load hardware information';
        console.error('❌ Hardware data error:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error('❌ Failed to load hardware info:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load hardware info: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshHardware = async () => {
    try {
      setIsRefreshing(true);
      console.log('🔄 Refreshing hardware detection...');

      // Just reload the hardware info - the backend will refresh automatically
      await loadHardwareInfo();

      console.log('✅ Hardware refresh completed');
    } catch (err) {
      console.error('❌ Failed to refresh hardware:', err);
      setError(`Failed to refresh hardware: ${err}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadHardwareInfo();
  }, []);

  const getRuntimeModeIcon = (mode: string) => {
    switch (mode.toLowerCase()) {
      case 'gpu':
        return <Monitor className="text-green-500" size={16} />;
      case 'hybrid':
        return <Cpu className="text-yellow-500" size={16} />;
      case 'cpu':
        return <Cpu className="text-blue-500" size={16} />;
      default:
        return <HardDrive className="text-gray-500" size={16} />;
    }
  };

  const getRuntimeModeColor = (mode: string) => {
    switch (mode.toLowerCase()) {
      case 'gpu':
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700';
      case 'hybrid':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700';
      case 'cpu':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700';
    }
  };

  const formatMemory = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg', className)}>
        <RefreshCw className="animate-spin" size={16} />
        <span className="text-sm">Loading hardware status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-700', className)}>
        <XCircle size={16} />
        <span className="text-sm">Hardware detection failed</span>
        <button
          type="button"
          onClick={refreshHardware}
          disabled={isRefreshing}
          className="ml-2 p-1 hover:bg-red-200 dark:hover:bg-red-800 rounded"
          title="Refresh hardware detection"
          aria-label="Refresh hardware detection"
        >
          <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
        </button>
      </div>
    );
  }

  if (!hardwareData || !hardwareData.hardware || !hardwareData.runtime) {
    return (
      <div className={cn('bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-3', className)}>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">Hardware data unavailable</span>
        </div>
      </div>
    );
  }

  const { hardware, runtime } = hardwareData;

  // Additional safety checks
  if (!runtime || !runtime.mode) {
    return (
      <div className={cn('bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-3', className)}>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">Runtime configuration unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm', className)}>
      {/* Main Status Bar */}
      <div 
        className={cn(
          'flex items-center justify-between px-3 py-2 cursor-pointer',
          getRuntimeModeColor(runtime.mode)
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {getRuntimeModeIcon(runtime.mode)}
          <span className="text-sm font-medium">
            {runtime.mode.toUpperCase()} Mode
          </span>
          {hardware.has_gpu && (
            <CheckCircle size={14} className="text-green-500" />
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              refreshHardware();
            }}
            disabled={isRefreshing}
            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
            title="Refresh hardware detection"
          >
            <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          </button>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Detailed Information */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {/* Runtime Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Runtime Configuration</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{runtime.reason}</p>
            <div className="flex flex-wrap gap-1">
              {runtime.ollama_args.map((arg, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-xs rounded font-mono"
                >
                  {arg}
                </span>
              ))}
            </div>
          </div>

          {/* Hardware Details */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Hardware Details</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Cpu size={12} />
                  <span className="font-medium">CPU</span>
                </div>
                <p className="text-gray-600 dark:text-gray-400">{hardware.cpu_cores} cores</p>
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <HardDrive size={12} />
                  <span className="font-medium">RAM</span>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                  {formatMemory(hardware.ram_available_mb)} / {formatMemory(hardware.ram_total_mb)}
                </p>
              </div>

              {hardware.has_gpu && (
                <div className="col-span-2">
                  <div className="flex items-center gap-1 mb-1">
                    <Monitor size={12} />
                    <span className="font-medium">GPU</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400">{hardware.gpu_name}</p>
                  {hardware.vram_total_mb && (
                    <p className="text-gray-600 dark:text-gray-400">
                      VRAM: {formatMemory(hardware.vram_available_mb || 0)} / {formatMemory(hardware.vram_total_mb)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recommended Models */}
          {runtime.recommended_models.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Recommended Models</h4>
              <div className="flex flex-wrap gap-1">
                {runtime.recommended_models.map((model, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs rounded"
                  >
                    {model}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Platform Info */}
          {hardware.platform && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Platform: {hardware.platform}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HardwareStatusBadge;
