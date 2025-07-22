#!/usr/bin/env python3
"""
Fix import paths in React components
"""

import os
import re
from pathlib import Path

def fix_imports_in_file(file_path):
    """Fix @/ imports in a single file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Fix different import patterns
        replacements = [
            (r"from '@/utils/cn'", "from '../utils/cn'"),
            (r"from '@/utils/tauriDetection'", "from '../utils/tauriDetection'"),
            (r"from '@/utils/modelHealth'", "from '../utils/modelHealth'"),
            (r"from '@/stores/chatStore'", "from '../stores/chatStore'"),
            (r"from '@/types'", "from '../types'"),
        ]
        
        for pattern, replacement in replacements:
            content = re.sub(pattern, replacement, content)
        
        # Only write if content changed
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ Fixed imports in {file_path}")
            return True
        else:
            print(f"⏭️ No changes needed in {file_path}")
            return False
            
    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}")
        return False

def main():
    """Fix imports in all component files."""
    print("🔧 Fixing import paths in React components...")
    
    components_dir = Path("src/components")
    
    if not components_dir.exists():
        print("❌ Components directory not found!")
        return
    
    fixed_count = 0
    total_count = 0
    
    # Process all .tsx files in components directory
    for file_path in components_dir.glob("*.tsx"):
        total_count += 1
        if fix_imports_in_file(file_path):
            fixed_count += 1
    
    print(f"\n📊 Summary: Fixed {fixed_count}/{total_count} files")
    
    if fixed_count > 0:
        print("✅ Import fixes completed!")
    else:
        print("ℹ️ No files needed fixing.")

if __name__ == "__main__":
    main()
