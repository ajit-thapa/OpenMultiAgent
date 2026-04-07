import { GoogleGenAI } from "@google/genai";
import { AgentConfig, SharedMemory, TaskResult, WorkflowState } from "../types";

export class OMAEngine {
  private ai: GoogleGenAI;
  private state: WorkflowState;
  private onStateChange: (state: WorkflowState) => void;

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
      logs: []
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

  private updateAgentStatus(id: string, status: TaskResult['status'], output?: string) {
    const result = this.state.results[id];
    if (result) {
      result.status = status;
      if (output !== undefined) result.output = output;
      if (status === 'running') result.startTime = Date.now();
      if (status === 'completed' || status === 'failed') result.endTime = Date.now();
      this.onStateChange({ ...this.state });
    }
  }

  async run() {
    if (this.state.isRunning) return;
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
        this.log("Deadlock detected or all agents failed.");
        break;
      }

      // Start ready agents in parallel
      const promises = readyAgents.map(async (agent) => {
        running.add(agent.id);
        this.updateAgentStatus(agent.id, 'running');
        this.log(`Agent '${agent.name}' starting...`);

        try {
          // Prepare context from dependencies
          const context = agent.dependsOn.map(depId => {
            const depResult = this.state.results[depId];
            return `Output from ${depResult.agentName}:\n${depResult.output}`;
          }).join('\n\n');

          const prompt = `
Context from previous agents:
${context || 'No previous context.'}

Current Shared Memory:
${JSON.stringify(this.state.sharedMemory, null, 2)}

Your Instruction:
${agent.systemInstruction}

Please provide your response. If you want to store something in shared memory, start your line with "MEMORY_UPDATE: key=value".
          `.trim();

          const config: any = {};
          if (agent.tools.includes('googleSearch')) {
            config.tools = [{ googleSearch: {} }];
          }

          const response = await this.ai.models.generateContent({
            model: agent.model,
            contents: prompt,
            config: config
          });

          const text = response.text || "No output generated.";
          
          // Parse memory updates
          const lines = text.split('\n');
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

          this.updateAgentStatus(agent.id, 'completed', text);
          this.log(`Agent '${agent.name}' completed.`);
        } catch (error) {
          console.error(`Error in agent ${agent.name}:`, error);
          this.updateAgentStatus(agent.id, 'failed', String(error));
          this.log(`Agent '${agent.name}' failed: ${error}`);
        } finally {
          running.delete(agent.id);
          completed.add(agent.id);
        }
      });

      // Wait for at least one agent to finish or all of them
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
