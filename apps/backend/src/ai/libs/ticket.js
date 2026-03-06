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

/**
 * Ticket root object examples (OOTBee Support Tools)
 *
 * Root object:
 *   - ticket -> TicketScriptExtension
 *
 * API:
 *   - ticket.getCurrentTicket() -> String
 *
 * Notes:
 *   - Returns the current authentication ticket of the user executing the script
 *   - Ticket value is sensitive. Treat it like a password.
 *   - Mainly useful for debugging integrations or passing tickets to legacy APIs.
 */

/**
 * Get and log the current authentication ticket.
 */
function example_ticket_getCurrentTicket() {
  var t = ticket.getCurrentTicket();
  logger.log('Current ticket: ' + t);
}

/**
 * Use the current ticket to build an authenticated URL.
 * Example: calling a legacy Alfresco endpoint that accepts ?alf_ticket=
 */
function example_ticket_buildAuthenticatedUrl() {
  var t = ticket.getCurrentTicket();

  var baseUrl = 'http://localhost:8080/alfresco/service/api/server';
  var url = baseUrl + '?alf_ticket=' + t;

  logger.log('Authenticated URL: ' + url);
}

/**
 * Defensive usage: ensure a ticket exists before using it.
 */
function example_ticket_safeUsage() {
  var t = ticket.getCurrentTicket();

  if (!t) {
    logger.log('No authentication ticket available');
    return;
  }

  logger.log('Ticket length: ' + t.length);
}

/**
 * Example integration pattern:
 * Attach the ticket to an outbound HTTP call (pseudo-code).
 */
function example_ticket_forIntegration() {
  var t = ticket.getCurrentTicket();

  if (!t) {
    throw 'Cannot call external service without authentication ticket';
  }

  // Example only – actual HTTP client depends on your environment
  logger.log('Using ticket for downstream call: ' + t);
}
