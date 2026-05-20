/**
 * Copyright 2025-2026 NodeRef
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
import { rpc } from '@/core/ipc/rpc';
import { dslManager } from '@/core/monaco/dsl-manager';
import { useJsConsoleStore } from '@/core/store/jsConsole';
import { useServersStore } from '@/core/store/servers';
import { useActiveServerId } from '@/hooks/useNavigation';
import { notifications } from '@mantine/notifications';
import type * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// JavaScript Console execution constants
const JS_CONSOLE_POLL_INTERVAL_MS = 1000; // Poll every second for progress updates
const JS_CONSOLE_EXECUTE_TIMEOUT_MS = 30000; // Initial execute call timeout
const JS_CONSOLE_COMPLETION_TIMEOUT_MS = 120000; // Timeout for retrieving final result

// Helper: Format printOutput array to string
const formatPrintOutputToString = (printOutput: unknown): string => {
  if (!Array.isArray(printOutput)) return '';
  return printOutput
    .map(item => {
      if (typeof item === 'string') {
        return item;
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join('\n');
};

function JsConsolePage() {
  const { t } = useTranslation('jsConsole');
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

  // Manage DSL loading/unloading based on selected servers
  // DSLs persist across page navigation to avoid flickering
  useEffect(() => {
    const currentServerIds = new Set(selectedServers.map(s => s.id));
    const loadedServerIds = dslManager.getLoadedServerIds();

    // Unload DSLs for deselected servers
    loadedServerIds.forEach(serverId => {
      if (!currentServerIds.has(serverId)) {
        dslManager.unloadCustomDsl(serverId);
      }
    });

    // Load DSLs for selected servers
    selectedServers.forEach(server => {
      if (server.id && server.baseUrl) {
        void dslManager.loadCustomDsl(server.id, server.baseUrl);
      }
    });
  }, [selectedServers]);

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

  const streamedPrintSeenRef = useRef<Record<string, boolean>>({});
  const liveOutputIdsRef = useRef<Record<string, string>>({});

  /**
   * Update streaming output with new printOutput lines (shown as LOG during execution)
   */
  const appendPrintOutput = useCallback(
    (serverId: number | undefined, channelKey: string, printOutput: unknown) => {
      if (!Array.isArray(printOutput) || printOutput.length === 0) return;

      const content = formatPrintOutputToString(printOutput);
      streamedPrintSeenRef.current[channelKey] = true;

      const liveOutputId = liveOutputIdsRef.current[channelKey];

      if (liveOutputId) {
        useJsConsoleStore.getState().updateOutput(liveOutputId, content);
      } else {
        const newId = addOutput({ type: 'log', content, serverId });
        liveOutputIdsRef.current[channelKey] = newId;
      }
    },
    [addOutput]
  );

  /**
   * Finalize streaming output - convert LOG to RESULT when script completes
   */
  const finalizePrintOutput = useCallback((channelKey: string, printOutput: unknown) => {
    const liveOutputId = liveOutputIdsRef.current[channelKey];
    if (!liveOutputId || !Array.isArray(printOutput) || printOutput.length === 0) return;

    const content = formatPrintOutputToString(printOutput);
    useJsConsoleStore.getState().finalizeOutput(liveOutputId, content, 'result');
  }, []);

  const formatExecutionResult = useCallback(
    (result: any, options?: { includePrintOutput?: boolean }) => {
      if (!result) {
        return '';
      }

      const includePrintOutput = options?.includePrintOutput ?? true;
      const outputs: string[] = [];

      if (
        includePrintOutput &&
        Array.isArray(result.printOutput) &&
        result.printOutput.length > 0
      ) {
        const formattedPrintOutput = result.printOutput.map((item: any) => {
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

      if (Array.isArray(result.result) && result.result.length > 0) {
        const formattedResults = result.result
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
      } else if (result.result !== undefined && !Array.isArray(result.result)) {
        outputs.push(
          '// Return value:',
          typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)
        );
      }

      return outputs.length > 0 ? outputs.join('\n') : '';
    },
    []
  );

  const wait = useCallback((ms: number) => new Promise(resolve => setTimeout(resolve, ms)), []);

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

      try {
        const selectionText = getSelectionText();
        const hasSelection = Boolean(selectionText && selectionText.trim().length > 0);
        const aiServerId = activeServerId ?? selectedServerIds[0] ?? null;
        const selectedLibs = await callAiRouter(command.question, { serverId: aiServerId });
        const result = await callAiExecute({
          question: command.question,
          selected: selectedLibs,
          serverId: aiServerId,
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
    [
      isAiExecuting,
      aiStatus,
      addOutput,
      applyAiChanges,
      code,
      editorInstance,
      getSelectionText,
      activeServerId,
      selectedServerIds,
    ]
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
      streamedPrintSeenRef.current = {};
      liveOutputIdsRef.current = {};

      /**
       * Execution flow:
       * 1. Call backend.jsconsole.execute with stream: true
       * 2. Quick scripts (< 2s): return immediate result with done: true
       * 3. Long scripts: return resultChannel and done: false
       * 4. For long scripts:
       *    a. Poll backend.jsconsole.pollExecutionResult every 1s for progress
       *    b. Display incremental printOutput as LOG (blue badge)
       *    c. When polling shows done: true, call getExecuteCompletionResult
       *    d. Finalize LOG output to RESULT (green badge)
       *    e. Display final result array if present
       */
      for (const server of selectedServers) {
        try {
          const response = await rpc<
            | { success: true; result: any; done: true; resultChannel?: string }
            | { success: true; result?: any; done?: false; resultChannel: string }
            | { success: false; result?: any; error?: string }
          >(
            'backend.jsconsole.execute',
            {
              serverId: server.id,
              script: code,
              documentNodeRef: documentNodeRef || undefined,
              stream: true,
            },
            { timeoutMs: JS_CONSOLE_EXECUTE_TIMEOUT_MS }
          );

          /**
           * Process final execution result and add output blocks
           * @param result - Execution result from server
           * @param channelKey - Channel key if this was a streaming execution (null for quick scripts)
           */
          const processFinalResult = (result: any, channelKey: string | null) => {
            const didStreamOutput = channelKey && streamedPrintSeenRef.current[channelKey];

            const renderError = (errorValue: unknown) => {
              const message =
                typeof errorValue === 'string'
                  ? errorValue
                  : (() => {
                      try {
                        return JSON.stringify(errorValue, null, 2);
                      } catch {
                        return String(errorValue);
                      }
                    })();
              addOutput({ type: 'error', content: message, serverId: server.id });
            };

            // Handle errors - Alfresco JS Console uses error, callstack, or message fields
            if (result?.error !== undefined) {
              renderError(result.error);
              return;
            }
            if (result?.callstack !== undefined) {
              renderError(result.callstack);
              return;
            }
            if (result?.message !== undefined && result?.status?.code >= 400) {
              // Prefer callstack if available, otherwise use message
              renderError(result.callstack || result.message);
              return;
            }

            // Handle string results
            if (typeof result === 'string') {
              addOutput({ type: 'result', content: result, serverId: server.id });
              return;
            }

            // Handle printOutput for quick scripts (streaming scripts already have it)
            const hasPrintOutput =
              Array.isArray(result?.printOutput) && result.printOutput.length > 0;

            if (!didStreamOutput && hasPrintOutput) {
              const content = formatPrintOutputToString(result.printOutput);
              addOutput({ type: 'result', content, serverId: server.id });
            }

            // Handle result array if it contains actual data
            const hasResultData =
              Array.isArray(result?.result) &&
              result.result.filter((item: any) => item !== null && item !== undefined).length > 0;

            if (hasResultData) {
              const resultContent = formatExecutionResult(result, { includePrintOutput: false });
              if (resultContent) {
                addOutput({ type: 'result', content: resultContent, serverId: server.id });
              }
            } else if (!didStreamOutput && !hasPrintOutput) {
              addOutput({
                type: 'log',
                content: t('executionCompletedNoOutput'),
                serverId: server.id,
              });
            }
          };

          // Check if execution failed
          if (!response.success) {
            if (response.result) {
              processFinalResult(response.result, null);
            } else {
              addOutput({
                type: 'error',
                content: t('executionErrorGeneric'),
                serverId: server.id,
              });
            }
            continue;
          }

          if (response.done && response.result) {
            processFinalResult(response.result, null);
            continue;
          }

          if (!response.resultChannel) {
            addOutput({
              type: 'error',
              content: t('executionMissingResultChannel'),
              serverId: server.id,
            });
            continue;
          }

          const channelKey = `${server.id}:${response.resultChannel}`;
          const pollDeadline = Date.now() + JS_CONSOLE_COMPLETION_TIMEOUT_MS;

          // Poll for progress updates until script completes
          while (true) {
            if (Date.now() > pollDeadline) {
              addOutput({
                type: 'error',
                content: t('executionTimedOut', {
                  seconds: Math.round(JS_CONSOLE_COMPLETION_TIMEOUT_MS / 1000),
                }),
                serverId: server.id,
              });
              break;
            }

            await wait(JS_CONSOLE_POLL_INTERVAL_MS);

            try {
              const pollResult = await rpc<{
                success: boolean;
                result?: any;
                done: boolean;
              }>(
                'backend.jsconsole.pollExecutionResult',
                {
                  serverId: server.id,
                  resultChannel: response.resultChannel,
                  script: code,
                  documentNodeRef: documentNodeRef || undefined,
                },
                { timeoutMs: JS_CONSOLE_POLL_INTERVAL_MS + 5000 }
              );

              // Stream incremental printOutput as it arrives
              const printOutput = pollResult?.result?.printOutput;
              if (Array.isArray(printOutput) && printOutput.length > 0) {
                appendPrintOutput(server.id, channelKey, printOutput);
              }

              // When polling indicates completion, retrieve final result from POST
              if (pollResult.done) {
                try {
                  const completeResult = await rpc<{
                    success: boolean;
                    result?: any;
                    done: boolean;
                    error?: string;
                  }>(
                    'backend.jsconsole.getExecuteCompletionResult',
                    {
                      serverId: server.id,
                      resultChannel: response.resultChannel,
                      script: code,
                    },
                    { timeoutMs: JS_CONSOLE_COMPLETION_TIMEOUT_MS }
                  );

                  if (!completeResult.success) {
                    addOutput({
                      type: 'error',
                      content: completeResult.error ?? t('executionFinalResultFailed'),
                      serverId: server.id,
                    });
                    processFinalResult(pollResult.result, channelKey);
                    break;
                  }

                  if (completeResult.result) {
                    const completePrintOutput = completeResult.result?.printOutput;
                    if (Array.isArray(completePrintOutput) && completePrintOutput.length > 0) {
                      finalizePrintOutput(channelKey, completePrintOutput);
                    }
                    processFinalResult(completeResult.result, channelKey);
                  } else {
                    addOutput({
                      type: 'log',
                      content: t('executionNoResultReturned'),
                      serverId: server.id,
                    });
                  }
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  addOutput({
                    type: 'error',
                    content: t('executionFinalResultFetchFailed', { error: errorMessage }),
                    serverId: server.id,
                  });
                  processFinalResult(pollResult.result, channelKey);
                }
                break;
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              addOutput({
                type: 'error',
                content: t('executionPollingError', { error: errorMessage }),
                serverId: server.id,
              });
              break;
            }
          }
        } catch (error) {
          // Extract detailed error information from RPC error
          let errorContent = '';

          if (error && typeof error === 'object') {
            const errorObj = error as any;

            // Check if there's a result with error details from the server
            if (errorObj.result?.error) {
              errorContent +=
                typeof errorObj.result.error === 'string'
                  ? errorObj.result.error
                  : JSON.stringify(errorObj.result.error, null, 2);
            } else if (errorObj.message) {
              errorContent += errorObj.message;
            } else {
              errorContent += String(error);
            }
          } else {
            errorContent += String(error);
          }

          const errorMessage = errorContent.trim()
            ? t('executionErrorWithDetails', { error: errorContent })
            : t('executionErrorGeneric');

          addOutput({
            type: 'error',
            content: errorMessage,
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
    appendPrintOutput,
    finalizePrintOutput,
    formatExecutionResult,
    wait,
    t,
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
