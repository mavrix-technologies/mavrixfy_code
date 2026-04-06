#!/bin/bash

# Mavrixfy v1.2.1 Deployment Script
# This script automates the deployment process

set -e  # Exit on error

echo "🚀 Starting Mavrixfy v1.2.1 Deployment"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Verify we're in the right directory
echo -e "\n${BLUE}Step 1: Verifying directory...${NC}"
if [ ! -f "app.json" ]; then
    echo "❌ Error: app.json not found. Please run this script from Mavrixfy_App directory"
    exit 1
fi
echo -e "${GREEN}✓ Directory verified${NC}"

# Step 2: Check if changes are staged
echo -e "\n${BLUE}Step 2: Checking git status...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠ Uncommitted changes detected${NC}"
    read -p "Do you want to commit changes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "Release v1.2.1: Performance improvements and optimizations"
        echo -e "${GREEN}✓ Changes committed${NC}"
    fi
else
    echo -e "${GREEN}✓ No uncommitted changes${NC}"
fi

# Step 3: Push to repository
echo -e "\n${BLUE}Step 3: Pushing to repository...${NC}"
read -p "Push to remote repository? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin main
    echo -e "${GREEN}✓ Pushed to repository${NC}"
else
    echo -e "${YELLOW}⚠ Skipped push${NC}"
fi

# Step 4: Build with EAS
echo -e "\n${BLUE}Step 4: Building APK with EAS...${NC}"
read -p "Start EAS build? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Building production APK (armeabi-v7a)..."
    eas build --platform android --profile production-armeabi-v7a
    echo -e "${GREEN}✓ Build started${NC}"
else
    echo -e "${YELLOW}⚠ Skipped EAS build${NC}"
fi

# Step 5: Publish OTA Update
echo -e "\n${BLUE}Step 5: Publishing OTA update...${NC}"
read -p "Publish OTA update? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    eas update --branch production --message "v1.2.1: Performance improvements and bug fixes"
    echo -e "${GREEN}✓ OTA update published${NC}"
else
    echo -e "${YELLOW}⚠ Skipped OTA update${NC}"
fi

# Step 6: Deploy backend
echo -e "\n${BLUE}Step 6: Deploying backend...${NC}"
read -p "Deploy backend to Vercel? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd ../Mavrixfy-web/backend
    git add app-version.json src/controllers/app.controller.js
    git commit -m "Update version to 1.2.1" || echo "No changes to commit"
    git push origin main
    echo -e "${GREEN}✓ Backend deployed (Vercel will auto-deploy)${NC}"
    cd ../../Mavrixfy_App
else
    echo -e "${YELLOW}⚠ Skipped backend deployment${NC}"
fi

# Summary
echo -e "\n${GREEN}======================================"
echo "✅ Deployment Process Complete!"
echo "======================================${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor EAS build progress: https://expo.dev"
echo "2. Check Vercel deployment: https://vercel.com"
echo "3. Test version endpoint: curl https://spotify-api-drab.vercel.app/api/app-message"
echo "4. Verify update notification in app"
echo ""
echo "📝 Documentation:"
echo "- Release Notes: RELEASE_NOTES_v1.2.1.md"
echo "- Deployment Guide: DEPLOYMENT_GUIDE_v1.2.1.md"
echo "- Update Summary: UPDATE_SUMMARY_v1.2.1.md"
echo ""
echo "🎉 Version 1.2.1 is ready!"
