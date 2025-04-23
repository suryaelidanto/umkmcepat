-- CreateTable
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "namaUsaha" VARCHAR(100) NOT NULL,
    "kategori" VARCHAR(50) NOT NULL,
    "aiContent" JSONB,
    "harga" TEXT,
    "whatsapp" TEXT,
    "images" TEXT[],
    "imagePublicIds" TEXT[],
    "userId" TEXT,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "tweaksLeft" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "testimonials" JSONB,
    "address" VARCHAR(255),
    "socialLinks" JSONB,
    "colorTheme" JSONB,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "providerAccountId" VARCHAR(100) NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" VARCHAR(50),
    "scope" VARCHAR(100),
    "id_token" TEXT,
    "session_state" VARCHAR(100),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100),
    "email" VARCHAR(100),
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" VARCHAR(100) NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_slug_key" ON "LandingPage"("slug");

-- CreateIndex
CREATE INDEX "LandingPage_userId_idx" ON "LandingPage"("userId");

-- CreateIndex
CREATE INDEX "LandingPage_slug_idx" ON "LandingPage"("slug");

-- CreateIndex
CREATE INDEX "LandingPage_namaUsaha_idx" ON "LandingPage"("namaUsaha");

-- CreateIndex
CREATE INDEX "LandingPage_kategori_idx" ON "LandingPage"("kategori");

-- CreateIndex
CREATE INDEX "LandingPage_createdAt_idx" ON "LandingPage"("createdAt");

-- CreateIndex
CREATE INDEX "LandingPage_updatedAt_idx" ON "LandingPage"("updatedAt");

-- CreateIndex
CREATE INDEX "LandingPage_isClaimed_idx" ON "LandingPage"("isClaimed");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_provider_idx" ON "Account"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expires_idx" ON "Session"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "VerificationToken_expires_idx" ON "VerificationToken"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
