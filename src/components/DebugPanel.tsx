import React, { useState, useEffect } from 'react';
import { Bug, Download, Trash2, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { cn } from '../utils/cn';
import { getVoicePipelineDebugger } from '../utils/voicePipelineDebug';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  isOpen,
  onClose,
  className
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all');

  useEffect(() => {
    if (!isOpen) return;

    // Capture console logs
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };

    const addLog = (level: LogEntry['level'], args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data: args.length > 1 ? args.slice(1) : undefined
      };

      setLogs(prev => {
        const newLogs = [...prev, logEntry];
        // Keep only last 100 logs
        return newLogs.slice(-100);
      });
    };

    console.log = (...args) => {
      originalConsole.log(...args);
      addLog('info', args);
    };

    console.warn = (...args) => {
      originalConsole.warn(...args);
      addLog('warn', args);
    };

    console.error = (...args) => {
      originalConsole.error(...args);
      addLog('error', args);
    };

    console.debug = (...args) => {
      originalConsole.debug(...args);
      if (showDebugLogs) {
        addLog('debug', args);
      }
    };

    return () => {
      // Restore original console methods
      Object.assign(console, originalConsole);
    };
  }, [isOpen, showDebugLogs]);

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const debugger = getVoicePipelineDebugger();
    const exportData = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      logs: logs,
      voicePipelineDebug: debugger ? debugger.exportDebugData() : null,
      localStorage: {
        app_errors: localStorage.getItem('app_errors')
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => 
    filter === 'all' || log.level === filter
  );

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-600 dark:text-red-400';
      case 'warn': return 'text-yellow-600 dark:text-yellow-400';
      case 'debug': return 'text-gray-500 dark:text-gray-400';
      default: return 'text-gray-800 dark:text-gray-200';
    }
  };

  const getLevelBg = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'bg-red-50 dark:bg-red-900/20';
      case 'warn': return 'bg-yellow-50 dark:bg-yellow-900/20';
      case 'debug': return 'bg-gray-50 dark:bg-gray-800';
      default: return 'bg-white dark:bg-gray-900';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-3/4 flex flex-col",
        className
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Debug Panel
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({filteredLogs.length} logs)
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDebugLogs(!showDebugLogs)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showDebugLogs 
                  ? "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              )}
              title={showDebugLogs ? "Hide debug logs" : "Show debug logs"}
            >
              {showDebugLogs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            
            <button
              onClick={exportLogs}
              className="p-2 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors"
              title="Export debug data"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={clearLogs}
              className="p-2 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
              title="Clear logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            
            <button
              onClick={onClose}
              className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="warn">Warnings</option>
              <option value="error">Errors</option>
              <option value="debug">Debug</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>

        {/* Logs */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No logs to display
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-lg border text-sm",
                  getLevelBg(log.level),
                  "border-gray-200 dark:border-gray-700"
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={cn(
                    "text-xs font-medium uppercase px-2 py-1 rounded",
                    log.level === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                    log.level === 'warn' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                    log.level === 'debug' ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' :
                    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  )}>
                    {log.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <pre className={cn(
                      "whitespace-pre-wrap break-words font-mono text-xs",
                      getLevelColor(log.level)
                    )}>
                      {log.message}
                    </pre>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DebugPanel;

