# Plugin Tauri Integration Guide

This guide explains how to integrate real Tauri backend commands into the plugin system for accessing system APIs, file system operations, and other native functionality.

## Overview

The plugin system is designed to be extensible with real system integration through Tauri commands. This allows plugins to:

- Access the file system (read/write files)
- Execute system commands
- Interact with hardware (audio, camera, etc.)
- Access system information
- Perform network operations with proper permissions

## Basic Integration Pattern

### 1. Define Tauri Commands in Rust

First, add your command to `src-tauri/src/main.rs`:

```rust
// In src-tauri/src/main.rs
use tauri::command;
use std::fs;
use std::path::Path;

#[command]
async fn read_file_content(file_path: String) -> Result<String, String> {
    match fs::read_to_string(&file_path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file: {}", e))
    }
}

#[command]
async fn write_file_content(file_path: String, content: String) -> Result<(), String> {
    match fs::write(&file_path, content) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write file: {}", e))
    }
}

#[command]
async fn list_directory(dir_path: String) -> Result<Vec<String>, String> {
    match fs::read_dir(&dir_path) {
        Ok(entries) => {
            let mut files = Vec::new();
            for entry in entries {
                if let Ok(entry) = entry {
                    if let Some(name) = entry.file_name().to_str() {
                        files.push(name.to_string());
                    }
                }
            }
            Ok(files)
        },
        Err(e) => Err(format!("Failed to read directory: {}", e))
    }
}

// Add to the invoke_handler in main()
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // ... existing commands ...
            read_file_content,
            write_file_content,
            list_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 2. Create Enhanced Plugin with Tauri Integration

```typescript
// src/plugins/fileManager/index.ts
import { invoke } from '@tauri-apps/api/core';
import { Plugin, PluginContext, PluginResult } from '../../types';

interface FileManagerContext extends PluginContext {
  operation?: 'read' | 'write' | 'list';
  filePath?: string;
  content?: string;
}

export const fileManagerPlugin: Plugin = {
  manifest: {
    name: 'fileManager',
    version: '1.0.0',
    description: 'Advanced file system operations with Tauri integration',
    category: 'file',
    triggerWords: ['file', 'read', 'write', 'save', 'open', 'directory', 'folder'],
    keywords: ['file', 'read', 'write', 'save', 'open', 'directory', 'list', 'folder'],
    permissions: ['fs:read', 'fs:write'] // Document required permissions
  },

  async run(input: string, context: FileManagerContext): Promise<PluginResult> {
    try {
      const operation = extractOperation(input);
      const filePath = extractFilePath(input);

      switch (operation) {
        case 'read':
          return await readFile(filePath);
        
        case 'write':
          const content = extractContent(input);
          return await writeFile(filePath, content);
        
        case 'list':
          return await listDirectory(filePath);
        
        default:
          return {
            success: false,
            error: 'Unknown file operation. Supported: read, write, list'
          };
      }
    } catch (error) {
      return {
        success: false,
        error: `File operation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

// Helper functions
async function readFile(filePath: string): Promise<PluginResult> {
  try {
    const content = await invoke<string>('read_file_content', { filePath });
    return {
      success: true,
      data: { content, filePath },
      message: `Successfully read file: ${filePath}`
    };
  } catch (error) {
    throw new Error(`Failed to read file: ${error}`);
  }
}

async function writeFile(filePath: string, content: string): Promise<PluginResult> {
  try {
    await invoke<void>('write_file_content', { filePath, content });
    return {
      success: true,
      data: { filePath, bytesWritten: content.length },
      message: `Successfully wrote ${content.length} bytes to: ${filePath}`
    };
  } catch (error) {
    throw new Error(`Failed to write file: ${error}`);
  }
}

async function listDirectory(dirPath: string): Promise<PluginResult> {
  try {
    const files = await invoke<string[]>('list_directory', { dirPath });
    return {
      success: true,
      data: { files, directory: dirPath, count: files.length },
      message: `Found ${files.length} items in: ${dirPath}`
    };
  } catch (error) {
    throw new Error(`Failed to list directory: ${error}`);
  }
}

// Input parsing helpers
function extractOperation(input: string): 'read' | 'write' | 'list' {
  const lower = input.toLowerCase();
  if (lower.includes('read') || lower.includes('open')) return 'read';
  if (lower.includes('write') || lower.includes('save')) return 'write';
  if (lower.includes('list') || lower.includes('directory') || lower.includes('folder')) return 'list';
  return 'read'; // default
}

function extractFilePath(input: string): string {
  // Simple regex to extract file paths - enhance as needed
  const pathMatch = input.match(/["']([^"']+)["']/) || input.match(/(\S+\.\w+)/);
  return pathMatch ? pathMatch[1] : './';
}

function extractContent(input: string): string {
  // Extract content between quotes or after "content:" keyword
  const contentMatch = input.match(/content:\s*["']([^"']+)["']/) || 
                      input.match(/["']([^"']+)["']/);
  return contentMatch ? contentMatch[1] : '';
}
```

### 3. System Information Plugin Example

```typescript
// src/plugins/systemInfo/index.ts
import { invoke } from '@tauri-apps/api/core';
import { Plugin, PluginResult } from '../../types';

export const systemInfoPlugin: Plugin = {
  manifest: {
    name: 'systemInfo',
    version: '1.0.0',
    description: 'Get system information and hardware details',
    category: 'system',
    triggerWords: ['system', 'hardware', 'info', 'specs'],
    keywords: ['system', 'hardware', 'cpu', 'memory', 'disk', 'os', 'info', 'specs']
  },

  async run(input: string): Promise<PluginResult> {
    try {
      // Use existing Tauri command
      const systemInfo = await invoke<any>('get_system_info');
      
      const formattedInfo = formatSystemInfo(systemInfo);
      
      return {
        success: true,
        data: systemInfo,
        message: formattedInfo
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get system info: ${error}`
      };
    }
  }
};

function formatSystemInfo(info: any): string {
  return `
**System Information:**
- OS: ${info.os_type} ${info.os_version}
- Architecture: ${info.arch}
- CPU Cores: ${info.cpu_count}
- Total Memory: ${Math.round(info.total_memory / 1024 / 1024 / 1024)} GB
- Available Memory: ${Math.round(info.available_memory / 1024 / 1024 / 1024)} GB
- Hostname: ${info.hostname}
  `.trim();
}
```

## Advanced Integration Patterns

### 4. Async Operations with Progress

```typescript
// For long-running operations
export const backupPlugin: Plugin = {
  manifest: {
    name: 'backup',
    version: '1.0.0',
    description: 'Create system backups with progress tracking',
    category: 'utility',
    triggerWords: ['backup', 'archive', 'export'],
    keywords: ['backup', 'archive', 'export', 'save', 'copy']
  },

  async run(input: string, context): Promise<PluginResult> {
    try {
      // Start backup operation
      const backupId = await invoke<string>('start_backup', {
        sourcePath: extractSourcePath(input),
        targetPath: extractTargetPath(input)
      });

      // Poll for progress (in a real implementation, you might use events)
      let progress = 0;
      while (progress < 100) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        progress = await invoke<number>('get_backup_progress', { backupId });
        
        // You could emit progress events here for UI updates
        console.log(`Backup progress: ${progress}%`);
      }

      const result = await invoke<any>('get_backup_result', { backupId });
      
      return {
        success: true,
        data: result,
        message: `Backup completed successfully. ${result.filesBackedUp} files backed up.`
      };
    } catch (error) {
      return {
        success: false,
        error: `Backup failed: ${error}`
      };
    }
  }
};
```

### 5. Error Handling and Validation

```typescript
// Enhanced error handling
export const secureFilePlugin: Plugin = {
  manifest: {
    name: 'secureFile',
    version: '1.0.0',
    description: 'Secure file operations with validation',
    category: 'file',
    triggerWords: ['secure', 'encrypt', 'decrypt'],
    keywords: ['secure', 'encrypt', 'decrypt', 'safe', 'protected']
  },

  async run(input: string): Promise<PluginResult> {
    try {
      // Validate input
      const validation = validateSecureFileInput(input);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid input: ${validation.error}`
        };
      }

      // Check permissions
      const hasPermission = await invoke<boolean>('check_file_permissions', {
        filePath: validation.filePath
      });

      if (!hasPermission) {
        return {
          success: false,
          error: 'Insufficient permissions to access the specified file'
        };
      }

      // Perform secure operation
      const result = await invoke<any>('secure_file_operation', {
        operation: validation.operation,
        filePath: validation.filePath,
        options: validation.options
      });

      return {
        success: true,
        data: result,
        message: `Secure ${validation.operation} operation completed successfully`
      };

    } catch (error) {
      // Log error for debugging but don't expose sensitive details
      console.error('Secure file operation error:', error);
      
      return {
        success: false,
        error: 'Secure file operation failed. Please check the logs for details.'
      };
    }
  }
};

function validateSecureFileInput(input: string): {
  valid: boolean;
  error?: string;
  filePath?: string;
  operation?: string;
  options?: any;
} {
  // Implement your validation logic
  const filePath = extractFilePath(input);
  const operation = extractOperation(input);

  if (!filePath) {
    return { valid: false, error: 'File path is required' };
  }

  if (!['encrypt', 'decrypt'].includes(operation)) {
    return { valid: false, error: 'Operation must be encrypt or decrypt' };
  }

  return {
    valid: true,
    filePath,
    operation,
    options: {}
  };
}
```

## Best Practices

### Security Considerations

1. **Validate all inputs** before passing to Tauri commands
2. **Check permissions** before performing sensitive operations
3. **Sanitize file paths** to prevent directory traversal attacks
4. **Log security events** for audit purposes
5. **Use principle of least privilege** - only request necessary permissions

### Error Handling

1. **Graceful degradation** - provide fallback functionality when Tauri commands fail
2. **User-friendly error messages** - don't expose internal error details
3. **Proper logging** - log detailed errors for debugging
4. **Timeout handling** - set reasonable timeouts for long operations

### Performance

1. **Async operations** - use async/await for all Tauri commands
2. **Progress feedback** - provide progress updates for long operations
3. **Resource cleanup** - properly clean up resources after operations
4. **Caching** - cache frequently accessed data when appropriate

## Integration Checklist

- [ ] Define Tauri commands in Rust backend
- [ ] Add commands to `invoke_handler` in main.rs
- [ ] Create plugin with proper manifest
- [ ] Implement input parsing and validation
- [ ] Add comprehensive error handling
- [ ] Test with various input scenarios
- [ ] Document required permissions
- [ ] Add to plugin loader in `src/core/plugins/loader.ts`

This integration pattern allows your plugins to leverage the full power of Tauri's system access while maintaining the clean, modular architecture of the plugin system.
