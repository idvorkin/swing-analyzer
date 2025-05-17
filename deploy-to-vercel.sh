#!/bin/bash

# Swing Analyzer - Vercel Deployment Script
# This script helps you deploy the Swing Analyzer to Vercel

echo "🚀 Preparing to deploy Swing Analyzer to Vercel..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if user is logged in to Vercel
vercel whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "🔑 Please log in to Vercel:"
    vercel login
fi

# Run a build test to make sure everything works
echo "🔧 Testing build process..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the errors before deploying."
    exit 1
fi

echo "✅ Build successful!"

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

if [ $? -eq 0 ]; then
    echo "🎉 Deployment successful! Your Swing Analyzer is now live on Vercel."
    echo "📝 See VERCEL_DEPLOY.md for more information about managing your deployment."
else
    echo "❌ Deployment failed. Please check the errors above."
fi 