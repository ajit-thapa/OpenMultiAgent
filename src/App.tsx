import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Settings, 
  Cpu, 
  Database, 
  Terminal, 
  ChevronRight, 
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { AgentConfig, WorkflowState, TaskResult } from './types';
import { OMAEngine } from './lib/oma-engine';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: '1',
    name: 'Researcher',
    model: 'gemini-3-flash-preview',
    systemInstruction: 'Search for the latest trends in renewable energy for 2026. Provide a concise summary of 3 key technologies.',
    tools: ['googleSearch'],
    dependsOn: []
  },
  {
    id: '2',
    name: 'Writer',
    model: 'gemini-3-flash-preview',
    systemInstruction: 'Based on the research provided, write a compelling 200-word blog post introduction. Focus on the impact of these technologies on the global economy.',
    tools: [],
    dependsOn: ['1']
  },
  {
    id: '3',
    name: 'Reviewer',
    model: 'gemini-3.1-pro-preview',
    systemInstruction: 'Review the blog post introduction for technical accuracy and tone. Suggest 2 improvements.',
    tools: [],
    dependsOn: ['2']
  }
];

export default function App() {
  const [state, setState] = useState<WorkflowState>({
    agents: DEFAULT_AGENTS,
    results: {},
    sharedMemory: {},
    isRunning: false,
    logs: []
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const engineRef = useRef<OMAEngine | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engineRef.current && process.env.GEMINI_API_KEY) {
      engineRef.current = new OMAEngine(
        process.env.GEMINI_API_KEY,
        state.agents,
        (newState) => setState({ ...newState })
      );
    }
  }, [state.agents]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logs]);

  const handleRun = () => {
    if (engineRef.current) {
      engineRef.current.run();
    }
  };

  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.reset();
    }
  };

  const handleAddAgent = () => {
    const newAgent: AgentConfig = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Agent',
      model: 'gemini-3-flash-preview',
      systemInstruction: 'You are a helpful assistant.',
      tools: [],
      dependsOn: []
    };
    const newAgents = [...state.agents, newAgent];
    setState(prev => ({ ...prev, agents: newAgents }));
    setSelectedAgentId(newAgent.id);
    setIsEditing(true);
  };

  const handleUpdateAgent = (updatedAgent: AgentConfig) => {
    const newAgents = state.agents.map(a => a.id === updatedAgent.id ? updatedAgent : a);
    setState(prev => ({ ...prev, agents: newAgents }));
    setIsEditing(false);
  };

  const handleDeleteAgent = (id: string) => {
    const newAgents = state.agents.filter(a => a.id !== id);
    setState(prev => ({ ...prev, agents: newAgents }));
    if (selectedAgentId === id) setSelectedAgentId(null);
  };

  const selectedAgent = state.agents.find(a => a.id === selectedAgentId);
  const selectedResult = selectedAgentId ? state.results[selectedAgentId] : null;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-black flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-[#1A1A1A] flex items-center justify-between px-6 bg-[#0F0F0F] z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#F27D26] rounded-sm flex items-center justify-center">
            <Cpu className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase text-[#F27D26]">OpenMultiAgent</h1>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-tighter">Orchestration Engine v1.0.4</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleReset}
            disabled={state.isRunning}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border border-[#1A1A1A] hover:bg-[#1A1A1A] transition-colors disabled:opacity-30"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET
          </button>
          <button 
            onClick={handleRun}
            disabled={state.isRunning}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 text-xs font-bold tracking-widest uppercase transition-all",
              state.isRunning 
                ? "bg-[#1A1A1A] text-[#F27D26] cursor-wait" 
                : "bg-[#F27D26] text-black hover:scale-105 active:scale-95"
            )}
          >
            {state.isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {state.isRunning ? "Orchestrating..." : "Execute Workflow"}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: Agent List */}
        <aside className="w-72 border-r border-[#1A1A1A] bg-[#0F0F0F] flex flex-col z-10">
          <div className="p-4 border-b border-[#1A1A1A] flex items-center justify-between">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-[#F27D26]">Agent Pool</h2>
            <button 
              onClick={handleAddAgent}
              className="p-1 hover:bg-[#1A1A1A] rounded-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {state.agents.map((agent) => {
              const result = state.results[agent.id];
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setIsEditing(false);
                  }}
                  className={cn(
                    "w-full text-left p-3 rounded-sm border transition-all group relative overflow-hidden",
                    selectedAgentId === agent.id 
                      ? "bg-[#1A1A1A] border-[#F27D26]/50" 
                      : "bg-transparent border-transparent hover:bg-[#151515]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-tight">{agent.name}</span>
                    <StatusBadge status={result?.status || 'pending'} />
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono opacity-40">
                    <Cpu className="w-2.5 h-2.5" />
                    {agent.model.split('-')[1].toUpperCase()}
                  </div>
                  
                  {selectedAgentId === agent.id && (
                    <motion.div 
                      layoutId="sidebar-indicator"
                      className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#F27D26]"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Shared Memory View */}
          <div className="p-4 border-t border-[#1A1A1A] bg-[#0A0A0A]">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-3.5 h-3.5 text-[#F27D26]" />
              <h2 className="text-[10px] font-mono uppercase tracking-widest">Shared Memory</h2>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
              {Object.keys(state.sharedMemory).length === 0 ? (
                <p className="text-[10px] font-mono opacity-30 italic">No memory data yet...</p>
              ) : (
                Object.entries(state.sharedMemory).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-0.5 p-2 bg-[#151515] border border-[#1A1A1A] rounded-sm">
                    <span className="text-[9px] font-mono text-[#F27D26] uppercase">{key}</span>
                    <span className="text-[10px] font-mono opacity-70 truncate">{String(value)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Main Canvas: DAG & Details */}
        <div className="flex-1 flex flex-col relative bg-[#050505] overflow-hidden">
          {/* Grid Background */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
            style={{ 
              backgroundImage: 'radial-gradient(#F27D26 1px, transparent 1px)', 
              backgroundSize: '24px 24px' 
            }} 
          />

          {/* DAG Visualization Area */}
          <div className="flex-1 relative overflow-auto p-12 flex items-center justify-center min-h-[400px]">
             <div className="relative flex flex-col items-center gap-16">
                {/* Simple Layered Layout for DAG */}
                {getLayers(state.agents).map((layer, layerIdx) => (
                  <div key={layerIdx} className="flex gap-12 items-center justify-center">
                    {layer.map(agent => (
                      <AgentNode 
                        key={agent.id} 
                        agent={agent} 
                        result={state.results[agent.id]}
                        isSelected={selectedAgentId === agent.id}
                        onClick={() => {
                          setSelectedAgentId(agent.id);
                          setIsEditing(false);
                        }}
                      />
                    ))}
                  </div>
                ))}
             </div>
          </div>

          {/* Bottom Panel: Logs & Output */}
          <div className="h-64 border-t border-[#1A1A1A] bg-[#0F0F0F] flex overflow-hidden">
            {/* Logs */}
            <div className="w-1/3 border-r border-[#1A1A1A] flex flex-col">
              <div className="p-2 border-b border-[#1A1A1A] flex items-center gap-2 bg-[#0A0A0A]">
                <Terminal className="w-3 h-3 text-[#F27D26]" />
                <span className="text-[9px] font-mono uppercase tracking-widest">System Logs</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] space-y-1 custom-scrollbar">
                {state.logs.map((log, i) => (
                  <div key={i} className="opacity-60 hover:opacity-100 transition-opacity">
                    <span className="text-[#F27D26] mr-2">›</span>
                    {log}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Output Detail */}
            <div className="flex-1 flex flex-col bg-[#050505]">
              <div className="p-2 border-b border-[#1A1A1A] flex items-center justify-between bg-[#0A0A0A]">
                <div className="flex items-center gap-2">
                  <Activity className="w-3 h-3 text-[#F27D26]" />
                  <span className="text-[9px] font-mono uppercase tracking-widest">
                    {selectedAgent ? `Output: ${selectedAgent.name}` : 'Select an agent to view output'}
                  </span>
                </div>
                {selectedAgent && (
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-[9px] font-mono uppercase text-[#F27D26] hover:underline"
                  >
                    {isEditing ? 'View Output' : 'Edit Config'}
                  </button>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {selectedAgent ? (
                  isEditing ? (
                    <AgentEditor 
                      agent={selectedAgent} 
                      allAgents={state.agents}
                      onUpdate={handleUpdateAgent}
                      onDelete={() => handleDeleteAgent(selectedAgent.id)}
                    />
                  ) : (
                    <div className="max-w-3xl mx-auto">
                      {selectedResult?.output ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <Markdown>{selectedResult.output}</Markdown>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-20 py-12">
                          <Info className="w-8 h-8 mb-2" />
                          <p className="text-xs font-mono uppercase">No output generated yet</p>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-full opacity-10">
                    <Cpu className="w-12 h-12 mb-4" />
                    <p className="text-sm font-mono uppercase tracking-widest">Orchestration Ready</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// --- Sub-components ---

function StatusBadge({ status }: { status: TaskResult['status'] }) {
  const configs = {
    pending: { icon: ChevronRight, color: 'text-gray-500', label: 'IDLE' },
    running: { icon: Loader2, color: 'text-[#F27D26] animate-spin', label: 'ACTIVE' },
    completed: { icon: CheckCircle2, color: 'text-green-500', label: 'DONE' },
    failed: { icon: AlertCircle, color: 'text-red-500', label: 'ERROR' }
  };
  const config = configs[status];
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-1 text-[8px] font-mono font-bold", config.color)}>
      <Icon className="w-2.5 h-2.5" />
      <span>{config.label}</span>
    </div>
  );
}

function AgentNode({ agent, result, isSelected, onClick }: { 
  agent: AgentConfig, 
  result?: TaskResult, 
  isSelected: boolean,
  onClick: () => void 
}) {
  return (
    <motion.div
      id={`agent-${agent.id}`}
      layout
      onClick={onClick}
      className={cn(
        "w-48 p-4 bg-[#151619] border-2 rounded-lg cursor-pointer transition-all relative group",
        isSelected ? "border-[#F27D26] shadow-[0_0_20px_rgba(242,125,38,0.1)]" : "border-[#1A1A1A] hover:border-[#333]"
      )}
    >
      <div className="absolute -top-3 left-4 px-2 bg-[#151619] border border-[#1A1A1A] rounded text-[8px] font-mono text-[#F27D26] uppercase tracking-widest">
        {agent.model.split('-')[1]}
      </div>
      
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-tight truncate pr-2">{agent.name}</h3>
        <StatusBadge status={result?.status || 'pending'} />
      </div>
      
      <div className="space-y-1.5">
        <div className="h-1 w-full bg-[#0A0A0A] rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: result?.status === 'completed' ? '100%' : result?.status === 'running' ? '50%' : '0%' }}
            className={cn(
              "h-full transition-all duration-1000",
              result?.status === 'completed' ? "bg-green-500" : "bg-[#F27D26]"
            )}
          />
        </div>
        <div className="flex justify-between text-[8px] font-mono opacity-40 uppercase">
          <span>Process</span>
          <span>{result?.status === 'completed' ? '100%' : result?.status === 'running' ? '50%' : '0%'}</span>
        </div>
      </div>

      {/* Connection Ports */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1A1A1A] rounded-full border border-[#333]" />
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1A1A1A] rounded-full border border-[#333]" />
    </motion.div>
  );
}

function AgentEditor({ agent, allAgents, onUpdate, onDelete }: { 
  agent: AgentConfig, 
  allAgents: AgentConfig[],
  onUpdate: (a: AgentConfig) => void,
  onDelete: () => void
}) {
  const [localAgent, setLocalAgent] = useState(agent);

  useEffect(() => {
    setLocalAgent(agent);
  }, [agent]);

  const handleChange = (field: keyof AgentConfig, value: any) => {
    const updated = { ...localAgent, [field]: value };
    setLocalAgent(updated);
    onUpdate(updated);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest opacity-50">Agent Name</label>
          <input 
            type="text" 
            value={localAgent.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] p-2 text-xs focus:border-[#F27D26] outline-none transition-colors"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest opacity-50">Model Engine</label>
          <select 
            value={localAgent.model}
            onChange={(e) => handleChange('model', e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] p-2 text-xs focus:border-[#F27D26] outline-none transition-colors appearance-none"
          >
            <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
            <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-widest opacity-50">System Instruction</label>
        <textarea 
          value={localAgent.systemInstruction}
          onChange={(e) => handleChange('systemInstruction', e.target.value)}
          rows={4}
          className="w-full bg-[#0A0A0A] border border-[#1A1A1A] p-3 text-xs focus:border-[#F27D26] outline-none transition-colors resize-none font-mono leading-relaxed"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-widest opacity-50">Dependencies (Depends On)</label>
        <div className="flex flex-wrap gap-2">
          {allAgents.filter(a => a.id !== agent.id).map(a => (
            <button
              key={a.id}
              onClick={() => {
                const deps = localAgent.dependsOn.includes(a.id)
                  ? localAgent.dependsOn.filter(id => id !== a.id)
                  : [...localAgent.dependsOn, a.id];
                handleChange('dependsOn', deps);
              }}
              className={cn(
                "px-3 py-1 text-[10px] font-mono border transition-all",
                localAgent.dependsOn.includes(a.id) 
                  ? "bg-[#F27D26]/10 border-[#F27D26] text-[#F27D26]" 
                  : "border-[#1A1A1A] opacity-40 hover:opacity-100"
              )}
            >
              {a.name}
            </button>
          ))}
          {allAgents.length <= 1 && <p className="text-[10px] font-mono opacity-30 italic">No other agents available</p>}
        </div>
      </div>

      <div className="pt-4 flex justify-between">
        <button 
          onClick={onDelete}
          className="flex items-center gap-2 px-4 py-2 text-[10px] font-mono text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          TERMINATE AGENT
        </button>
        <div className="flex items-center gap-2 text-[10px] font-mono opacity-30">
          <Settings className="w-3.5 h-3.5" />
          CHANGES AUTO-SAVED
        </div>
      </div>
    </div>
  );
}

// --- Utils ---

function getLayers(agents: AgentConfig[]): AgentConfig[][] {
  const layers: AgentConfig[][] = [];
  const visited = new Set<string>();
  let remaining = [...agents];

  while (remaining.length > 0) {
    const currentLayer = remaining.filter(agent => 
      agent.dependsOn.every(depId => visited.has(depId))
    );
    
    if (currentLayer.length === 0) {
      // Handle circular dependencies or disconnected nodes by just dumping the rest
      layers.push(remaining);
      break;
    }

    layers.push(currentLayer);
    currentLayer.forEach(a => visited.add(a.id));
    remaining = remaining.filter(a => !visited.has(a.id));
  }

  return layers;
}
