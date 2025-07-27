import { GoogleGenerativeAI, GenerativeModel, GenerateContentStreamResult } from '@google/generative-ai';

// Google Gemini API configuration
const GEMINI_API_KEY = 'AIzaSyC757g1ptvolgutJo4JvHofjpAvhQXFoLM';
const DEFAULT_MODEL = 'gemini-1.5-flash';

export interface GeminiStreamOptions {
  streamId: string;
  systemPrompt?: string;
  onChunk?: (chunk: string, metadata?: any) => void;
  onComplete?: (fullContent: string, metadata?: any) => void;
  onError?: (error: string) => void;
}

export interface GeminiResponse {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: {
    model: string;
    provider: string;
    tokens?: number;
    responseTime: number;
  };
}

export class GeminiApiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private activeStreams: Map<string, AbortController> = new Map();

  constructor(apiKey: string = GEMINI_API_KEY, modelName: string = DEFAULT_MODEL) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  /**
   * Start streaming response from Gemini API
   */
  public async startStream(
    prompt: string,
    options: GeminiStreamOptions
  ): Promise<string> {
    const { streamId, systemPrompt, onChunk, onComplete, onError } = options;
    const startTime = Date.now();
    
    console.log(`🌐 [Gemini API] Starting stream ${streamId}...`);

    // Stop any existing stream with the same ID
    if (this.activeStreams.has(streamId)) {
      this.stopStream(streamId);
    }

    // Create abort controller for this stream
    const abortController = new AbortController();
    this.activeStreams.set(streamId, abortController);

    try {
      // Prepare the full prompt
      const fullPrompt = systemPrompt 
        ? `${systemPrompt}\n\nUser: ${prompt}`
        : prompt;

      console.log(`🌐 [Gemini API] Sending prompt to ${DEFAULT_MODEL}...`);

      // Start streaming generation
      const result = await this.model.generateContentStream(fullPrompt);
      
      let fullContent = '';
      let chunkCount = 0;

      // Process streaming chunks
      for await (const chunk of result.stream) {
        // Check if stream was aborted
        if (abortController.signal.aborted) {
          console.log(`🛑 [Gemini API] Stream ${streamId} was aborted`);
          break;
        }

        const chunkText = chunk.text();
        if (chunkText) {
          fullContent += chunkText;
          chunkCount++;

          // Call chunk callback with accumulated content
          if (onChunk) {
            const metadata = {
              model: DEFAULT_MODEL,
              provider: 'online_gemini',
              chunk: chunkText,
              chunkCount,
              totalLength: fullContent.length,
              responseTime: Date.now() - startTime
            };

            try {
              onChunk(fullContent, metadata);
            } catch (error) {
              console.error('❌ [Gemini API] Error in onChunk callback:', error);
            }
          }
        }
      }

      // Stream completed successfully
      const responseTime = Date.now() - startTime;
      console.log(`✅ [Gemini API] Stream ${streamId} completed in ${responseTime}ms`);

      const finalMetadata = {
        model: DEFAULT_MODEL,
        provider: 'online_gemini',
        tokens: this.estimateTokenCount(fullContent),
        responseTime,
        chunkCount
      };

      if (onComplete) {
        try {
          onComplete(fullContent, finalMetadata);
        } catch (error) {
          console.error('❌ [Gemini API] Error in onComplete callback:', error);
        }
      }

      // Clean up
      this.activeStreams.delete(streamId);
      
      return fullContent;

    } catch (error) {
      console.error(`❌ [Gemini API] Stream ${streamId} failed:`, error);
      
      // Clean up
      this.activeStreams.delete(streamId);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (onError) {
        try {
          onError(errorMessage);
        } catch (callbackError) {
          console.error('❌ [Gemini API] Error in onError callback:', callbackError);
        }
      }
      
      throw new Error(`Gemini API streaming failed: ${errorMessage}`);
    }
  }

  /**
   * Stop an active stream
   */
  public stopStream(streamId: string): void {
    const abortController = this.activeStreams.get(streamId);
    if (abortController) {
      console.log(`🛑 [Gemini API] Stopping stream ${streamId}`);
      abortController.abort();
      this.activeStreams.delete(streamId);
    }
  }

  /**
   * Stop all active streams
   */
  public stopAllStreams(): void {
    console.log(`🛑 [Gemini API] Stopping all ${this.activeStreams.size} active streams`);
    for (const [streamId, controller] of this.activeStreams) {
      controller.abort();
    }
    this.activeStreams.clear();
  }

  /**
   * Generate a single response (non-streaming)
   */
  public async generateResponse(
    prompt: string,
    systemPrompt?: string
  ): Promise<GeminiResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`🌐 [Gemini API] Generating single response...`);
      
      const fullPrompt = systemPrompt 
        ? `${systemPrompt}\n\nUser: ${prompt}`
        : prompt;

      const result = await this.model.generateContent(fullPrompt);
      const content = result.response.text();
      const responseTime = Date.now() - startTime;

      console.log(`✅ [Gemini API] Response generated in ${responseTime}ms`);

      return {
        success: true,
        content,
        metadata: {
          model: DEFAULT_MODEL,
          provider: 'online_gemini',
          tokens: this.estimateTokenCount(content),
          responseTime
        }
      };

    } catch (error) {
      console.error('❌ [Gemini API] Response generation failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          model: DEFAULT_MODEL,
          provider: 'online_gemini',
          responseTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Test API connectivity
   */
  public async testConnectivity(): Promise<{
    success: boolean;
    latency: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      console.log('🌐 [Gemini API] Testing connectivity...');
      
      // Simple test prompt
      const result = await this.model.generateContent('Hello');
      const latency = Date.now() - startTime;
      
      console.log(`✅ [Gemini API] Connectivity test passed (${latency}ms)`);
      
      return {
        success: true,
        latency
      };
      
    } catch (error) {
      const latency = Date.now() - startTime;
      console.error('❌ [Gemini API] Connectivity test failed:', error);
      
      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get active stream count
   */
  public getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Check if a specific stream is active
   */
  public isStreamActive(streamId: string): boolean {
    return this.activeStreams.has(streamId);
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Cleanup all resources
   */
  public destroy(): void {
    console.log('🧹 [Gemini API] Cleaning up resources...');
    this.stopAllStreams();
  }
}

// Export singleton instance
export const geminiApi = new GeminiApiService();

// Export class for custom instances
export default GeminiApiService;
