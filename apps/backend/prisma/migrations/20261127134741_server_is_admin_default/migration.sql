-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_server" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "serverType" TEXT NOT NULL DEFAULT 'alfresco',
    "authType" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" TEXT,
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
    "insightRangeDays" INTEGER NOT NULL DEFAULT 7,
    "lastAccessed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "server_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_server" ("authType", "baseUrl", "capabilities", "color", "createdAt", "displayOrder", "id", "insightRangeDays", "isAdmin", "jsconsoleEndpoint", "label", "lastAccessed", "name", "oidcClientId", "oidcHost", "oidcRealm", "refreshToken", "serverType", "thumbnail", "token", "tokenExpiry", "userId", "username") SELECT "authType", "baseUrl", "capabilities", "color", "createdAt", "displayOrder", "id", "insightRangeDays", "isAdmin", "jsconsoleEndpoint", "label", "lastAccessed", "name", "oidcClientId", "oidcHost", "oidcRealm", "refreshToken", "serverType", "thumbnail", "token", "tokenExpiry", "userId", "username" FROM "server";
DROP TABLE "server";
ALTER TABLE "new_server" RENAME TO "server";
CREATE INDEX "server_userId_displayOrder_idx" ON "server"("userId", "displayOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
