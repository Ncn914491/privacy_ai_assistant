import { Plugin, PluginManifest } from '../../types';
import { PluginLoader } from './types';
import { pluginRegistry } from './registry';

/**
 * Plugin Loader - Loads and validates plugins from the plugins directory
 */
export class PluginLoaderImpl implements PluginLoader {
  private loadedPlugins: Map<string, Plugin> = new Map();

  /**
   * Load a single plugin from a given path
   */
  async loadPlugin(pluginPath: string): Promise<Plugin> {
    try {
      // In a real implementation, this would dynamically import the plugin
      // For now, we'll handle this through static imports in the registry
      throw new Error('Dynamic plugin loading not implemented yet');
    } catch (error) {
      console.error(`Failed to load plugin from ${pluginPath}:`, error);
      throw error;
    }
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadAllPlugins(): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    
    try {
      // Import all core plugins
      const { todoListPlugin } = await import('../../plugins/todoList');
      const { noteTakerPlugin } = await import('../../plugins/noteTaker');
      const { fileReaderPlugin } = await import('../../plugins/fileReader');
      const { fileWriterPlugin } = await import('../../plugins/fileWriter');
      const { pluginInspectorPlugin } = await import('../../plugins/pluginInspector');

      const corePlugins = [
        todoListPlugin,
        noteTakerPlugin,
        fileReaderPlugin,
        fileWriterPlugin,
        pluginInspectorPlugin
      ];

      // Validate and register each plugin
      for (const plugin of corePlugins) {
        if (this.validatePlugin(plugin)) {
          pluginRegistry.register(plugin);
          plugins.push(plugin);
          this.loadedPlugins.set(plugin.manifest.name, plugin);
        } else {
          console.warn(`Plugin validation failed for: ${plugin.manifest?.name || 'unknown'}`);
        }
      }

      console.log(`Successfully loaded ${plugins.length} plugins`);
      return plugins;
    } catch (error) {
      console.error('Failed to load plugins:', error);
      return [];
    }
  }

  /**
   * Validate a plugin structure and manifest
   */
  validatePlugin(plugin: Plugin): boolean {
    try {
      // Check if plugin has required properties
      if (!plugin || typeof plugin !== 'object') {
        console.error('Plugin must be an object');
        return false;
      }

      if (!plugin.manifest) {
        console.error('Plugin must have a manifest');
        return false;
      }

      if (!plugin.run || typeof plugin.run !== 'function') {
        console.error('Plugin must have a run function');
        return false;
      }

      // Validate manifest
      const manifest = plugin.manifest;
      
      if (!manifest.name || typeof manifest.name !== 'string') {
        console.error('Plugin manifest must have a valid name');
        return false;
      }

      if (!manifest.description || typeof manifest.description !== 'string') {
        console.error('Plugin manifest must have a valid description');
        return false;
      }

      if (!manifest.version || typeof manifest.version !== 'string') {
        console.error('Plugin manifest must have a valid version');
        return false;
      }

      if (!Array.isArray(manifest.keywords)) {
        console.error('Plugin manifest must have keywords array');
        return false;
      }

      if (!Array.isArray(manifest.triggerWords)) {
        console.error('Plugin manifest must have triggerWords array');
        return false;
      }

      if (!manifest.category) {
        console.error('Plugin manifest must have a category');
        return false;
      }

      // Validate category
      const validCategories = ['productivity', 'utility', 'system', 'file', 'other'];
      if (!validCategories.includes(manifest.category)) {
        console.error(`Plugin category must be one of: ${validCategories.join(', ')}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Plugin validation error:', error);
      return false;
    }
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): Plugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(pluginName: string): boolean {
    return this.loadedPlugins.has(pluginName);
  }

  /**
   * Reload all plugins
   */
  async reloadPlugins(): Promise<Plugin[]> {
    this.loadedPlugins.clear();
    pluginRegistry.clear();
    return await this.loadAllPlugins();
  }
}

// Export singleton instance
export const pluginLoader = new PluginLoaderImpl();
export default PluginLoaderImpl;
