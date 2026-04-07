import { GoogleGenAI } from "@google/genai";

export type ModelName = 
  | 'gemini-3-flash-preview' 
  | 'gemini-3.1-pro-preview' 
  | 'gemini-3.1-flash-lite-preview';

export interface AgentConfig {
  id: string;
  name: string;
  model: ModelName;
  systemInstruction: string;
  tools: string[];
  dependsOn: string[]; // IDs of agents this agent depends on
}

export interface TaskResult {
  agentId: string;
  agentName: string;
  output: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting';
  startTime?: number;
  endTime?: number;
  waitingFor?: string;
  groundingMetadata?: any;
}

export interface SharedMemory {
  [key: string]: any;
}

export interface WorkflowState {
  agents: AgentConfig[];
  results: Record<string, TaskResult>;
  sharedMemory: SharedMemory;
  isRunning: boolean;
  logs: string[];
  waitingAgentId?: string | null;
  initialInput: string;
}
