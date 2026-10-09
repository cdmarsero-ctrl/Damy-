-- CreateTable
CREATE TABLE "InterpreterSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maxSeconds" INTEGER NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "endReason" TEXT,
    "asrSeconds" DOUBLE PRECISION,
    "mtRequests" INTEGER,
    "mtInputTokens" INTEGER,
    "mtOutputTokens" INTEGER,
    "mtCacheReadTokens" INTEGER,
    "mtCacheWriteTokens" INTEGER,
    "ttsCharacters" INTEGER,
    "sentences" INTEGER,
    "captionP50Ms" DOUBLE PRECISION,
    "captionP95Ms" DOUBLE PRECISION,
    "translationP50Ms" DOUBLE PRECISION,
    "translationP95Ms" DOUBLE PRECISION,
    "voiceP50Ms" DOUBLE PRECISION,
    "voiceP95Ms" DOUBLE PRECISION,
    "echoRemovedWords" INTEGER,

    CONSTRAINT "InterpreterSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterpreterSession_room_key" ON "InterpreterSession"("room");

-- CreateIndex
CREATE INDEX "InterpreterSession_userId_startedAt_idx" ON "InterpreterSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "InterpreterSession_startedAt_idx" ON "InterpreterSession"("startedAt");

-- AddForeignKey
ALTER TABLE "InterpreterSession" ADD CONSTRAINT "InterpreterSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
