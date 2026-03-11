-- CreateTable
CREATE TABLE "insight_graph" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'area',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" DATETIME,
    "filterQuery" TEXT NOT NULL,
    "dateField" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#228be6',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "columnSpan" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "insight_graph_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "insight_graph_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "insight_snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "graphId" INTEGER NOT NULL,
    "bucketDate" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "queryHash" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "insight_snapshot_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "insight_graph" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "insight_graph_userId_serverId_displayOrder_idx" ON "insight_graph"("userId", "serverId", "displayOrder");

-- CreateIndex
CREATE INDEX "insight_graph_userId_isPinned_pinnedAt_idx" ON "insight_graph"("userId", "isPinned", "pinnedAt");

-- CreateIndex
CREATE INDEX "insight_snapshot_graphId_bucketDate_idx" ON "insight_snapshot"("graphId", "bucketDate");

-- CreateIndex
CREATE UNIQUE INDEX "insight_snapshot_graphId_bucketDate_queryHash_key" ON "insight_snapshot"("graphId", "bucketDate", "queryHash");
