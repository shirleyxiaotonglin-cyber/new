-- CreateTable
CREATE TABLE "DirectThread" (
    "id" TEXT NOT NULL,
    "userLowId" TEXT NOT NULL,
    "userHighId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskChatMessage" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectThread_userLowId_idx" ON "DirectThread"("userLowId");

-- CreateIndex
CREATE INDEX "DirectThread_userHighId_idx" ON "DirectThread"("userHighId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectThread_userLowId_userHighId_key" ON "DirectThread"("userLowId", "userHighId");

-- CreateIndex
CREATE INDEX "DirectMessage_threadId_createdAt_idx" ON "DirectMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskChatMessage_taskId_createdAt_idx" ON "TaskChatMessage"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "DirectThread" ADD CONSTRAINT "DirectThread_userLowId_fkey" FOREIGN KEY ("userLowId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectThread" ADD CONSTRAINT "DirectThread_userHighId_fkey" FOREIGN KEY ("userHighId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DirectThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChatMessage" ADD CONSTRAINT "TaskChatMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChatMessage" ADD CONSTRAINT "TaskChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
