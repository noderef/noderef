/**
 * Copyright 2025 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ConsoleOutput } from '@/components/js-console/ConsoleOutput';
import { ExecuteBar } from '@/components/js-console/ExecuteBar';
import { JsConsoleEditor } from '@/components/js-console/JsConsoleEditor';
import { SplitPanel } from '@/components/js-console/SplitPanel';
import {
  callAiExecute,
  callAiRouter,
  fetchAiStatus,
  type AiStatusResponse,
} from '@/core/ai/consoleClient';
import { dslManager } from '@/core/monaco/dsl-manager';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useServersStore } from '@/core/store/servers';
import { useActiveServerId } from '@/hooks/useNavigation';
import { notifications } from '@mantine/notifications';
import type * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useState } from 'react';

function JsConsolePage() {
  const activeServerId = useActiveServerId();
  const servers = useServersStore(state => state.servers);
  const getServerById = useServersStore(state => state.getServerById);
  const code = useJsConsoleStore(state => state.code);
  const setIsExecuting = useJsConsoleStore(state => state.setIsExecuting);
  const addOutput = useJsConsoleStore(state => state.addOutput);
  const clearOutputs = useJsConsoleStore(state => state.clearOutputs);
  const setHistory = useJsConsoleStore(state => state.setHistory);
  const splitPosition = useJsConsoleStore(state => state.splitPosition);
  const setSplitPosition = useJsConsoleStore(state => state.setSplitPosition);
  const documentNodeRef = useJsConsoleStore(state => state.documentNodeRef);
  const isExecuting = useJsConsoleStore(state => state.isExecuting);
  const selectedServerIds = useJsConsoleStore(state => state.selectedServerIds);
  const setSelectedServerIds = useJsConsoleStore(state => state.setSelectedServerIds);
  const setActiveOutputServerId = useJsConsoleStore(state => state.setActiveOutputServerId);
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [isAiExecuting, setIsAiExecuting] = useState(false);
  const applyAiChanges = useJsConsoleStore(state => state.applyAiChanges);
  const getSelectionText = useJsConsoleStore(state => state.getSelectionText);
  const editorInstance = useJsConsoleStore(state => state.editorInstance);
  const activeServer = useMemo(
    () => (activeServerId ? getServerById(activeServerId) : null),
    [activeServerId, getServerById]
  );
  const isNodeRefSpace = !activeServer || !activeServer.serverType;

  // Focus editor when page loads or editor instance becomes available
  useEffect(() => {
    if (editorInstance) {
      // Small delay to ensure editor is fully rendered
      const timeoutId = setTimeout(() => {
        editorInstance.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [editorInstance]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const status = await fetchAiStatus();
      if (mounted) {
        setAiStatus(status);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Keep server selection in sync with available servers and sidebar selection
  useEffect(() => {
    const availableIds = servers.map(s => s.id);

    // When a specific server is active (not NodeRef space), always use that server
    if (!isNodeRefSpace && activeServer) {
      if (selectedServerIds.length !== 1 || selectedServerIds[0] !== activeServer.id) {
        setSelectedServerIds([activeServer.id]);
        setActiveOutputServerId(activeServer.id);
      }
      return;
    }

    // In NodeRef space, validate persisted selections
    if (isNodeRefSpace) {
      if (availableIds.length === 0) {
        // No servers available, clear selection
        if (selectedServerIds.length !== 0) {
          setSelectedServerIds([]);
          setActiveOutputServerId(null);
        }
        return;
      }

      // Filter out invalid server IDs (e.g., servers that were deleted)
      const validSelectedIds = selectedServerIds.filter(id => availableIds.includes(id));

      if (validSelectedIds.length !== selectedServerIds.length) {
        // Some selected servers are no longer available, update to only valid ones
        const finalSelection = validSelectedIds.length > 0 ? validSelectedIds : [availableIds[0]];
        setSelectedServerIds(finalSelection);
        setActiveOutputServerId(finalSelection[0] ?? null);
        return;
      }

      // If no servers are selected, default to the first available server
      if (selectedServerIds.length === 0) {
        setSelectedServerIds([availableIds[0]]);
        setActiveOutputServerId(availableIds[0]);
      }
    }
  }, [
    activeServerId,
    activeServer,
    isNodeRefSpace,
    servers,
    selectedServerIds,
    setSelectedServerIds,
    setActiveOutputServerId,
  ]);

  const selectedServers = useMemo(() => {
    if (!isNodeRefSpace && activeServer) {
      return [activeServer];
    }
    return servers.filter(server => selectedServerIds.includes(server.id));
  }, [activeServer, isNodeRefSpace, servers, selectedServerIds]);

  // Load custom DSL when active server changes
  useEffect(() => {
    if (activeServer?.id && activeServer?.baseUrl) {
      void dslManager.loadCustomDsl(activeServer.id, activeServer.baseUrl);
    }
  }, [activeServer?.id, activeServer?.baseUrl]);

  // Unload all DSLs on page unmount
  useEffect(() => {
    return () => {
      dslManager.unloadAll();
    };
  }, []);

  const appendHistory = useJsConsoleStore(state => state.appendHistory);
  const setHistoryLoading = useJsConsoleStore(state => state.setHistoryLoading);
  const historyNextCursor = useJsConsoleStore(state => state.historyNextCursor);
  const historyServerId = useMemo(
    () => (selectedServers.length === 1 ? selectedServers[0].id : undefined),
    [selectedServers]
  );

  // Load history function - defined first so handleExecute can use it
  const loadHistory = useCallback(
    async (reset: boolean = false) => {
      try {
        setHistoryLoading(true);
        if (!selectedServers.length && historyServerId === undefined) {
          setHistory([]);
          useJsConsoleStore.setState({
            historyHasMore: false,
            historyNextCursor: null,
          });
          return;
        }
        const { rpc } = await import('@/core/ipc/rpc');
        const cursor = reset ? undefined : historyNextCursor;

        const response = await rpc<{ items: any[]; hasMore: boolean; nextCursor: number | null }>(
          'backend.jsconsole.getHistory',
          {
            serverId: historyServerId,
            limit: 25,
            cursor: cursor ?? undefined,
          }
        );

        // Convert DB history to store format
        const historyItems = response.items.map((item: any) => ({
          id: String(item.id),
          timestamp: new Date(item.executedAt),
          code: item.script,
          serverId: item.serverId,
          output: item.output,
          error: item.error,
        }));

        if (reset) {
          setHistory(historyItems);
          // Also set pagination state when resetting
          useJsConsoleStore.setState({
            historyHasMore: response.hasMore,
            historyNextCursor: response.nextCursor,
          });
        } else {
          appendHistory(historyItems, response.hasMore, response.nextCursor);
        }
      } catch (error) {
        console.error('Failed to load JS console history:', error);
      } finally {
        setHistoryLoading(false);
      }
    },
    [
      historyServerId,
      selectedServers.length,
      setHistory,
      appendHistory,
      setHistoryLoading,
      historyNextCursor,
    ]
  );

  const runAiCommand = useCallback(
    async (command: AiCommand) => {
      if (isAiExecuting) {
        return;
      }
      if (!aiStatus?.enabled) {
        addOutput({
          type: 'error',
          content: 'AI console is disabled in this environment.',
        });
        return;
      }
      if (!aiStatus?.providerConfigured) {
        addOutput({
          type: 'error',
          content: 'No AI provider is configured for your user.',
        });
        return;
      }

      setIsAiExecuting(true);
      addOutput({
        type: 'log',
        content: `AI is generating code for: "${command.question}"`,
      });
      console.debug('[AI] Executing command', { question: command.question });

      try {
        const selectionText = getSelectionText();
        const hasSelection = Boolean(selectionText && selectionText.trim().length > 0);
        const selectedLibs = await callAiRouter(command.question);
        const result = await callAiExecute({
          question: command.question,
          selected: selectedLibs,
          selection: hasSelection ? selectionText : undefined,
          context: buildContextSnippet(code),
        });

        const model = editorInstance?.getModel();
        const targetRange =
          result.type === 'replace_file'
            ? model?.getFullModelRange()
            : hasSelection || !editorInstance
              ? undefined
              : (computeCommandRange(editorInstance, command.lineNumber) ?? undefined);

        applyAiChanges(result.code, targetRange);
        addOutput({
          type: 'log',
          content: `// AI inserted response (${selectedLibs.length} libraries used)`,
        });
      } catch (error) {
        console.error('[AI] Request failed', error);
        addOutput({
          type: 'error',
          content: `AI request failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        setIsAiExecuting(false);
      }
    },
    [isAiExecuting, aiStatus, addOutput, applyAiChanges, code, editorInstance, getSelectionText]
  );

  const handleExecute = useCallback(async () => {
    const aiCommand = extractAiCommand(code);
    if (aiCommand) {
      await runAiCommand(aiCommand);
      return;
    }

    if (!code.trim()) {
      clearOutputs();
      addOutput({
        type: 'error',
        content: 'No code to execute. Please enter some JavaScript code.',
      });
      return;
    }

    if (!selectedServers.length) {
      notifications.show({
        title: 'Select a server',
        message: 'Choose one or more servers from the selector next to Execute.',
        color: 'yellow',
      });
      return;
    }

    clearOutputs();
    setIsExecuting(true);
    setActiveOutputServerId(selectedServers[0]?.id ?? null);

    try {
      const { rpc } = await import('@/core/ipc/rpc');

      for (const server of selectedServers) {
        try {
          const response = await rpc<{ success: boolean; result: any }>(
            'backend.jsconsole.execute',
            {
              serverId: server.id,
              script: code,
              documentNodeRef: documentNodeRef || undefined,
            }
          );

          let resultContent = '';

          if (response.result) {
            if (typeof response.result === 'string') {
              resultContent = response.result;
            } else if (typeof response.result === 'object') {
              const r = response.result;
              const outputs: string[] = [];

              if (Array.isArray(r.printOutput) && r.printOutput.length > 0) {
                const formattedPrintOutput = r.printOutput.map((item: any) => {
                  if (typeof item === 'string') {
                    return item;
                  } else if (typeof item === 'object' && item !== null) {
                    try {
                      return JSON.stringify(item, null, 2);
                    } catch (e) {
                      return String(item);
                    }
                  } else {
                    return String(item);
                  }
                });
                outputs.push(...formattedPrintOutput);
              }

              if (Array.isArray(r.result) && r.result.length > 0) {
                const formattedResults = r.result
                  .filter((item: any) => item !== null && item !== undefined)
                  .map((item: any) => {
                    if (typeof item === 'string') {
                      return item;
                    } else if (typeof item === 'object') {
                      try {
                        const seen = new Set();
                        const json = JSON.stringify(
                          item,
                          (_key, value) => {
                            if (typeof value === 'object' && value !== null) {
                              if (seen.has(value)) {
                                return '[Circular Reference]';
                              }
                              seen.add(value);
                            }
                            return value;
                          },
                          2
                        );
                        return json;
                      } catch (e) {
                        try {
                          const objType = Object.prototype.toString.call(item);
                          const objInfo: any = { type: objType };

                          if (item.nodeRef) objInfo.nodeRef = item.nodeRef;
                          if (item.name) objInfo.name = item.name;
                          if (item.id) objInfo.id = item.id;
                          if (item.type) objInfo.objectType = item.type;

                          return JSON.stringify(objInfo, null, 2);
                        } catch (e2) {
                          return `[Object: ${Object.prototype.toString.call(item)}]`;
                        }
                      }
                    } else {
                      return String(item);
                    }
                  })
                  .filter((str: string) => !str.includes('[object Object]'));

                if (formattedResults.length > 0) {
                  outputs.push('// Return value:');
                  outputs.push(...formattedResults);
                }
              } else if (r.result !== undefined && !Array.isArray(r.result)) {
                outputs.push(
                  '// Return value:',
                  typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2)
                );
              }

              resultContent = outputs.length > 0 ? outputs.join('\n') : '';
            }
          }

          if (resultContent) {
            addOutput({
              type: 'result',
              content: resultContent,
              serverId: server.id,
            });
          } else {
            addOutput({
              type: 'log',
              content: 'Execution completed with no output.',
              serverId: server.id,
            });
          }
        } catch (error) {
          addOutput({
            type: 'error',
            content: `Error executing script:\n${error instanceof Error ? error.message : String(error)}`,
            serverId: server.id,
          });
        }
      }
    } finally {
      await loadHistory(true);
      setIsExecuting(false);
    }
  }, [
    code,
    selectedServers,
    clearOutputs,
    setIsExecuting,
    setActiveOutputServerId,
    documentNodeRef,
    addOutput,
    loadHistory,
    runAiCommand,
  ]);

  const handleInlineAiRequest = useCallback(async () => {
    if (isExecuting || isAiExecuting) {
      return;
    }
    const aiCommand = extractAiCommand(code);
    if (!aiCommand) {
      return;
    }
    await runAiCommand(aiCommand);
  }, [code, isExecuting, isAiExecuting, runAiCommand]);

  // Load history on mount and when server changes
  useEffect(() => {
    void loadHistory(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyServerId, selectedServerIds]);

  // Set up Ctrl+Enter keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExecute]);

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <SplitPanel
        topPanel={<JsConsoleEditor onAiRequest={handleInlineAiRequest} />}
        middleBar={
          <ExecuteBar
            onExecute={handleExecute}
            aiStatus={aiStatus}
            aiBusy={isAiExecuting}
            isNodeRefSpace={isNodeRefSpace}
          />
        }
        bottomPanel={<ConsoleOutput isNodeRefSpace={isNodeRefSpace} />}
        initialSplitPosition={splitPosition}
        onSplitChange={setSplitPosition}
        minTopHeight={200}
        minBottomHeight={150}
      />
    </div>
  );
}

interface AiCommand {
  question: string;
  lineNumber: number;
  rawLine: string;
}

function extractAiCommand(source: string): AiCommand | null {
  const prefixes = ['/ai', ':ai'];
  const lines = source.split('\n');

  // Search all lines from bottom to top, find the first AI command
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    const line = lines[idx];
    if (!line.trim()) {
      continue;
    }

    const trimmed = line.trimStart();

    // Check if line starts with AI command
    const prefix = prefixes.find(p => trimmed.startsWith(p));
    if (prefix) {
      const nextChar = trimmed.charAt(prefix.length);
      if (!nextChar || /\s/.test(nextChar)) {
        const question = trimmed.slice(prefix.length).trim();
        if (question) {
          return { question, lineNumber: idx + 1, rawLine: line };
        }
      }
    }

    // Check for inline AI command (e.g., "code(); /ai do something")
    for (const prefix of prefixes) {
      // Match patterns: "// /ai " or " /ai "
      const inlinePatterns = [
        new RegExp(`//\\s*${prefix.replace('/', '\\/')}\\s+(.+)$`),
        new RegExp(`\\s${prefix.replace('/', '\\/')}\\s+(.+)$`),
      ];

      for (const pattern of inlinePatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const question = match[1].trim();
          if (question) {
            return { question, lineNumber: idx + 1, rawLine: line };
          }
        }
      }
    }
  }

  return null;
}

function buildContextSnippet(source: string, limit = 4000): string {
  if (source.length <= limit) {
    return source;
  }
  return source.slice(source.length - limit);
}

function computeCommandRange(
  editor: monaco.editor.IStandaloneCodeEditor,
  lineNumber: number
): monaco.IRange | null {
  if (!editor) {
    return null;
  }
  const model = editor.getModel();
  if (!model) {
    return null;
  }
  if (lineNumber < 1 || lineNumber > model.getLineCount()) {
    return null;
  }
  const lineLength = model.getLineLength(lineNumber);
  return {
    startLineNumber: lineNumber,
    startColumn: 1,
    endLineNumber: lineNumber,
    endColumn: lineLength + 1,
  };
}

export default JsConsolePage;
