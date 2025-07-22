import React from 'react';
import { Wifi, WifiOff, AlertCircle, CheckCircle, Clock, Shield } from 'lucide-react';
import { cn } from '../utils/cn';
import { MicPermissionState } from '../utils/microphonePermissions';

interface ConnectionStatusIndicatorProps {
  isConnected: boolean;
  micPermission: MicPermissionState;
  backendHealth?: boolean;
  voskInitialized?: boolean;
  className?: string;
  showDetails?: boolean;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
  isConnected,
  micPermission,
  backendHealth = false,
  voskInitialized = false,
  className,
  showDetails = false
}) => {
  const getOverallStatus = () => {
    if (micPermission === 'unavailable') {
      return {
        icon: Shield,
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
        status: 'Microphone Unavailable',
        description: 'Microphone access is not supported or blocked'
      };
    }

    if (micPermission === 'denied') {
      return {
        icon: AlertCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
        status: 'Permission Denied',
        description: 'Microphone access has been denied'
      };
    }

    if (micPermission === 'checking') {
      return {
        icon: Clock,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        borderColor: 'border-yellow-200 dark:border-yellow-800',
        status: 'Checking Permissions',
        description: 'Checking microphone access permissions'
      };
    }

    if (!backendHealth) {
      return {
        icon: WifiOff,
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
        status: 'Backend Disconnected',
        description: 'Python backend is not running or unreachable'
      };
    }

    if (!voskInitialized) {
      return {
        icon: AlertCircle,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        borderColor: 'border-yellow-200 dark:border-yellow-800',
        status: 'STT Not Ready',
        description: 'Speech recognition engine is not initialized'
      };
    }

    if (!isConnected) {
      return {
        icon: WifiOff,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        borderColor: 'border-yellow-200 dark:border-yellow-800',
        status: 'WebSocket Disconnected',
        description: 'Real-time connection is not established'
      };
    }

    if (micPermission === 'prompt') {
      return {
        icon: AlertCircle,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        borderColor: 'border-yellow-200 dark:border-yellow-800',
        status: 'Permission Needed',
        description: 'Microphone permission is required for voice input'
      };
    }

    return {
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      status: 'Ready',
      description: 'All systems are ready for voice input'
    };
  };

  const status = getOverallStatus();
  const StatusIcon = status.icon;

  if (!showDetails) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <StatusIcon className={cn("w-4 h-4", status.color)} />
        <span className={cn("text-sm font-medium", status.color)}>
          {status.status}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "p-3 rounded-lg border",
      status.bgColor,
      status.borderColor,
      className
    )}>
      <div className="flex items-center gap-2 mb-2">
        <StatusIcon className={cn("w-5 h-5", status.color)} />
        <span className={cn("font-medium", status.color)}>
          {status.status}
        </span>
      </div>
      
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        {status.description}
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Backend:</span>
          <div className="flex items-center gap-1">
            {backendHealth ? (
              <CheckCircle className="w-3 h-3 text-green-500" />
            ) : (
              <AlertCircle className="w-3 h-3 text-red-500" />
            )}
            <span className={backendHealth ? 'text-green-600' : 'text-red-600'}>
              {backendHealth ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">STT Engine:</span>
          <div className="flex items-center gap-1">
            {voskInitialized ? (
              <CheckCircle className="w-3 h-3 text-green-500" />
            ) : (
              <AlertCircle className="w-3 h-3 text-yellow-500" />
            )}
            <span className={voskInitialized ? 'text-green-600' : 'text-yellow-600'}>
              {voskInitialized ? 'Ready' : 'Not Ready'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">WebSocket:</span>
          <div className="flex items-center gap-1">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-green-500" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-500" />
            )}
            <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Microphone:</span>
          <div className="flex items-center gap-1">
            {micPermission === 'granted' ? (
              <CheckCircle className="w-3 h-3 text-green-500" />
            ) : micPermission === 'checking' ? (
              <Clock className="w-3 h-3 text-yellow-500" />
            ) : micPermission === 'unavailable' ? (
              <Shield className="w-3 h-3 text-red-500" />
            ) : (
              <AlertCircle className="w-3 h-3 text-yellow-500" />
            )}
            <span className={
              micPermission === 'granted' ? 'text-green-600' :
              micPermission === 'checking' ? 'text-yellow-600' :
              micPermission === 'unavailable' ? 'text-red-600' :
              'text-yellow-600'
            }>
              {micPermission === 'granted' ? 'Granted' :
               micPermission === 'checking' ? 'Checking' :
               micPermission === 'unavailable' ? 'Unavailable' :
               micPermission === 'denied' ? 'Denied' :
               'Needed'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionStatusIndicator;

