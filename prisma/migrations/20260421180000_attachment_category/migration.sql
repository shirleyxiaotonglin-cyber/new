-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "category" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_taskId_idx" ON "Attachment"("taskId");
