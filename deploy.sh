#!/bin/bash

# Deployment script for Electrolux AC Controller
# Deploy to tiny.qfdk.dev:/home/qfdk/deploy/electrolux

echo "🚀 Starting deployment to tiny.qfdk.dev..."

# Server details
SERVER="tiny.qfdk.dev"
DEPLOY_PATH="/home/qfdk/deploy/electrolux"
USERNAME="qfdk"

# Files and directories to deploy
FILES_TO_DEPLOY=(
    "server.js"
    "package.json"
    "pnpm-lock.yaml"
    "ecosystem.config.js"
    "lib/"
    "public/"
    ".env.example"
    "README.md"
)

# Create deployment directory on server if it doesn't exist
echo "📁 Creating deployment directory..."
ssh ${USERNAME}@${SERVER} "mkdir -p ${DEPLOY_PATH}"

# Copy files to server
echo "📤 Copying files to server..."
for file in "${FILES_TO_DEPLOY[@]}"; do
    echo "   - Copying $file..."
    scp -r "$file" ${USERNAME}@${SERVER}:${DEPLOY_PATH}/
done

# Copy .env file if it exists locally (but don't overwrite if exists on server)
if [ -f ".env" ]; then
    echo "📋 Checking .env file on server..."
    ssh ${USERNAME}@${SERVER} "test -f ${DEPLOY_PATH}/.env"
    if [ $? -ne 0 ]; then
        echo "   - Copying .env file..."
        scp .env ${USERNAME}@${SERVER}:${DEPLOY_PATH}/
    else
        echo "   - .env file already exists on server, skipping..."
    fi
fi

# Install dependencies and restart service on server
echo "🔧 Installing dependencies and starting service..."
ssh ${USERNAME}@${SERVER} << 'ENDSSH'
cd /home/qfdk/deploy/electrolux

# Install dependencies
echo "📦 Installing dependencies..."
if command -v pnpm &> /dev/null; then
    pnpm install --production
elif command -v npm &> /dev/null; then
    npm install --production
else
    echo "❌ Neither pnpm nor npm found!"
    exit 1
fi

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "🔄 Restarting application with PM2..."
    pm2 stop electrolux-ac 2>/dev/null || true
    pm2 delete electrolux-ac 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
else
    echo "⚠️  PM2 not found. Starting with node..."
    # Kill existing node process if any
    pkill -f "node server.js" 2>/dev/null || true
    # Start in background with nohup
    nohup node server.js > app.log 2>&1 &
    echo "✅ Application started with nohup"
fi

echo "✅ Deployment complete!"
ENDSSH

echo "🎉 Deployment to tiny.qfdk.dev completed successfully!"
echo "🌐 Application should be available at: http://tiny.qfdk.dev:3000"
echo ""
echo "📝 To check the application status:"
echo "   ssh ${USERNAME}@${SERVER} 'cd ${DEPLOY_PATH} && pm2 status'"
echo ""
echo "📋 To view logs:"
echo "   ssh ${USERNAME}@${SERVER} 'cd ${DEPLOY_PATH} && pm2 logs electrolux-ac'"