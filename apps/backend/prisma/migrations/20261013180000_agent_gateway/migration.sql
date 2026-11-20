-- CreateTable
CREATE TABLE "agent_gateway_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "endpointUrl" TEXT,
    "apiKey" TEXT,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "verifiedRepositoryId" TEXT,
    "verifiedEndpointUrl" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "agent_gateway_config_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_gateway_config_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_gateway_config_serverId_key" ON "agent_gateway_config"("serverId");

-- CreateIndex
CREATE INDEX "agent_gateway_config_userId_serverId_idx" ON "agent_gateway_config"("userId", "serverId");

-- AlterTable
ALTER TABLE "agent_chat" ADD COLUMN "mcpSettingsJson" TEXT;

-- AlterTable
ALTER TABLE "agent_message" ADD COLUMN "contextJson" TEXT;
