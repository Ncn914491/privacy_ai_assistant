import { Plugin } from '../../types';
import { PluginDetectionResult } from './types';
import { pluginRegistry } from './registry';

/**
 * Plugin Detector - Analyzes user input to determine which plugin should be executed
 */
export class PluginDetector {
  private keywordMatchThreshold: number = 0.6;

  constructor(threshold: number = 0.6) {
    this.keywordMatchThreshold = threshold;
  }

  /**
   * Detect if any plugin should be triggered by the user input
   */
  detectPlugin(input: string): PluginDetectionResult | null {
    const normalizedInput = input.toLowerCase().trim();
    const plugins = pluginRegistry.getAll();

    let bestMatch: PluginDetectionResult | null = null;
    let highestConfidence = 0;

    for (const plugin of plugins) {
      const result = this.analyzePluginMatch(plugin, normalizedInput);
      
      if (result.shouldExecute && result.confidence > highestConfidence) {
        highestConfidence = result.confidence;
        bestMatch = result;
      }
    }

    return bestMatch;
  }

  /**
   * Analyze if a specific plugin matches the input
   */
  private analyzePluginMatch(plugin: Plugin, normalizedInput: string): PluginDetectionResult {
    const manifest = plugin.manifest;
    const matchedKeywords: string[] = [];
    let totalMatches = 0;
    let totalPossibleMatches = 0;

    // Check trigger words (higher weight)
    for (const triggerWord of manifest.triggerWords) {
      totalPossibleMatches += 2; // Trigger words have double weight
      const normalizedTrigger = triggerWord.toLowerCase();
      
      if (normalizedInput.includes(normalizedTrigger)) {
        matchedKeywords.push(triggerWord);
        totalMatches += 2;
      }
    }

    // Check keywords (normal weight)
    for (const keyword of manifest.keywords) {
      totalPossibleMatches += 1;
      const normalizedKeyword = keyword.toLowerCase();
      
      if (normalizedInput.includes(normalizedKeyword)) {
        matchedKeywords.push(keyword);
        totalMatches += 1;
      }
    }

    // Calculate confidence score
    const confidence = totalPossibleMatches > 0 ? totalMatches / totalPossibleMatches : 0;
    const shouldExecute = confidence >= this.keywordMatchThreshold && matchedKeywords.length > 0;

    // Extract the relevant input for the plugin
    const extractedInput = this.extractRelevantInput(normalizedInput, matchedKeywords);

    return {
      shouldExecute,
      pluginName: manifest.name,
      confidence,
      matchedKeywords,
      extractedInput
    };
  }

  /**
   * Extract the relevant part of the input for plugin execution
   */
  private extractRelevantInput(input: string, matchedKeywords: string[]): string {
    // Remove matched keywords from the input to get the actual command/content
    let cleanedInput = input;
    
    for (const keyword of matchedKeywords) {
      const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
      cleanedInput = cleanedInput.replace(regex, '').trim();
    }

    // Remove common command prefixes
    cleanedInput = cleanedInput.replace(/^(please|can you|could you|help me|i want to|i need to)\s+/i, '');
    
    return cleanedInput.trim();
  }

  /**
   * Get all plugins that could potentially match the input
   */
  getPotentialMatches(input: string): PluginDetectionResult[] {
    const normalizedInput = input.toLowerCase().trim();
    const plugins = pluginRegistry.getAll();
    const results: PluginDetectionResult[] = [];

    for (const plugin of plugins) {
      const result = this.analyzePluginMatch(plugin, normalizedInput);
      if (result.confidence > 0) {
        results.push(result);
      }
    }

    // Sort by confidence (highest first)
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Set the keyword match threshold
   */
  setThreshold(threshold: number): void {
    this.keywordMatchThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.keywordMatchThreshold;
  }
}

// Export singleton instance
export const pluginDetector = new PluginDetector();
export default PluginDetector;
