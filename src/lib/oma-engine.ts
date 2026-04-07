import { GoogleGenAI } from "@google/genai";
import { AgentConfig, SharedMemory, TaskResult, WorkflowState } from "../types";

export class OMAEngine {
  private ai: GoogleGenAI;
  private state: WorkflowState;
  private onStateChange: (state: WorkflowState) => void;
  private userInputBuffer: Record<string, string> = {};

  constructor(
    apiKey: string,
    initialAgents: AgentConfig[],
    onStateChange: (state: WorkflowState) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.onStateChange = onStateChange;
    this.state = {
      agents: initialAgents,
      results: {},
      sharedMemory: {},
      isRunning: false,
      logs: [],
      initialInput: ''
    };
    
    // Initialize results
    initialAgents.forEach(agent => {
      this.state.results[agent.id] = {
        agentId: agent.id,
        agentName: agent.name,
        output: '',
        status: 'pending'
      };
    });
  }

  private log(message: string) {
    this.state.logs = [...this.state.logs, `[${new Date().toLocaleTimeString()}] ${message}`];
    this.onStateChange({ ...this.state });
  }

  private updateAgentStatus(id: string, status: TaskResult['status'], output?: string, waitingFor?: string, groundingMetadata?: any) {
    const result = this.state.results[id];
    if (result) {
      result.status = status;
      if (output !== undefined) result.output = output;
      if (waitingFor !== undefined) result.waitingFor = waitingFor;
      if (groundingMetadata !== undefined) result.groundingMetadata = groundingMetadata;
      if (status === 'running') result.startTime = Date.now();
      if (status === 'completed' || status === 'failed') result.endTime = Date.now();
      
      if (status === 'waiting') {
        this.state.waitingAgentId = id;
      } else if (this.state.waitingAgentId === id) {
        this.state.waitingAgentId = null;
      }

      this.onStateChange({ ...this.state });
    }
  }

  async resume(agentId: string, userInput: string) {
    this.userInputBuffer[agentId] = userInput;
    this.updateAgentStatus(agentId, 'running', undefined, '');
    // This will break the while loop in the run() method
  }

  async run(initialInput?: string) {
    if (this.state.isRunning && !this.state.waitingAgentId) return;
    if (initialInput !== undefined) this.state.initialInput = initialInput;
    this.state.isRunning = true;
    this.log("Starting workflow orchestration...");

    const completed = new Set<string>();
    const running = new Set<string>();

    while (completed.size < this.state.agents.length) {
      const readyAgents = this.state.agents.filter(agent => {
        if (completed.has(agent.id) || running.has(agent.id)) return false;
        return agent.dependsOn.every(depId => completed.has(depId));
      });

      if (readyAgents.length === 0 && running.size === 0) {
        const waiting = this.state.agents.find(a => this.state.results[a.id].status === 'waiting');
        if (waiting) {
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        this.log("Deadlock detected or all agents finished.");
        break;
      }

      const promises = readyAgents.map(async (agent) => {
        running.add(agent.id);
        this.updateAgentStatus(agent.id, 'running');
        this.log(`Agent '${agent.name}' starting...`);

        try {
          let currentOutput = "";
          let isDone = false;

          while (!isDone) {
            const context = agent.dependsOn.map(depId => {
              const depResult = this.state.results[depId];
              return `Output from ${depResult.agentName}:\n${depResult.output}`;
            }).join('\n\n');

            let prompt = `
Context from previous agents:
${context || 'No previous context.'}

${agent.dependsOn.length === 0 ? `Initial Workflow Input: ${this.state.initialInput || 'None provided.'}` : ''}

Current Shared Memory:
${JSON.stringify(this.state.sharedMemory, null, 2)}

Your Instruction:
${agent.systemInstruction}

Guidelines:
1. If you need to update shared memory, use: MEMORY_UPDATE: key=value
2. If you need human input, use: HUMAN_INPUT: description of what you need
3. Provide your final response clearly.
            `.trim();

            if (this.userInputBuffer[agent.id]) {
              prompt += `\n\nPrevious partial output: ${currentOutput}\n\nUser provided input: ${this.userInputBuffer[agent.id]}`;
              delete this.userInputBuffer[agent.id];
            }

            const config: any = {};
            if (agent.tools.includes('googleSearch')) {
              config.tools = (config.tools || []).concat([{ googleSearch: {} }]);
            }
            if (agent.tools.includes('googleMaps')) {
              config.tools = (config.tools || []).concat([{ googleMaps: {} }]);
            }
            if (agent.tools.includes('urlContext')) {
              config.tools = (config.tools || []).concat([{ urlContext: {} }]);
            }
            if (agent.tools.includes('codeExecution')) {
              config.tools = (config.tools || []).concat([{ codeExecution: {} }]);
            }

            this.log(`Agent '${agent.name}' is generating response...`);
            const responseStream = await this.ai.models.generateContentStream({
              model: agent.model,
              contents: prompt,
              config: config
            });

            let fullText = "";
            for await (const chunk of responseStream) {
              fullText += chunk.text || "";
              this.updateAgentStatus(agent.id, 'running', fullText);
            }

            const text = fullText || "No output generated.";
            currentOutput = text;
            
            // Extract grounding metadata if available
            let groundingMetadata = null;
            // Note: generateContentStream chunks might not have full metadata until the end
            // But we can try to get it from the last chunk or a separate call if needed.
            // For now, we'll try to get it from the response object if it was a single call.
            // Since we used a stream, we need to check the final state of the stream.
            
            // In @google/genai, groundingMetadata is usually in the candidate.
            // We'll just update it at the end.
            
            const humanInputMatch = text.match(/HUMAN_INPUT:\s*(.*)/);
            if (humanInputMatch && agent.tools.includes('humanInput')) {
              const description = humanInputMatch[1];
              this.updateAgentStatus(agent.id, 'waiting', text, description);
              this.log(`Agent '${agent.name}' is waiting for human input: ${description}`);
              
              while (this.state.waitingAgentId === agent.id) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              // Loop will continue and re-run with user input
            } else {
              isDone = true;
            }
          }

          // Parse memory updates
          const lines = currentOutput.split('\n');
          lines.forEach(line => {
            if (line.startsWith('MEMORY_UPDATE:')) {
              const match = line.match(/MEMORY_UPDATE:\s*(\w+)\s*=\s*(.*)/);
              if (match) {
                const [, key, value] = match;
                this.state.sharedMemory[key] = value;
                this.log(`Shared Memory Update: ${key} = ${value}`);
              }
            }
          });

          this.updateAgentStatus(agent.id, 'completed', currentOutput);
          this.log(`Agent '${agent.name}' completed.`);
          completed.add(agent.id);
        } catch (error) {
          console.error(`Error in agent ${agent.name}:`, error);
          this.updateAgentStatus(agent.id, 'failed', String(error));
          this.log(`Agent '${agent.name}' failed: ${error}`);
          completed.add(agent.id);
        } finally {
          running.delete(agent.id);
        }
      });

      await Promise.all(promises);
    }

    this.state.isRunning = false;
    this.log("Workflow orchestration finished.");
    this.onStateChange({ ...this.state });
  }

  reset() {
    this.state.isRunning = false;
    this.state.sharedMemory = {};
    this.state.logs = [];
    this.state.agents.forEach(agent => {
      this.state.results[agent.id] = {
        agentId: agent.id,
        agentName: agent.name,
        output: '',
        status: 'pending'
      };
    });
    this.onStateChange({ ...this.state });
  }
}
