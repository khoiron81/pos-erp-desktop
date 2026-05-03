#!/bin/bash
# ============================================
# POS ERP UMKM - Desktop App Build Script
# Builds Next.js static export + Electron package
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$DESKTOP_DIR/../frontend"

echo "╔══════════════════════════════════════════════════╗"
echo "║   POS ERP UMKM - Desktop Build                  ║"
echo "║   PT. Aktech Digital Solutions                   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Step 1: Build Next.js static export
echo "📦 Step 1: Building Next.js static export..."
cd "$FRONTEND_DIR"
NEXT_PUBLIC_DESKTOP=true npx next build
echo "✅ Static export created at: $FRONTEND_DIR/out/"

# Step 2: Copy renderer files
echo ""
echo "📋 Step 2: Copying renderer files..."
cd "$DESKTOP_DIR"
rm -rf renderer/*
mkdir -p renderer
cp -r "$FRONTEND_DIR/out/"* renderer/
echo "✅ Renderer files copied to: $DESKTOP_DIR/renderer/"

# Step 3: Install desktop dependencies
echo ""
echo "📦 Step 3: Installing desktop dependencies..."
cd "$DESKTOP_DIR"
npm install
echo "✅ Dependencies installed"

# Step 3b: Download jsbarcode for offline label printing
echo ""
echo "📥 Step 3b: Downloading jsbarcode for offline use..."
JSBARCODE_URL="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"
JSBARCODE_DEST="$DESKTOP_DIR/renderer/jsbarcode.min.js"
if [ ! -f "$JSBARCODE_DEST" ]; then
    curl -fsSL "$JSBARCODE_URL" -o "$JSBARCODE_DEST" \
        && echo "✅ jsbarcode downloaded" \
        || echo "⚠️  jsbarcode download failed — CDN fallback will be used"
else
    echo "✅ jsbarcode already present"
fi

# Step 4: Compile TypeScript
echo ""
echo "🔨 Step 4: Compiling Electron main process..."
npx tsc -p tsconfig.json
echo "✅ TypeScript compiled to: dist/"

# Step 5: Package (directory output for testing)
echo ""
echo "📦 Step 5: Packaging Electron app..."
if [ "$1" = "--dist" ]; then
    npx electron-builder --win
    echo "✅ Windows installer created in: release/"
else
    npx electron-builder --dir
    echo "✅ Unpacked app created in: release/"
    echo "💡 Use './scripts/build.sh --dist' to create installer"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅ Build Complete!                             ║"
echo "╚══════════════════════════════════════════════════╝"
