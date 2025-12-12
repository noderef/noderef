-- CreateTable
CREATE TABLE "user" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT,
    "fullName" TEXT,
    "thumbnail" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiAssistantEnabled" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "server" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "serverType" TEXT NOT NULL DEFAULT 'alfresco',
    "authType" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "token" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" DATETIME,
    "oidcHost" TEXT,
    "oidcRealm" TEXT,
    "oidcClientId" TEXT,
    "jsconsoleEndpoint" TEXT,
    "thumbnail" BLOB,
    "color" TEXT,
    "label" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "lastAccessed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "server_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "saved_search" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "columns" TEXT,
    "lastAccessed" DATETIME,
    "lastDiffCount" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_search_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
CONSTRAINT "saved_search_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "searchId" INTEGER,
    "query" TEXT NOT NULL,
    "resultsCount" INTEGER,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "search_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "search_history_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "saved_search" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "local_file" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "content" TEXT,
    "deletedAt" DATETIME,
    "lastModified" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "local_file_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "node_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "nodeRef" TEXT NOT NULL,
    "parentRef" TEXT,
    "name" TEXT,
    "path" TEXT,
    "type" TEXT,
    "mimetype" TEXT,
    "accessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "node_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
CONSTRAINT "node_history_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jsconsole_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER,
    "script" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jsconsole_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "jsconsole_history_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_ai_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_ai_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "server_userId_displayOrder_idx" ON "server"("userId", "displayOrder");

-- CreateIndex
CREATE INDEX "saved_search_userId_serverId_idx" ON "saved_search"("userId", "serverId");

-- CreateIndex
CREATE INDEX "search_history_userId_searchId_idx" ON "search_history"("userId", "searchId");

-- CreateIndex
CREATE INDEX "local_file_userId_idx" ON "local_file"("userId");

-- CreateIndex
CREATE INDEX "node_history_userId_serverId_idx" ON "node_history"("userId", "serverId");

-- CreateIndex
CREATE INDEX "jsconsole_history_userId_idx" ON "jsconsole_history"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_ai_settings_userId_provider_key" ON "user_ai_settings"("userId", "provider");

-- CreateIndex
CREATE INDEX "user_ai_settings_userId_provider_idx" ON "user_ai_settings"("userId", "provider");
