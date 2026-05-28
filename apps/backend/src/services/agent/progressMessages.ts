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

export interface ProgressNote {
  type: string;
  payload: { text: string };
}

const SUPPORTED_LANGS = ['en', 'nl', 'de', 'es', 'fr'] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

const resolveLang = (preferredLanguage?: string): SupportedLang => {
  const base = (preferredLanguage ?? 'en').split('-')[0]?.toLowerCase() ?? 'en';
  return SUPPORTED_LANGS.includes(base as SupportedLang) ? (base as SupportedLang) : 'en';
};

type ProgressCopy = {
  queued: string;
  analyzing: string;
  choosingTool: string;
  choosingTools: (count: number) => string;
  composingAnswer: string;
  running: (label: string) => string;
  awaitingConfirmation: (action: string) => string;
  done: string;
  completedWithErrors: string;
  maxStepsFallback: string;
};

const COPY: Record<SupportedLang, ProgressCopy> = {
  en: {
    queued: 'Queued',
    analyzing: 'Analyzing request',
    choosingTool: 'Choosing a tool',
    choosingTools: count => `Choosing ${count} tools`,
    composingAnswer: 'Composing answer',
    running: label => `Running ${label}`,
    awaitingConfirmation: action => `Awaiting confirmation: ${action}`,
    done: 'Done.',
    completedWithErrors: 'Completed with errors.',
    maxStepsFallback:
      'I was unable to complete the request within the step limit. Please try a more specific question.',
  },
  nl: {
    queued: 'In wachtrij',
    analyzing: 'Verzoek analyseren…',
    choosingTool: 'Tool kiezen',
    choosingTools: count => `${count} tools kiezen`,
    composingAnswer: 'Antwoord opstellen',
    running: label => `Bezig met ${label}`,
    awaitingConfirmation: action => `Wacht op bevestiging: ${action}`,
    done: 'Klaar.',
    completedWithErrors: 'Voltooid met fouten.',
    maxStepsFallback:
      'Ik kon het verzoek niet voltooien binnen de staplimiet. Probeer een specifiekere vraag.',
  },
  de: {
    queued: 'In Warteschlange',
    analyzing: 'Anfrage wird analysiert…',
    choosingTool: 'Tool wird ausgewählt',
    choosingTools: count => `${count} Tools werden ausgewählt`,
    composingAnswer: 'Antwort wird erstellt',
    running: label => `${label} wird ausgeführt`,
    awaitingConfirmation: action => `Warte auf Bestätigung: ${action}`,
    done: 'Fertig.',
    completedWithErrors: 'Mit Fehlern abgeschlossen.',
    maxStepsFallback:
      'Die Anfrage konnte innerhalb des Schrittlimits nicht abgeschlossen werden. Bitte stellen Sie eine spezifischere Frage.',
  },
  es: {
    queued: 'En cola',
    analyzing: 'Analizando solicitud…',
    choosingTool: 'Eligiendo una herramienta',
    choosingTools: count => `Eligiendo ${count} herramientas`,
    composingAnswer: 'Redactando respuesta',
    running: label => `Ejecutando ${label}`,
    awaitingConfirmation: action => `Esperando confirmación: ${action}`,
    done: 'Listo.',
    completedWithErrors: 'Completado con errores.',
    maxStepsFallback:
      'No pude completar la solicitud dentro del límite de pasos. Intente con una pregunta más específica.',
  },
  fr: {
    queued: 'En file d’attente',
    analyzing: 'Analyse de la demande…',
    choosingTool: 'Choix d’un outil',
    choosingTools: count => `Choix de ${count} outils`,
    composingAnswer: 'Rédaction de la réponse',
    running: label => `Exécution de ${label}`,
    awaitingConfirmation: action => `En attente de confirmation : ${action}`,
    done: 'Terminé.',
    completedWithErrors: 'Terminé avec des erreurs.',
    maxStepsFallback:
      "Je n'ai pas pu terminer la demande dans la limite d'étapes. Essayez une question plus précise.",
  },
};

const note = (text: string): ProgressNote => ({ type: 'run.note', payload: { text } });

const copyFor = (preferredLanguage?: string): ProgressCopy => COPY[resolveLang(preferredLanguage)];

export const buildQueuedNote = (preferredLanguage?: string): ProgressNote =>
  note(copyFor(preferredLanguage).queued);

export const buildAnalyzingNote = (preferredLanguage?: string): ProgressNote =>
  note(copyFor(preferredLanguage).analyzing);

export const buildChoosingToolsNote = (
  toolCount: number,
  preferredLanguage?: string
): ProgressNote => {
  const copy = copyFor(preferredLanguage);
  return note(toolCount === 1 ? copy.choosingTool : copy.choosingTools(toolCount));
};

export const buildComposingAnswerNote = (preferredLanguage?: string): ProgressNote =>
  note(copyFor(preferredLanguage).composingAnswer);

export const buildRunningToolNote = (
  operation: string,
  summary?: string | null,
  preferredLanguage?: string
): ProgressNote => {
  const label = summary?.trim() || humanizeOperation(operation);
  return note(copyFor(preferredLanguage).running(label));
};

export const buildWaitingConfirmationNote = (
  actionSummary: string,
  preferredLanguage?: string
): ProgressNote => note(copyFor(preferredLanguage).awaitingConfirmation(actionSummary));

export const buildCompletionNote = (success: boolean, preferredLanguage?: string): ProgressNote =>
  note(success ? copyFor(preferredLanguage).done : copyFor(preferredLanguage).completedWithErrors);

export const buildMaxStepsFallbackMessage = (preferredLanguage?: string): string =>
  copyFor(preferredLanguage).maxStepsFallback;

const humanizeOperation = (operation: string): string =>
  operation.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
