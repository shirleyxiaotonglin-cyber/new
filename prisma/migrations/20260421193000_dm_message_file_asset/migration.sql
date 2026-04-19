-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN "fileAssetId" TEXT;

-- CreateIndex
CREATE INDEX "DirectMessage_fileAssetId_idx" ON "DirectMessage"("fileAssetId");

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
