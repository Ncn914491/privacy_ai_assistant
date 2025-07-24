import { Plugin, PluginResult, PluginContext } from '../../types';
import { pluginRegistry } from '../../core/plugins/registry';

const manifest = {
  name: "pluginInspector",
  description: "Lists all registered plugins and their capabilities by reading manifests and providing plugin information",
  version: "1.0.0",
  author: "Privacy AI Assistant",
  keywords: ["plugins", "list", "help", "commands", "available"],
  triggerWords: ["list plugins", "show plugins", "available plugins", "plugin help", "what can you do"],
  category: "system" as const,
  permissions: []
};

/**
 * Plugin Inspector - Lists and provides information about all registered plugins
 */
class PluginInspectorPlugin implements Plugin {
  manifest = manifest;

  async run(input: string, context?: PluginContext): Promise<PluginResult> {
    try {
      const command = this.parseCommand(input);
      
      switch (command.action) {
        case 'list':
          return await this.listPlugins(command.category);
        case 'info':
          return await this.getPluginInfo(command.pluginName);
        case 'search':
          return await this.searchPlugins(command.query);
        case 'categories':
          return await this.listCategories();
        default:
          return await this.listPlugins();
      }
    } catch (error) {
      return {
        success: false,
        error: `Plugin inspector error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private parseCommand(input: string): { action: string; category?: string; pluginName?: string; query?: string } {
    const normalizedInput = input.toLowerCase().trim();
    
    // Get info about specific plugin
    if (normalizedInput.includes('info') || normalizedInput.includes('details')) {
      const pluginName = input.replace(/^(info|details)\s+(about\s+)?/i, '').trim();
      return { action: 'info', pluginName };
    }
    
    // Search plugins
    if (normalizedInput.includes('search') || normalizedInput.includes('find')) {
      const query = input.replace(/^(search|find)\s+(plugins?\s+)?/i, '').trim();
      return { action: 'search', query };
    }
    
    // List categories
    if (normalizedInput.includes('categories') || normalizedInput.includes('types')) {
      return { action: 'categories' };
    }
    
    // List plugins by category
    const categoryMatch = input.match(/\b(productivity|utility|system|file|other)\b/i);
    if (categoryMatch) {
      return { action: 'list', category: categoryMatch[1].toLowerCase() };
    }
    
    // Default to list all
    return { action: 'list' };
  }

  private async listPlugins(category?: string): Promise<PluginResult> {
    const allPlugins = pluginRegistry.getAll();
    
    if (allPlugins.length === 0) {
      return {
        success: true,
        message: 'No plugins are currently registered.',
        data: { plugins: [], count: 0 }
      };
    }

    let plugins = allPlugins;
    if (category) {
      plugins = pluginRegistry.getByCategory(category);
      if (plugins.length === 0) {
        return {
          success: true,
          message: `No plugins found in category "${category}".`,
          data: { plugins: [], count: 0, category }
        };
      }
    }

    let message = category 
      ? `🔌 **${category.charAt(0).toUpperCase() + category.slice(1)} Plugins** (${plugins.length})\n\n`
      : `🔌 **Available Plugins** (${plugins.length})\n\n`;

    // Group plugins by category if showing all
    if (!category) {
      const categories = this.groupPluginsByCategory(plugins);
      
      for (const [cat, catPlugins] of Object.entries(categories)) {
        if (catPlugins.length > 0) {
          message += `**${cat.charAt(0).toUpperCase() + cat.slice(1)} (${catPlugins.length})**\n`;
          catPlugins.forEach(plugin => {
            message += `• **${plugin.manifest.name}** - ${plugin.manifest.description}\n`;
            message += `  *Triggers:* ${plugin.manifest.triggerWords.join(', ')}\n`;
          });
          message += '\n';
        }
      }
    } else {
      // Show detailed list for specific category
      plugins.forEach((plugin, index) => {
        message += `**${index + 1}. ${plugin.manifest.name}**\n`;
        message += `${plugin.manifest.description}\n`;
        message += `*Triggers:* ${plugin.manifest.triggerWords.join(', ')}\n`;
        message += `*Keywords:* ${plugin.manifest.keywords.join(', ')}\n`;
        if (plugin.manifest.permissions && plugin.manifest.permissions.length > 0) {
          message += `*Permissions:* ${plugin.manifest.permissions.join(', ')}\n`;
        }
        message += '\n';
      });
    }

    message += `💡 *Use "plugin info [name]" for detailed information about a specific plugin.*`;

    return {
      success: true,
      message: message.trim(),
      data: { plugins, count: plugins.length, category }
    };
  }

  private async getPluginInfo(pluginName: string): Promise<PluginResult> {
    if (!pluginName || pluginName.trim().length === 0) {
      return {
        success: false,
        error: 'Please specify a plugin name'
      };
    }

    const plugin = pluginRegistry.get(pluginName.trim());
    
    if (!plugin) {
      // Try to find by partial match
      const allPlugins = pluginRegistry.getAll();
      const matches = allPlugins.filter(p => 
        p.manifest.name.toLowerCase().includes(pluginName.toLowerCase())
      );
      
      if (matches.length === 0) {
        return {
          success: false,
          error: `Plugin "${pluginName}" not found. Use "list plugins" to see available plugins.`
        };
      }
      
      if (matches.length > 1) {
        const names = matches.map(p => p.manifest.name).join(', ');
        return {
          success: false,
          error: `Multiple plugins match "${pluginName}": ${names}. Please be more specific.`
        };
      }
      
      // Use the single match
      return this.getPluginInfo(matches[0].manifest.name);
    }

    const manifest = plugin.manifest;
    
    let message = `🔌 **Plugin: ${manifest.name}**\n\n`;
    message += `**Description:** ${manifest.description}\n`;
    message += `**Version:** ${manifest.version}\n`;
    message += `**Category:** ${manifest.category}\n`;
    
    if (manifest.author) {
      message += `**Author:** ${manifest.author}\n`;
    }
    
    message += `\n**Trigger Words:**\n`;
    manifest.triggerWords.forEach(trigger => {
      message += `• "${trigger}"\n`;
    });
    
    message += `\n**Keywords:**\n`;
    manifest.keywords.forEach(keyword => {
      message += `• ${keyword}\n`;
    });
    
    if (manifest.permissions && manifest.permissions.length > 0) {
      message += `\n**Required Permissions:**\n`;
      manifest.permissions.forEach(permission => {
        message += `• ${permission}\n`;
      });
    }

    message += `\n**Usage Examples:**\n`;
    message += this.generateUsageExamples(manifest);

    return {
      success: true,
      message: message.trim(),
      data: { plugin: manifest }
    };
  }

  private async searchPlugins(query: string): Promise<PluginResult> {
    if (!query || query.trim().length === 0) {
      return {
        success: false,
        error: 'Please provide a search query'
      };
    }

    const allPlugins = pluginRegistry.getAll();
    const normalizedQuery = query.toLowerCase();
    
    const matches = allPlugins.filter(plugin => {
      const manifest = plugin.manifest;
      return (
        manifest.name.toLowerCase().includes(normalizedQuery) ||
        manifest.description.toLowerCase().includes(normalizedQuery) ||
        manifest.keywords.some(k => k.toLowerCase().includes(normalizedQuery)) ||
        manifest.triggerWords.some(t => t.toLowerCase().includes(normalizedQuery))
      );
    });

    if (matches.length === 0) {
      return {
        success: true,
        message: `No plugins found matching "${query}".`,
        data: { plugins: [], count: 0, query }
      };
    }

    let message = `🔍 **Search Results for "${query}"** (${matches.length})\n\n`;
    
    matches.forEach((plugin, index) => {
      message += `**${index + 1}. ${plugin.manifest.name}**\n`;
      message += `${plugin.manifest.description}\n`;
      message += `*Category:* ${plugin.manifest.category}\n`;
      message += `*Triggers:* ${plugin.manifest.triggerWords.join(', ')}\n\n`;
    });

    return {
      success: true,
      message: message.trim(),
      data: { plugins: matches, count: matches.length, query }
    };
  }

  private async listCategories(): Promise<PluginResult> {
    const allPlugins = pluginRegistry.getAll();
    const categories = this.groupPluginsByCategory(allPlugins);
    
    let message = `📂 **Plugin Categories**\n\n`;
    
    for (const [category, plugins] of Object.entries(categories)) {
      if (plugins.length > 0) {
        message += `**${category.charAt(0).toUpperCase() + category.slice(1)}** (${plugins.length} plugins)\n`;
        plugins.forEach(plugin => {
          message += `  • ${plugin.manifest.name}\n`;
        });
        message += '\n';
      }
    }

    message += `💡 *Use "list [category] plugins" to see detailed information for a specific category.*`;

    return {
      success: true,
      message: message.trim(),
      data: { categories: Object.keys(categories), pluginsByCategory: categories }
    };
  }

  private groupPluginsByCategory(plugins: Plugin[]): Record<string, Plugin[]> {
    const categories: Record<string, Plugin[]> = {
      productivity: [],
      utility: [],
      system: [],
      file: [],
      other: []
    };

    plugins.forEach(plugin => {
      const category = plugin.manifest.category || 'other';
      if (categories[category]) {
        categories[category].push(plugin);
      } else {
        categories.other.push(plugin);
      }
    });

    return categories;
  }

  private generateUsageExamples(manifest: any): string {
    const examples: string[] = [];
    
    // Generate examples based on plugin name and triggers
    switch (manifest.name) {
      case 'todoList':
        examples.push('• "add task buy groceries"');
        examples.push('• "list tasks"');
        examples.push('• "complete task buy groceries"');
        break;
      case 'noteTaker':
        examples.push('• "save note meeting notes from today"');
        examples.push('• "list notes"');
        examples.push('• "search notes meeting"');
        break;
      case 'fileReader':
        examples.push('• "read file document.txt"');
        examples.push('• "preview file readme.md 10 lines"');
        break;
      case 'fileWriter':
        examples.push('• "write file output.txt Hello World"');
        examples.push('• "append file log.txt New entry"');
        break;
      case 'pluginInspector':
        examples.push('• "list plugins"');
        examples.push('• "plugin info todoList"');
        break;
      default:
        // Generate generic examples from trigger words
        manifest.triggerWords.slice(0, 3).forEach((trigger: string) => {
          examples.push(`• "${trigger} [your input]"`);
        });
    }

    return examples.join('\n');
  }
}

export const pluginInspectorPlugin = new PluginInspectorPlugin();
