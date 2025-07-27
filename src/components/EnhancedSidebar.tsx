import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../utils/cn';
import {
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageSquare,
  Edit2,
  Trash2,
  MoreHorizontal,
  Copy,
  Check,
  X,
  Download,
  Upload,
  Search,
  Filter,
  Archive,
  Settings,
  FileText,
  CheckSquare,
  Package,
  Globe,
  FolderOpen,
  Eye,
  Zap
} from 'lucide-react';
import { useAppStore } from '../stores/chatStore';
import { useEnhancedChatStore } from '../stores/enhancedChatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { ChatSessionSummary } from '../types';
import ToolDashboard from './ToolDashboard';

interface ChatItemProps {
  session: ChatSessionSummary;
  isActive: boolean;
  onSelect: (chatId: string) => void;
  onRename: (chatId: string, newTitle: string) => void;
  onDelete: (chatId: string) => void;
  onDuplicate: (chatId: string) => void;
  onExport: (chatId: string) => void;
  onArchive: (chatId: string) => void;
}

const ChatItem: React.FC<ChatItemProps> = ({
  session,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onDuplicate,
  onExport,
  onArchive
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [showMenu, setShowMenu] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleSaveEdit = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(session.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(session.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const formatLastActivity = (date: Date | null | undefined) => {
    if (!date) return 'No activity';
    
    const activityDate = date instanceof Date ? date : new Date(date);
    if (isNaN(activityDate.getTime())) return 'Invalid date';

    const now = new Date();
    const diff = now.getTime() - activityDate.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return activityDate.toLocaleDateString();
  };

  return (
    <div
      className={cn(
        'group relative p-3 rounded-lg cursor-pointer transition-all duration-200',
        isActive
          ? 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-blue-500'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      )}
      onClick={() => !isEditing && onSelect(session.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                ref={editInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleSaveEdit}
                className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                  {session.title}
                </h3>
              </div>
              
              {session.lastMessage && (
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 truncate">
                  {session.lastMessage.length > 60
                    ? `${session.lastMessage.substring(0, 60)}...`
                    : session.lastMessage}
                </p>
              )}

              <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">
                    {session.messageCount}
                  </span>
                  <span>{formatLastActivity(session.lastActivity)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {!isEditing && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded transition-opacity"
            >
              <MoreHorizontal size={16} />
            </button>

            {showMenu && (
              <div
                ref={menuRef}
                className="absolute right-0 top-8 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
                >
                  <Edit2 size={14} />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(session.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Copy size={14} />
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive(session.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Archive size={14} />
                  Archive
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExport(session.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Download size={14} />
                  Export Chat
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-b-lg"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const EnhancedSidebar: React.FC = () => {
  const [showSidebar, setShowSidebar] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPluginSidebar, setShowPluginSidebar] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  
  const { preferences, setTheme } = useAppStore();
  const { settings, updateUIPreferences } = useSettingsStore();
  const {
    chatSummaries,
    chatSessions,
    activeChatId,
    createNewChatWithTitle,
    searchChats,
    getRecentChats,
    switchToChat,
    renameChat,
    deleteChat,
    archiveChat,
    exportAllChats,
    isLoading
  } = useEnhancedChatStore();

  // Plugin icons mapping
  const pluginIcons = {
    todoList: CheckSquare,
    noteTaker: FileText,
    fileReader: FolderOpen,
    fileWriter: FileText,
    pluginInspector: Eye,
    devDiagnostics: Zap,
    webBrowser: Globe
  };

  const availablePlugins = [
    {
      id: 'todoList',
      name: 'Todo List',
      icon: CheckSquare,
      color: 'text-blue-600',
      description: 'Manage your tasks and to-do items with this comprehensive task management tool.'
    },
    {
      id: 'noteTaker',
      name: 'Note Taker',
      icon: FileText,
      color: 'text-green-600',
      description: 'Create, organize, and manage your notes and documentation efficiently.'
    },
    {
      id: 'fileReader',
      name: 'File Reader',
      icon: FolderOpen,
      color: 'text-yellow-600',
      description: 'Read and analyze files from your system with advanced parsing capabilities.'
    },
    {
      id: 'fileWriter',
      name: 'File Writer',
      icon: FileText,
      color: 'text-purple-600',
      description: 'Create and write files to your system with various format support.'
    },
    {
      id: 'pluginInspector',
      name: 'Plugin Inspector',
      icon: Eye,
      color: 'text-indigo-600',
      description: 'Inspect and debug plugin functionality and system integration.'
    },
    {
      id: 'devDiagnostics',
      name: 'Dev Diagnostics',
      icon: Zap,
      color: 'text-red-600',
      description: 'Advanced diagnostic tools for development and system troubleshooting.'
    },
    {
      id: 'webBrowser',
      name: 'Web Browser',
      icon: Globe,
      color: 'text-cyan-600',
      description: 'Browse the web and extract information from websites.'
    }
  ];

  const toggleSidebar = () => setShowSidebar(!showSidebar);

  const handleThemeToggle = () => {
    const newTheme = preferences.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  const handleNewChat = async () => {
    try {
      await createNewChatWithTitle(`New Chat ${new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`);
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  const handleToolClick = (toolId: string) => {
    setSelectedTool(toolId);
    setShowPluginSidebar(false); // Close plugin sidebar when opening tool dashboard
  };

  // Chat session handlers
  const handleSelectChat = async (chatId: string) => {
    try {
      await switchToChat(chatId);
      console.log('Switched to chat:', chatId);
    } catch (error) {
      console.error('Failed to switch to chat:', error);
    }
  };

  const handleRenameChat = async (chatId: string, newTitle: string) => {
    try {
      await renameChat(chatId, newTitle);
      console.log('Renamed chat:', chatId, 'to:', newTitle);
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await deleteChat(chatId);
      console.log('Deleted chat:', chatId);
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const handleDuplicateChat = async (chatId: string) => {
    try {
      const session = chatSessions[chatId];
      if (session) {
        const newChatId = await createNewChatWithTitle(`${session.title} (Copy)`);
        console.log('Duplicated chat:', chatId, 'as:', newChatId);
      }
    } catch (error) {
      console.error('Failed to duplicate chat:', error);
    }
  };

  const handleExportChat = async (chatId: string) => {
    try {
      const session = chatSessions[chatId];
      if (session) {
        const exportData = JSON.stringify(session, null, 2);
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-${session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Exported chat:', chatId);
      }
    } catch (error) {
      console.error('Failed to export chat:', error);
    }
  };

  const handleArchiveChat = async (chatId: string) => {
    try {
      await archiveChat(chatId);
      console.log('Archived chat:', chatId);
    } catch (error) {
      console.error('Failed to archive chat:', error);
    }
  };

  const handleToolExecute = async (data: any) => {
    console.log('Executing tool:', selectedTool, 'with data:', data);

    try {
      // Store tool context for LLM integration
      const toolContext = {
        toolName: selectedTool,
        toolData: data.toolData,
        context: data.context,
        timestamp: new Date().toISOString()
      };

      // Save to localStorage for LLM context integration
      const existingContext = JSON.parse(localStorage.getItem('toolContext') || '{}');
      existingContext[selectedTool || 'unknown'] = toolContext;
      localStorage.setItem('toolContext', JSON.stringify(existingContext));

      console.log('Tool context saved for LLM integration:', toolContext);

      return { success: true, message: 'Tool executed and context saved for LLM' };
    } catch (error) {
      console.error('Tool execution failed:', error);
      return { success: false, message: 'Tool execution failed' };
    }
  };

  // Filter chats based on search query
  const filteredChats = searchQuery.trim() 
    ? searchChats(searchQuery)
    : getRecentChats(50);

  return (
    <>
      <button
        type="button"
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
      >
        {showSidebar ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>

      <div
        className={cn(
          'fixed top-0 left-0 h-full transition-transform transform z-40 flex',
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Main Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-900 shadow-lg flex flex-col border-r border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
            <button
              type="button"
              onClick={handleNewChat}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
            >
              <Plus size={18} />
              New Chat
            </button>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto p-2">
            {filteredChats.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-sm">
                  {searchQuery ? 'No chats found' : 'No chats yet'}
                </p>
                <p className="text-xs mt-1">
                  {searchQuery ? 'Try a different search term' : 'Create your first chat to get started'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredChats.map((session) => (
                  <ChatItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeChatId}
                    onSelect={handleSelectChat}
                    onRename={handleRenameChat}
                    onDelete={handleDeleteChat}
                    onDuplicate={handleDuplicateChat}
                    onExport={handleExportChat}
                    onArchive={handleArchiveChat}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleThemeToggle}
              className="flex items-center gap-3 p-4 w-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span>{preferences.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</span>
              <span className="text-sm">Toggle Dark Mode</span>
            </button>

            <div className="px-4 pb-4">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Privacy AI Assistant</span>
                <span>v0.2.0</span>
              </div>
            </div>
          </div>
        </div>

        {/* Plugin Sidebar */}
        {settings.uiPreferences.showPluginSidebar && (
          <div className="w-16 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 space-y-3">
            {availablePlugins.map((plugin) => {
              const IconComponent = plugin.icon;
              return (
                <button
                  key={plugin.id}
                  type="button"
                  onClick={() => handleToolClick(plugin.id)}
                  className={cn(
                    "p-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
                    plugin.color
                  )}
                  title={plugin.name}
                >
                  <IconComponent size={20} />
                </button>
              );
            })}
            
            <div className="flex-1" />
            
            <button
              type="button"
              onClick={() => updateUIPreferences({ showPluginSidebar: false })}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Hide Plugin Sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Overlay for mobile */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Tool Dashboard Modal */}
      {selectedTool && (
        <ToolDashboard
          toolName={availablePlugins.find(p => p.id === selectedTool)?.name || selectedTool}
          toolIcon={availablePlugins.find(p => p.id === selectedTool)?.icon || Package}
          toolColor={availablePlugins.find(p => p.id === selectedTool)?.color || 'text-gray-600'}
          description={availablePlugins.find(p => p.id === selectedTool)?.description || 'Tool dashboard'}
          onClose={() => setSelectedTool(null)}
          onExecute={handleToolExecute}
        />
      )}
    </>
  );
};

export default EnhancedSidebar;
