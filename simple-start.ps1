# Simple Privacy AI Assistant Startup Script

Write-Host "🚀 Privacy AI Assistant - Quick Start" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

# Check if Ollama is running
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

# Test if Ollama is available
try {
    $null = ollama --version
    Write-Host "   ✅ Ollama found" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Ollama not found. Please install from https://ollama.ai" -ForegroundColor Red
    exit 1
}

# Test Ollama service
Write-Host "🤖 Setting up Ollama..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 5
    Write-Host "   ✅ Ollama service is running" -ForegroundColor Green
} catch {
    Write-Host "   🔄 Starting Ollama service..." -ForegroundColor Yellow
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 5
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 5
        Write-Host "   ✅ Ollama service started" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Failed to start Ollama. Please run 'ollama serve' manually" -ForegroundColor Red
        exit 1
    }
}

# Check for gemma3n model
Write-Host "   🔍 Checking for gemma3n model..." -ForegroundColor Yellow
$models = & ollama list
if ($models -match "gemma3n") {
    Write-Host "   ✅ gemma3n model found" -ForegroundColor Green
} else {
    Write-Host "   📥 Pulling gemma3n:latest model..." -ForegroundColor Yellow
    Write-Host "   ⚠️  This may take several minutes..." -ForegroundColor Cyan
    & ollama pull gemma3n:latest
    Write-Host "   ✅ Model downloaded" -ForegroundColor Green
}

# Install dependencies if needed
Write-Host "📦 Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "   📥 Installing dependencies..." -ForegroundColor Yellow
    npm install
    Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "   ✅ Dependencies already installed" -ForegroundColor Green
}

# Kill existing processes on port 5174
Write-Host "🧹 Cleaning up existing processes..." -ForegroundColor Yellow
$processes = netstat -ano | Select-String ":5174" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
foreach ($pid in $processes) {
    if ($pid -match '^\d+$' -and $pid -ne "0") {
        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "   ✅ Stopped process $pid" -ForegroundColor Green
        } catch {
            # Ignore cleanup errors
        }
    }
}

# Validate fixes
Write-Host "🔧 Validating fixes..." -ForegroundColor Yellow
try {
    $output = node test-fixed-app.js
    if ($output -match "Fix validation completed") {
        Write-Host "   ✅ All fixes validated" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Some validation issues found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Could not run validation" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🚀 Starting application..." -ForegroundColor Green
Write-Host "🧪 Test with: 'Hello, how are you?'" -ForegroundColor Cyan
Write-Host "📝 Watch for token-by-token streaming response" -ForegroundColor Cyan
Write-Host ""

# Start the app
npm run dev
