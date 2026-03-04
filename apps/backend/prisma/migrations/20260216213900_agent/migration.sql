-- CreateTable
CREATE TABLE "agent_chat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "chatIcon" TEXT NOT NULL DEFAULT 'hash',
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "agent_chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_chat_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "agent_chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_run" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "triggerMessageId" INTEGER,
    "status" TEXT NOT NULL,
    "manifestVersion" TEXT NOT NULL,
    "planJson" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "agent_run_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "agent_chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_run_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_run_triggerMessageId_fkey" FOREIGN KEY ("triggerMessageId") REFERENCES "agent_message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_run_step" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmationToken" TEXT,
    "confirmedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_run_step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_run_event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_run_event_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_run_event_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "agent_run_step" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_operation_audit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetSummary" TEXT,
    "requestMessageId" INTEGER,
    "confirmationMessageId" INTEGER,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_operation_audit_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "agent_run_step" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_requestMessageId_fkey" FOREIGN KEY ("requestMessageId") REFERENCES "agent_message" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agent_operation_audit_confirmationMessageId_fkey" FOREIGN KEY ("confirmationMessageId") REFERENCES "agent_message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "agent_chat_userId_serverId_updatedAt_idx" ON "agent_chat"("userId", "serverId", "updatedAt");
CREATE INDEX "agent_chat_userId_updatedAt_idx" ON "agent_chat"("userId", "updatedAt");

CREATE INDEX "agent_message_chatId_id_idx" ON "agent_message"("chatId", "id");
CREATE INDEX "agent_message_chatId_createdAt_idx" ON "agent_message"("chatId", "createdAt");

CREATE INDEX "agent_run_chatId_createdAt_idx" ON "agent_run"("chatId", "createdAt");
CREATE INDEX "agent_run_userId_status_createdAt_idx" ON "agent_run"("userId", "status", "createdAt");
CREATE INDEX "agent_run_serverId_status_idx" ON "agent_run"("serverId", "status");

CREATE UNIQUE INDEX "agent_run_step_runId_ordinal_key" ON "agent_run_step"("runId", "ordinal");
CREATE INDEX "agent_run_step_runId_createdAt_idx" ON "agent_run_step"("runId", "createdAt");

CREATE INDEX "agent_run_event_runId_id_idx" ON "agent_run_event"("runId", "id");
CREATE INDEX "agent_run_event_runId_createdAt_idx" ON "agent_run_event"("runId", "createdAt");

CREATE INDEX "agent_operation_audit_runId_stepId_createdAt_idx" ON "agent_operation_audit"("runId", "stepId", "createdAt");
CREATE INDEX "agent_operation_audit_userId_createdAt_idx" ON "agent_operation_audit"("userId", "createdAt");
CREATE INDEX "agent_operation_audit_operation_createdAt_idx" ON "agent_operation_audit"("operation", "createdAt");
