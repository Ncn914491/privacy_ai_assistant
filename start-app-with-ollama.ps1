# Privacy AI Assistant - Complete Setup and Launch Script
# This script sets up Ollama with gemma3n:latest and starts the application

Write-Host "🚀 Privacy AI Assistant - Complete Setup" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

# Function to check if a command exists
function Test-Command($command) {
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Function to check if a port is in use
function Test-Port($port) {
    $connections = netstat -ano | Select-String ":$port "
    return $connections.Count -gt 0
}

# Step 1: Check Prerequisites
Write-Host "📋 Step 1: Checking Prerequisites" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

# Check Node.js
if (Test-Command "node") {
    $nodeVersion = node --version
    Write-Host "   ✅ Node.js found: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "   ❌ Node.js not found. Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check npm
if (Test-Command "npm") {
    $npmVersion = npm --version
    Write-Host "   ✅ npm found: v$npmVersion" -ForegroundColor Green
} else {
    Write-Host "   ❌ npm not found. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check Ollama
if (Test-Command "ollama") {
    Write-Host "   ✅ Ollama found" -ForegroundColor Green
} else {
    Write-Host "   ❌ Ollama not found. Installing Ollama..." -ForegroundColor Yellow
    Write-Host "   📥 Please download and install Ollama from: https://ollama.ai/download" -ForegroundColor Cyan
    Write-Host "   ⏳ Waiting for manual installation... Press any key when Ollama is installed" -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    if (-not (Test-Command "ollama")) {
        Write-Host "   ❌ Ollama still not found. Please install it manually and restart the script." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Step 2: Setup Ollama
Write-Host "🤖 Step 2: Setting up Ollama with gemma3n:latest" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Yellow

# Check if Ollama service is running
if (Test-Port 11434) {
    Write-Host "   ✅ Ollama service is already running on port 11434" -ForegroundColor Green
} else {
    Write-Host "   🔄 Starting Ollama service..." -ForegroundColor Yellow
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    
    if (Test-Port 11434) {
        Write-Host "   ✅ Ollama service started successfully" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Failed to start Ollama service" -ForegroundColor Red
        exit 1
    }
}

# Check if gemma3n:latest model is available
Write-Host "   🔍 Checking for gemma3n:latest model..." -ForegroundColor Yellow
try {
    $models = ollama list 2>&1
    if ($models -match "gemma3n") {
        Write-Host "   ✅ gemma3n:latest model found" -ForegroundColor Green
    } else {
        Write-Host "   📥 Downloading gemma3n:latest model..." -ForegroundColor Yellow
        Write-Host "   ⚠️  This may take several minutes depending on your internet connection" -ForegroundColor Cyan
        ollama pull gemma3n:latest
        Write-Host "   ✅ gemma3n:latest model downloaded successfully" -ForegroundColor Green
    }
}
catch {
    Write-Host "   ❌ Error checking/downloading model: $_" -ForegroundColor Red
    exit 1
}

# Test Ollama API
Write-Host "   🧪 Testing Ollama API..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ Ollama API is responding correctly" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Ollama API returned status code: $($response.StatusCode)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Failed to connect to Ollama API: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Install Dependencies
Write-Host "📦 Step 3: Installing Application Dependencies" -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Yellow

if (Test-Path "node_modules") {
    Write-Host "   ✅ Dependencies already installed" -ForegroundColor Green
} else {
    Write-Host "   📥 Installing dependencies..." -ForegroundColor Yellow
    npm install
    Write-Host "   ✅ Dependencies installed successfully" -ForegroundColor Green
}

Write-Host ""

# Step 4: Kill any existing processes on port 5174
Write-Host "🧹 Step 4: Cleanup Existing Processes" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow

if (Test-Port 5174) {
    Write-Host "   ⚠️  Port 5174 is in use, terminating existing processes..." -ForegroundColor Yellow
    $processes = netstat -ano | Select-String ":5174" | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique
    
    foreach ($pid in $processes) {
        if ($pid -ne "0" -and $pid -match '^\d+$') {
            try {
                taskkill /PID $pid /F 2>$null
                Write-Host "   ✅ Terminated process PID: $pid" -ForegroundColor Green
            } catch {
                Write-Host "   ⚠️  Could not terminate PID: $pid" -ForegroundColor Yellow
            }
        }
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "   ✅ Port 5174 is available" -ForegroundColor Green
}

Write-Host ""

# Step 5: Validate Fixes
Write-Host "🔧 Step 5: Validating Applied Fixes" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow

try {
    node test-fixed-app.js | ForEach-Object {
        if ($_ -match "✅") {
            Write-Host "   $_" -ForegroundColor Green
        } elseif ($_ -match "❌") {
            Write-Host "   $_" -ForegroundColor Red
        } elseif ($_ -match "🔧|📋") {
            Write-Host "   $_" -ForegroundColor Yellow
        } else {
            Write-Host "   $_" -ForegroundColor White
        }
    }
} catch {
    Write-Host "   ⚠️  Could not run validation script" -ForegroundColor Yellow
}

Write-Host ""

# Step 6: Start the Application
Write-Host "🚀 Step 6: Starting Privacy AI Assistant" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

Write-Host "   🎯 Starting development server..." -ForegroundColor Cyan
Write-Host "   📝 The application will open in a new window" -ForegroundColor Cyan
Write-Host "   🧪 To test: Send 'Hello, how are you?' and watch for streaming response" -ForegroundColor Cyan
Write-Host ""
Write-Host "   ⚠️  Known Issues and Solutions:" -ForegroundColor Yellow
Write-Host "   • If no response appears: Check that Ollama is running with gemma3n:latest" -ForegroundColor Yellow
Write-Host "   • If streaming is choppy: This is normal for the gemma3n model" -ForegroundColor Yellow
Write-Host "   • If app won't start: Check that port 5174 is free" -ForegroundColor Yellow
Write-Host ""

# Launch the application
Write-Host "   🚀 Launching application..." -ForegroundColor Green
npm run dev
