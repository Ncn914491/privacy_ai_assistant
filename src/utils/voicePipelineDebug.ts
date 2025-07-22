/**
 * Voice Pipeline Debug Utility
 * Helps debug and trace the STT to LLM pipeline flow
 */

export interface PipelineStep {
  step: string;
  timestamp: number;
  data?: any;
  success?: boolean;
  error?: string;
}

export class VoicePipelineDebugger {
  private steps: PipelineStep[] = [];
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `session_${Date.now()}`;
    this.log('pipeline_start', { sessionId: this.sessionId });
  }

  log(step: string, data?: any, success?: boolean, error?: string) {
    const pipelineStep: PipelineStep = {
      step,
      timestamp: Date.now(),
      data,
      success,
      error
    };

    this.steps.push(pipelineStep);
    
    // Console logging with emojis for better visibility
    const emoji = success === false ? '❌' : success === true ? '✅' : '🔄';
    const message = `${emoji} [${this.sessionId}] ${step}`;
    
    if (error) {
      console.error(message, { data, error });
    } else if (success === false) {
      console.warn(message, { data });
    } else {
      console.log(message, { data });
    }
  }

  getSteps(): PipelineStep[] {
    return [...this.steps];
  }

  getSummary(): string {
    const totalSteps = this.steps.length;
    const successSteps = this.steps.filter(s => s.success === true).length;
    const errorSteps = this.steps.filter(s => s.success === false).length;
    const duration = totalSteps > 0 ? this.steps[this.steps.length - 1].timestamp - this.steps[0].timestamp : 0;

    return `Pipeline ${this.sessionId}: ${totalSteps} steps, ${successSteps} success, ${errorSteps} errors, ${duration}ms duration`;
  }

  exportDebugData(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      summary: this.getSummary(),
      steps: this.steps
    }, null, 2);
  }

  clear() {
    this.steps = [];
  }
}

// Global debugger instance
let globalDebugger: VoicePipelineDebugger | null = null;

export const startVoicePipelineDebug = (sessionId?: string): VoicePipelineDebugger => {
  globalDebugger = new VoicePipelineDebugger(sessionId);
  return globalDebugger;
};

export const getVoicePipelineDebugger = (): VoicePipelineDebugger | null => {
  return globalDebugger;
};

export const logPipelineStep = (step: string, data?: any, success?: boolean, error?: string) => {
  if (globalDebugger) {
    globalDebugger.log(step, data, success, error);
  }
};

export const finishVoicePipelineDebug = (): string | null => {
  if (globalDebugger) {
    const summary = globalDebugger.getSummary();
    const debugData = globalDebugger.exportDebugData();
    globalDebugger = null;
    
    console.log('🏁 Voice pipeline debug finished:', summary);
    return debugData;
  }
  return null;
};

// Helper functions for common pipeline steps
export const debugVoiceSteps = {
  micPermissionRequest: (success: boolean, error?: string) => 
    logPipelineStep('mic_permission_request', undefined, success, error),
  
  micPermissionGranted: () => 
    logPipelineStep('mic_permission_granted', undefined, true),
  
  websocketConnect: (success: boolean, error?: string) => 
    logPipelineStep('websocket_connect', undefined, success, error),
  
  audioStreamStart: () => 
    logPipelineStep('audio_stream_start', undefined, true),
  
  audioDataSent: (dataSize: number) => 
    logPipelineStep('audio_data_sent', { dataSize }),
  
  sttPartialResult: (text: string) => 
    logPipelineStep('stt_partial_result', { text }),
  
  sttFinalResult: (text: string) => 
    logPipelineStep('stt_final_result', { text }, true),
  
  sttError: (error: string) => 
    logPipelineStep('stt_error', { error }, false, error),
  
  llmRequestStart: (prompt: string) => 
    logPipelineStep('llm_request_start', { promptLength: prompt.length }),
  
  llmResponse: (response: string, success: boolean, error?: string) => 
    logPipelineStep('llm_response', { responseLength: response.length }, success, error),
  
  uiUpdate: (messageId: string, content: string) => 
    logPipelineStep('ui_update', { messageId, contentLength: content.length }, true),
  
  pipelineComplete: () => 
    logPipelineStep('pipeline_complete', undefined, true)
};

