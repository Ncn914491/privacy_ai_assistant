import { Plugin } from '../../types';
import { PluginRegistryInterface } from './types';

/**
 * Plugin Registry - Manages all loaded plugins
 */
class PluginRegistry implements PluginRegistryInterface {
  private plugins: Map<string, Plugin> = new Map();

  /**
   * Register a plugin in the registry
   */
  register(plugin: Plugin): void {
    if (!plugin.manifest?.name) {
      throw new Error('Plugin must have a valid manifest with a name');
    }

    if (this.plugins.has(plugin.manifest.name)) {
      console.warn(`Plugin ${plugin.manifest.name} is already registered. Overwriting...`);
    }

    this.plugins.set(plugin.manifest.name, plugin);
    console.log(`Plugin registered: ${plugin.manifest.name}`);
  }

  /**
   * Unregister a plugin from the registry
   */
  unregister(pluginName: string): void {
    if (this.plugins.has(pluginName)) {
      this.plugins.delete(pluginName);
      console.log(`Plugin unregistered: ${pluginName}`);
    } else {
      console.warn(`Plugin ${pluginName} not found in registry`);
    }
  }

  /**
   * Get a specific plugin by name
   */
  get(pluginName: string): Plugin | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * Get all registered plugins
   */
  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Find plugins that match a specific keyword
   */
  findByKeyword(keyword: string): Plugin[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.getAll().filter(plugin => 
      plugin.manifest.keywords.some(k => k.toLowerCase().includes(lowerKeyword)) ||
      plugin.manifest.triggerWords.some(t => t.toLowerCase().includes(lowerKeyword))
    );
  }

  /**
   * Clear all plugins from the registry
   */
  clear(): void {
    this.plugins.clear();
    console.log('Plugin registry cleared');
  }

  /**
   * Get plugin count
   */
  count(): number {
    return this.plugins.size;
  }

  /**
   * Check if a plugin is registered
   */
  has(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }

  /**
   * Get plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugins by category
   */
  getByCategory(category: string): Plugin[] {
    return this.getAll().filter(plugin => 
      plugin.manifest.category === category
    );
  }
}

// Export singleton instance
export const pluginRegistry = new PluginRegistry();
export default PluginRegistry;
