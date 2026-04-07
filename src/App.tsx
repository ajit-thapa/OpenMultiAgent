import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Info,
  Download,
  Layers,
  UserCircle,
  Search,
  Code
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactFlow, { 
  Background, 
  Controls, 
  ConnectionLineType,
  Node,
  Edge,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

import { AgentConfig, WorkflowState, TaskResult, ModelName } from './types';
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

const TEMPLATES = {
  'research-writer': [
    { id: '1', name: 'Researcher', model: 'gemini-3-flash-preview' as ModelName, systemInstruction: 'Research the impact of AI on healthcare in 2026.', tools: ['googleSearch'], dependsOn: [] },
    { id: '2', name: 'Writer', model: 'gemini-3-flash-preview' as ModelName, systemInstruction: 'Write a blog post based on the research.', tools: [], dependsOn: ['1'] },
    { id: '3', name: 'Reviewer', model: 'gemini-3.1-pro-preview' as ModelName, systemInstruction: 'Review the post for accuracy.', tools: [], dependsOn: ['2'] }
  ],
  'code-gen': [
    { id: '1', name: 'Architect', model: 'gemini-3.1-pro-preview' as ModelName, systemInstruction: 'Design a system for a real-time chat app.', tools: [], dependsOn: [] },
    { id: '2', name: 'Developer', model: 'gemini-3-flash-preview' as ModelName, systemInstruction: 'Implement the backend logic based on the design.', tools: [], dependsOn: ['1'] },
    { id: '3', name: 'Tester', model: 'gemini-3-flash-preview' as ModelName, systemInstruction: 'Write unit tests for the implementation.', tools: [], dependsOn: ['2'] }
  ],
  'market-analysis': [
    { id: '1', name: 'Trend Scout', model: 'gemini-3-flash-preview' as ModelName, systemInstruction: 'Search for top 5 consumer electronics trends in Q1 2026.', tools: ['googleSearch'], dependsOn: [] },
    { id: '2', name: 'Location Strategist', model: 'gemini-3-flash-preview' as ModelName, systemInstruction: 'Find prime retail locations in Tokyo for electronics.', tools: ['googleMaps'], dependsOn: ['1'] },
    { id: '3', name: 'Business Planner', model: 'gemini-3.1-pro-preview' as ModelName, systemInstruction: 'Create a market entry strategy based on trends and locations.', tools: [], dependsOn: ['2'] }
  ],
  'fullstack-dev': [
    { id: '1', name: 'Product Manager', model: 'gemini-3.1-pro-preview' as ModelName, systemInstruction: 'Define the core features and user stories for the application based on the initial input.', tools: [], dependsOn: [] },
    { id: '2', name: 'Fullstack Engineer', model: 'gemini-3-flash-preview' as ModelName, systemInstruction: 'Implement the fullstack logic. Use code execution to verify algorithms or data structures if needed.', tools: ['codeExecution'], dependsOn: ['1'] },
    { id: '3', name: 'QA Engineer', model: 'gemini-3-flash-preview' as ModelName, systemInstruction: 'Review the implementation and write test cases.', tools: [], dependsOn: ['2'] }
  ]
};

export default function App() {
  const [state, setState] = useState<WorkflowState>(() => {
    const saved = localStorage.getItem('oma-workflow');
    return saved ? JSON.parse(saved) : {
      agents: DEFAULT_AGENTS,
      results: {},
      sharedMemory: {},
      isRunning: false,
      logs: [],
      waitingAgentId: null,
      initialInput: "Build a simple task management app with React and Node.js."
    };
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCodeExport, setShowCodeExport] = useState(false);
  const [humanInput, setHumanInput] = useState("");
  
  const engineRef = useRef<OMAEngine | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('oma-workflow', JSON.stringify({ ...state, isRunning: false }));
  }, [state.agents]);

  useEffect(() => {
    if (!engineRef.current && process.env.GEMINI_API_KEY) {
      engineRef.current = new OMAEngine(
        process.env.GEMINI_API_KEY,
        state.agents,
        (newState) => setState({ ...newState })
      );
    }
  }, [state.agents]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback((params: any) => {
    const { source, target } = params;
    if (source === target) return;
    
    setState(prev => {
      const newAgents = prev.agents.map(agent => {
        if (agent.id === target) {
          if (!agent.dependsOn.includes(source)) {
            return { ...agent, dependsOn: [...agent.dependsOn, source] };
          }
        }
        return agent;
      });
      return { ...prev, agents: newAgents };
    });
  }, []);

  const onEdgeDelete = useCallback((edgesToDelete: Edge[]) => {
    setState(prev => {
      let newAgents = [...prev.agents];
      edgesToDelete.forEach(edge => {
        newAgents = newAgents.map(agent => {
          if (agent.id === edge.target) {
            return { ...agent, dependsOn: agent.dependsOn.filter(id => id !== edge.source) };
          }
          return agent;
        });
      });
      return { ...prev, agents: newAgents };
    });
  }, []);

  useEffect(() => {
    const layers = getLayers(state.agents);
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    layers.forEach((layer, layerIdx) => {
      layer.forEach((agent, agentIdx) => {
        newNodes.push({
          id: agent.id,
          type: 'default',
          data: { label: agent.name },
          position: { x: agentIdx * 250, y: layerIdx * 150 },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          style: {
            background: '#151619',
            color: '#E4E3E0',
            border: selectedAgentId === agent.id ? '2px solid #F27D26' : '1px solid #1A1A1A',
            borderRadius: '8px',
            width: 200,
            fontSize: '12px',
            fontWeight: 'bold',
            textAlign: 'center'
          }
        });

        agent.dependsOn.forEach(depId => {
          newEdges.push({
            id: `e-${depId}-${agent.id}`,
            source: depId,
            target: agent.id,
            type: ConnectionLineType.SmoothStep,
            animated: state.results[agent.id]?.status === 'running',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#F27D26' },
            style: { stroke: state.results[agent.id]?.status === 'completed' ? '#22c55e' : '#F27D26', strokeWidth: 2 }
          });
        });
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [state.agents, state.results, selectedAgentId]);

  const handleRun = () => {
    if (engineRef.current) {
      engineRef.current.run(state.initialInput);
    }
  };

  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.reset();
    }
  };

  const handleResume = () => {
    if (engineRef.current && state.waitingAgentId) {
      engineRef.current.resume(state.waitingAgentId, humanInput);
      setHumanInput("");
    }
  };

  const handleLoadTemplate = (key: keyof typeof TEMPLATES) => {
    const template = TEMPLATES[key];
    setState(prev => ({
      ...prev,
      agents: template,
      results: {},
      sharedMemory: {},
      logs: []
    }));
    setShowTemplates(false);
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
            onClick={() => setShowCodeExport(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border border-[#1A1A1A] hover:bg-[#1A1A1A] transition-colors"
          >
            <Code className="w-3.5 h-3.5" />
            EXPORT
          </button>
          <button 
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border border-[#1A1A1A] hover:bg-[#1A1A1A] transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            TEMPLATES
          </button>
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
            disabled={state.isRunning && !state.waitingAgentId}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 text-xs font-bold tracking-widest uppercase transition-all",
              state.isRunning && !state.waitingAgentId
                ? "bg-[#1A1A1A] text-[#F27D26] cursor-wait" 
                : "bg-[#F27D26] text-black hover:scale-105 active:scale-95"
            )}
          >
            {state.isRunning && !state.waitingAgentId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {state.isRunning && !state.waitingAgentId ? "Orchestrating..." : "Execute Workflow"}
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

          {/* Workflow Input Section */}
          <div className="p-4 border-b border-[#1A1A1A] bg-[#0A0A0A]">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-3.5 h-3.5 text-[#F27D26]" />
              <h2 className="text-[10px] font-mono uppercase tracking-widest">Workflow Input</h2>
            </div>
            <textarea 
              value={state.initialInput}
              onChange={(e) => setState(prev => ({ ...prev, initialInput: e.target.value }))}
              placeholder="Enter initial goal or context..."
              className="w-full bg-[#151515] border border-[#1A1A1A] p-2 text-[10px] font-mono focus:border-[#F27D26] outline-none transition-colors resize-none h-20 custom-scrollbar"
            />
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

          {/* DAG Visualization Area with ReactFlow */}
          <div className="flex-1 relative min-h-[400px]">
             <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgesDelete={onEdgeDelete}
              onNodeClick={(_, node) => {
                setSelectedAgentId(node.id);
                setIsEditing(false);
              }}
              fitView
              className="bg-transparent"
             >
              <Background color="#1A1A1A" gap={24} />
              <Controls className="bg-[#151619] border-[#1A1A1A] fill-[#F27D26]" />
             </ReactFlow>

             {/* Human Input Overlay */}
             <AnimatePresence>
               {state.waitingAgentId && (
                 <motion.div 
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                   className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
                 >
                   <div className="bg-[#151619] border border-[#F27D26] p-6 rounded-lg max-w-md w-full shadow-2xl">
                     <div className="flex items-center gap-3 mb-4">
                       <UserCircle className="w-6 h-6 text-[#F27D26]" />
                       <h3 className="text-sm font-bold uppercase tracking-widest">Human Input Required</h3>
                     </div>
                     <p className="text-xs font-mono opacity-70 mb-4 leading-relaxed">
                       Agent <span className="text-[#F27D26] font-bold">'{state.results[state.waitingAgentId]?.agentName}'</span> is asking:
                       <br />
                       <span className="text-[#E4E3E0] italic">"{state.results[state.waitingAgentId]?.waitingFor}"</span>
                     </p>
                     <textarea 
                       value={humanInput}
                       onChange={(e) => setHumanInput(e.target.value)}
                       placeholder="Type your response here..."
                       className="w-full bg-[#0A0A0A] border border-[#1A1A1A] p-3 text-xs focus:border-[#F27D26] outline-none transition-colors resize-none font-mono mb-4 h-24"
                     />
                     <div className="flex justify-end gap-3">
                       <button 
                         onClick={handleResume}
                         disabled={!humanInput.trim()}
                         className="px-4 py-2 bg-[#F27D26] text-black text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-30"
                       >
                         Submit Response
                       </button>
                     </div>
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>

          {/* Bottom Panel: Logs & Output */}
          <div className="h-64 border-t border-[#1A1A1A] bg-[#0F0F0F] flex overflow-hidden">
            {/* Logs */}
            <div className="w-1/3 border-r border-[#1A1A1A] flex flex-col">
              <div className="p-2 border-b border-[#1A1A1A] flex items-center justify-between bg-[#0A0A0A]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3 h-3 text-[#F27D26]" />
                  <span className="text-[9px] font-mono uppercase tracking-widest">System Logs</span>
                </div>
                <button 
                  onClick={() => setState(prev => ({ ...prev, logs: [] }))}
                  className="text-[8px] font-mono uppercase opacity-40 hover:opacity-100 transition-opacity"
                >
                  Clear
                </button>
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
                        <div className="space-y-6">
                          <div className="prose prose-invert prose-sm max-w-none">
                            <Markdown>{selectedResult.output}</Markdown>
                          </div>
                          
                          {selectedResult.groundingMetadata?.groundingChunks && (
                            <div className="pt-6 border-t border-[#1A1A1A]">
                              <h4 className="text-[10px] font-mono uppercase tracking-widest text-[#F27D26] mb-3">Sources & Grounding</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {selectedResult.groundingMetadata.groundingChunks.map((chunk: any, i: number) => {
                                  const web = chunk.web;
                                  if (!web) return null;
                                  return (
                                    <a 
                                      key={i} 
                                      href={web.uri} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-2 bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#F27D26]/50 transition-colors group"
                                    >
                                      <Search className="w-3 h-3 text-[#F27D26]" />
                                      <span className="text-[10px] font-mono truncate opacity-60 group-hover:opacity-100">{web.title || web.uri}</span>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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

      {/* Modals */}
      <AnimatePresence>
        {showTemplates && (
          <Modal title="Workflow Templates" onClose={() => setShowTemplates(false)}>
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(TEMPLATES).map(([key, agents]) => (
                <button 
                  key={key}
                  onClick={() => handleLoadTemplate(key as any)}
                  className="p-4 bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#F27D26] text-left transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-[#F27D26]">{key.replace('-', ' ')}</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <p className="text-[10px] font-mono opacity-50">
                    {agents.length} Agents: {agents.map(a => a.name).join(' → ')}
                  </p>
                </button>
              ))}
            </div>
          </Modal>
        )}

        {showCodeExport && (
          <Modal title="Generate Integration Code" onClose={() => setShowCodeExport(false)}>
            <div className="space-y-4">
              <p className="text-[10px] font-mono opacity-50 uppercase">TypeScript / OpenMultiAgent SDK</p>
              <div className="bg-[#050505] p-4 rounded border border-[#1A1A1A] overflow-x-auto">
                <pre className="text-[10px] font-mono text-[#F27D26]">
{`import { OMAEngine } from 'open-multi-agent';

const agents = ${JSON.stringify(state.agents, null, 2)};

const engine = new OMAEngine(process.env.GEMINI_API_KEY, agents, (state) => {
  console.log('Workflow Update:', state.logs[state.logs.length - 1]);
});

engine.run();`}
                </pre>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(state.agents, null, 2));
                  alert('Config copied to clipboard!');
                }}
                className="w-full py-2 bg-[#1A1A1A] text-[10px] font-mono uppercase hover:bg-[#222] transition-colors"
              >
                Copy Config JSON
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-[#0F0F0F] border border-[#1A1A1A] w-full max-w-xl rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-[#1A1A1A] flex items-center justify-between bg-[#0A0A0A]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#F27D26]">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[#1A1A1A] rounded transition-colors">
            <Plus className="w-4 h-4 rotate-45" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: TaskResult['status'] }) {
  const configs = {
    pending: { icon: ChevronRight, color: 'text-gray-500', label: 'IDLE' },
    running: { icon: Loader2, color: 'text-[#F27D26] animate-spin', label: 'ACTIVE' },
    completed: { icon: CheckCircle2, color: 'text-green-500', label: 'DONE' },
    failed: { icon: AlertCircle, color: 'text-red-500', label: 'ERROR' },
    waiting: { icon: UserCircle, color: 'text-blue-400 animate-pulse', label: 'WAITING' }
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

  const toggleTool = (tool: string) => {
    const tools = localAgent.tools.includes(tool)
      ? localAgent.tools.filter(t => t !== tool)
      : [...localAgent.tools, tool];
    handleChange('tools', tools);
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

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest opacity-50">Capabilities (Tools)</label>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => toggleTool('googleSearch')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono border transition-all",
                localAgent.tools.includes('googleSearch') ? "bg-[#F27D26]/10 border-[#F27D26] text-[#F27D26]" : "border-[#1A1A1A] opacity-40"
              )}
            >
              <Search className="w-3 h-3" />
              SEARCH
            </button>
            <button 
              onClick={() => toggleTool('codeExecution')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono border transition-all",
                localAgent.tools.includes('codeExecution') ? "bg-[#F27D26]/10 border-[#F27D26] text-[#F27D26]" : "border-[#1A1A1A] opacity-40"
              )}
            >
              <Code className="w-3 h-3" />
              CODE
            </button>
            <button 
              onClick={() => toggleTool('googleMaps')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono border transition-all",
                localAgent.tools.includes('googleMaps') ? "bg-[#F27D26]/10 border-[#F27D26] text-[#F27D26]" : "border-[#1A1A1A] opacity-40"
              )}
            >
              <Activity className="w-3 h-3" />
              MAPS
            </button>
            <button 
              onClick={() => toggleTool('urlContext')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono border transition-all",
                localAgent.tools.includes('urlContext') ? "bg-[#F27D26]/10 border-[#F27D26] text-[#F27D26]" : "border-[#1A1A1A] opacity-40"
              )}
            >
              <Info className="w-3 h-3" />
              URLS
            </button>
            <button 
              onClick={() => toggleTool('humanInput')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono border transition-all",
                localAgent.tools.includes('humanInput') ? "bg-[#F27D26]/10 border-[#F27D26] text-[#F27D26]" : "border-[#1A1A1A] opacity-40"
              )}
            >
              <UserCircle className="w-3 h-3" />
              HUMAN
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest opacity-50">Dependencies</label>
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
          </div>
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
