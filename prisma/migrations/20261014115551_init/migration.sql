-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('draft', 'submitted', 'awaiting_email', 'awaiting_parent', 'in_review', 'approved', 'changes_requested', 'rejected', 'safeguarding_review', 'withdrawn');

-- CreateEnum
CREATE TYPE "Who" AS ENUM ('springpod', 'student', 'early', 'pro');

-- CreateEnum
CREATE TYPE "AgeBand" AS ENUM ('age_14_17', 'age_18_24', 'age_25_plus');

-- CreateEnum
CREATE TYPE "NowStatus" AS ENUM ('school', 'college', 'uni', 'apprentice', 'working', 'other');

-- CreateEnum
CREATE TYPE "StoryMode" AS ENUM ('interview', 'self');

-- CreateEnum
CREATE TYPE "StoryFormat" AS ENUM ('interview', 'write', 'voice', 'video');

-- CreateEnum
CREATE TYPE "DisplayChoice" AS ENUM ('first', 'initial', 'anon');

-- CreateEnum
CREATE TYPE "TrustLabel" AS ENUM ('verified', 'community');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('platform', 'website', 'blog', 'social');

-- CreateEnum
CREATE TYPE "ParentStatus" AS ENUM ('not_needed', 'pending', 'approved', 'approved_anonymous', 'declined');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('voice', 'video');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('uploading', 'uploaded', 'processing', 'ready', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('personal_data', 'named_org', 'named_person', 'safeguarding', 'negative_named_org', 'other');

-- CreateEnum
CREATE TYPE "FlagSource" AS ENUM ('ai', 'team', 'system');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('approved', 'changes_requested', 'rejected');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('linkedin', 'instagram', 'video_hook', 'blog', 'snippet', 'tags', 'quote_card_4x5', 'quote_card_9x16');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('moderator', 'content');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('submitter', 'parent', 'staff', 'system');

-- CreateEnum
CREATE TYPE "TurnRole" AS ENUM ('assistant', 'user');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('confirm_email', 'edit_story', 'parent_decision', 'remove_story');

-- CreateTable
CREATE TABLE "Submitter" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailConfirmedAt" TIMESTAMP(3),
    "springpodUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submitter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "submitterId" TEXT,
    "deviceIdHash" TEXT,
    "status" "StoryStatus" NOT NULL DEFAULT 'draft',
    "who" "Who",
    "ageBand" "AgeBand",
    "firstName" TEXT,
    "displayChoice" "DisplayChoice",
    "expType" TEXT,
    "area" TEXT,
    "organisation" TEXT,
    "nowStatus" "NowStatus",
    "nowRole" TEXT,
    "nowCompany" TEXT,
    "nowIndustry" TEXT,
    "showCompany" BOOLEAN,
    "mode" "StoryMode",
    "format" "StoryFormat",
    "writtenText" TEXT,
    "headline" TEXT,
    "story" TEXT,
    "pullQuote" TEXT,
    "quoteOptions" TEXT[],
    "skills" TEXT[],
    "advice" TEXT,
    "sector" TEXT,
    "previousDraft" JSONB,
    "trustLabel" "TrustLabel" NOT NULL DEFAULT 'community',
    "verifiedManuallyBy" TEXT,
    "promptVersion" TEXT,
    "interviewEndedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "channels" "Channel"[],
    "termsVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "parentEmail" TEXT,
    "parentStatus" "ParentStatus" NOT NULL DEFAULT 'not_needed',
    "parentDecidedAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewTurn" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "role" "TurnRole" NOT NULL,
    "content" TEXT NOT NULL,
    "quickReply" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadId" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "durationS" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "browserChecks" JSONB,
    "serverChecks" JSONB,
    "transcriptRaw" TEXT,
    "transcriptEdited" TEXT,
    "transcriptConfidence" DOUBLE PRECISION,
    "transcriptSegments" JSONB,
    "posterKey" TEXT,
    "normalisedKey" TEXT,
    "waveformKey" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'uploading',
    "current" BOOLEAN NOT NULL DEFAULT true,
    "deleteAfter" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "type" "FlagType" NOT NULL,
    "detail" TEXT NOT NULL,
    "source" "FlagSource" NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "decision" "ReviewDecision",
    "reason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "content" TEXT,
    "storageKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "storyId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "StaffRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "submitterId" TEXT,
    "storyId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedCount" (
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BlockedCount_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "Submitter_email_key" ON "Submitter"("email");

-- CreateIndex
CREATE INDEX "Story_status_submittedAt_idx" ON "Story"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "Story_deviceIdHash_idx" ON "Story"("deviceIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_storyId_key" ON "Consent"("storyId");

-- CreateIndex
CREATE INDEX "InterviewTurn_storyId_createdAt_idx" ON "InterviewTurn"("storyId", "createdAt");

-- CreateIndex
CREATE INDEX "Media_storyId_current_idx" ON "Media"("storyId", "current");

-- CreateIndex
CREATE INDEX "Media_deleteAfter_idx" ON "Media"("deleteAfter");

-- CreateIndex
CREATE INDEX "Flag_storyId_resolvedAt_idx" ON "Flag"("storyId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_storyId_key" ON "Review"("storyId");

-- CreateIndex
CREATE INDEX "Asset_storyId_kind_createdAt_idx" ON "Asset"("storyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_storyId_createdAt_idx" ON "AuditEvent"("storyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Token_tokenHash_key" ON "Token"("tokenHash");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "Submitter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTurn" ADD CONSTRAINT "InterviewTurn_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "Submitter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
