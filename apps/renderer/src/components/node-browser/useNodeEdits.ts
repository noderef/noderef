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

import {
  backendRpc,
  type AlfrescoNodeDetails,
  type EditablePropertyDefinition,
  type NodeEditMetadata,
} from '@/core/ipc/backend';
import { useServersStore } from '@/core/store/servers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listTypeAndAspectNames, parseClassPropertyDefs } from './dictionaryClasses';
import {
  countNodeEdits,
  editorValueToRest,
  resolvePropertyDefinition,
  slingshotValuesToEditorValue,
  valuesAreEqual,
} from './propertyEditing';

export interface NodeEditsState {
  properties: Record<string, unknown | null>;
  addAspects: string[];
  removeAspects: string[];
  nodeType: string | null;
}

function cloneEmpty(): NodeEditsState {
  return {
    properties: {},
    addAspects: [],
    removeAspects: [],
    nodeType: null,
  };
}

interface UseNodeEditsOptions {
  serverId: number;
  nodeId: string;
  nodeData: AlfrescoNodeDetails;
}

export function useNodeEdits({ serverId, nodeId, nodeData }: UseNodeEditsOptions) {
  const [edits, setEdits] = useState<NodeEditsState>(cloneEmpty);
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState<NodeEditMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [dictionaryClasses, setDictionaryClasses] = useState<unknown[] | null>(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const metadataPromiseRef = useRef<Promise<NodeEditMetadata | null> | null>(null);
  const dictionaryPromiseRef = useRef<Promise<unknown[]> | null>(null);
  const getServerById = useServersStore(state => state.getServerById);

  useEffect(() => {
    setEdits(cloneEmpty());
    setMetadata(null);
    setDictionaryClasses(null);
    metadataPromiseRef.current = null;
    dictionaryPromiseRef.current = null;
  }, [serverId, nodeId, nodeData]);

  const currentAspects = useMemo(
    () => nodeData.aspects.map(aspect => aspect.prefixedName),
    [nodeData.aspects]
  );
  const currentType = nodeData.type?.prefixedName ?? '';

  const ensureMetadata = useCallback(async () => {
    if (metadata) {
      return metadata;
    }
    if (!metadataPromiseRef.current) {
      metadataPromiseRef.current = (async () => {
        setMetadataLoading(true);
        try {
          const result = await backendRpc.repository.getNodeEditMetadata(serverId, nodeId);
          setMetadata(result);
          return result;
        } catch (error) {
          metadataPromiseRef.current = null;
          throw error;
        } finally {
          setMetadataLoading(false);
        }
      })();
    }
    return metadataPromiseRef.current;
  }, [metadata, nodeId, serverId]);

  const ensureDictionary = useCallback(async () => {
    if (dictionaryClasses) {
      return dictionaryClasses;
    }
    if (!dictionaryPromiseRef.current) {
      const server = getServerById(serverId);
      if (!server?.baseUrl) {
        return [];
      }
      dictionaryPromiseRef.current = (async () => {
        setDictionaryLoading(true);
        try {
          const classes = await backendRpc.alfresco.dictionary.getClasses(
            serverId,
            server.baseUrl,
            ''
          );
          const list = Array.isArray(classes) ? classes : [];
          setDictionaryClasses(list);
          return list;
        } catch (error) {
          dictionaryPromiseRef.current = null;
          throw error;
        } finally {
          setDictionaryLoading(false);
        }
      })();
    }
    return dictionaryPromiseRef.current;
  }, [dictionaryClasses, getServerById, serverId]);

  const propertyDefinitions = useMemo(() => {
    const map = new Map<string, EditablePropertyDefinition>();
    for (const definition of metadata?.properties ?? []) {
      map.set(definition.name, definition);
    }
    if (dictionaryClasses && edits.addAspects.length > 0) {
      const byName = new Map<string, unknown>();
      for (const classDef of dictionaryClasses) {
        const record = classDef as { name?: string | { prefixedName?: string; name?: string } };
        const name =
          typeof record?.name === 'string'
            ? record.name
            : record?.name?.prefixedName || record?.name?.name;
        if (typeof name === 'string') {
          byName.set(name, classDef);
        }
      }
      for (const aspect of edits.addAspects) {
        const classDef = byName.get(aspect);
        if (!classDef) {
          continue;
        }
        for (const definition of parseClassPropertyDefs(classDef)) {
          if (!map.has(definition.name)) {
            map.set(definition.name, definition);
          }
        }
      }
    }
    return map;
  }, [dictionaryClasses, edits.addAspects, metadata]);

  const originalPropertyValues = useMemo(() => {
    const values: Record<string, unknown | null> = {};
    for (const property of nodeData.properties) {
      const definition = resolvePropertyDefinition(property, propertyDefinitions);
      values[property.name.prefixedName] = editorValueToRest(
        slingshotValuesToEditorValue(property.values, definition),
        definition
      );
    }
    return values;
  }, [nodeData.properties, propertyDefinitions]);

  const setPropertyValue = useCallback(
    (name: string, value: unknown | null) => {
      setEdits(current => {
        const original = originalPropertyValues[name] ?? null;
        const nextProperties = { ...current.properties };
        if (valuesAreEqual(value, original)) {
          delete nextProperties[name];
        } else {
          nextProperties[name] = value;
        }
        return { ...current, properties: nextProperties };
      });
    },
    [originalPropertyValues]
  );

  const undoProperty = useCallback((name: string) => {
    setEdits(current => {
      if (!(name in current.properties)) {
        return current;
      }
      const nextProperties = { ...current.properties };
      delete nextProperties[name];
      return { ...current, properties: nextProperties };
    });
  }, []);

  const addAspect = useCallback(
    (name: string) => {
      setEdits(current => {
        if (current.addAspects.includes(name) || currentAspects.includes(name)) {
          if (current.removeAspects.includes(name)) {
            return {
              ...current,
              removeAspects: current.removeAspects.filter(aspect => aspect !== name),
            };
          }
          return current;
        }
        if (current.removeAspects.includes(name)) {
          return {
            ...current,
            removeAspects: current.removeAspects.filter(aspect => aspect !== name),
          };
        }
        return { ...current, addAspects: [...current.addAspects, name] };
      });
    },
    [currentAspects]
  );

  const removeAspect = useCallback(
    (name: string) => {
      setEdits(current => {
        if (current.addAspects.includes(name)) {
          return {
            ...current,
            addAspects: current.addAspects.filter(aspect => aspect !== name),
          };
        }
        if (!currentAspects.includes(name) || current.removeAspects.includes(name)) {
          return current;
        }
        return { ...current, removeAspects: [...current.removeAspects, name] };
      });
    },
    [currentAspects]
  );

  const setNodeType = useCallback(
    (nodeType: string | null) => {
      setEdits(current => ({
        ...current,
        nodeType: nodeType && nodeType !== currentType ? nodeType : null,
      }));
    },
    [currentType]
  );

  const reset = useCallback(() => {
    setEdits(cloneEmpty());
  }, []);

  const save = useCallback(async () => {
    const propertyCount = Object.keys(edits.properties).length;
    if (
      propertyCount === 0 &&
      edits.addAspects.length === 0 &&
      edits.removeAspects.length === 0 &&
      !edits.nodeType
    ) {
      return;
    }

    setSaving(true);
    try {
      await backendRpc.repository.updateNode(serverId, nodeId, {
        properties: propertyCount > 0 ? edits.properties : undefined,
        nodeType: edits.nodeType ?? undefined,
        addAspects: edits.addAspects.length > 0 ? edits.addAspects : undefined,
        removeAspects: edits.removeAspects.length > 0 ? edits.removeAspects : undefined,
      });
      setEdits(cloneEmpty());
    } finally {
      setSaving(false);
    }
  }, [edits, nodeId, serverId]);

  const changeCount = countNodeEdits(edits);
  const isDirty = changeCount > 0;
  const typeAndAspectNames = useMemo(
    () => listTypeAndAspectNames(dictionaryClasses ?? []),
    [dictionaryClasses]
  );

  return {
    edits,
    isDirty,
    changeCount,
    saving,
    metadata,
    metadataLoading,
    dictionaryLoading,
    propertyDefinitions,
    availableTypes: typeAndAspectNames.types,
    availableAspects: typeAndAspectNames.aspects,
    dictionaryClasses: dictionaryClasses ?? [],
    currentType,
    currentAspects,
    originalPropertyValues,
    ensureMetadata,
    ensureDictionary,
    setPropertyValue,
    undoProperty,
    addAspect,
    removeAspect,
    setNodeType,
    reset,
    save,
  };
}
