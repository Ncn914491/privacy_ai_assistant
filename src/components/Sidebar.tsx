import React, { useState } from 'react';
import { cn } from '@/utils/cn';
import { Sun, Moon, ChevronLeft, Settings, Info, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/stores/chatStore';

const Sidebar: React.FC = () => {
  const [showSidebar, setShowSidebar] = useState(true);
  const { preferences, setTheme } = useAppStore();

  const toggleSidebar = () => setShowSidebar(!showSidebar);

  const handleThemeToggle = () => {
    const newTheme = preferences.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  return (
    <>
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
      >
        {showSidebar ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>

      <div
        className={cn(
          'fixed top-0 left-0 h-full w-64 transition-transform transform',
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-full bg-white dark:bg-gray-900 shadow-md flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {/* Settings */}
            <button
              onClick={handleThemeToggle}
              className={"flex items-center gap-3 p-4 w-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"}
            >
              <span>{preferences.theme === 'dark' ? <Sun /> : <Moon />}</span>
              <span>Toggle Dark Mode</span>
            </button>

            {/* Placeholder sections */}
            <div className="mt-4">
              <button className="flex items-center gap-3 p-4 w-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                <Settings />
                <span>Settings</span>
              </button>
              <button className="flex items-center gap-3 p-4 w-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                <Info />
                <span>About</span>
              </button>
            </div>
          </div>

          <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
            <p>Version 0.1.0</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
