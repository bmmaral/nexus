# Project Nexus - Lightweight PRD

**Version:** 1.0-minimal  
**Target:** Personal use, 1 week to production  
**Philosophy:** Dead simple, Git-native, zero overhead  

---

## 📌 Core Problem

Kullanıyorum: 15+ proje, 4+ AI platform, her projede PRD.md var ama:
- Hangi projede nerede kaldım hatırlamıyorum
- AI konuşmaları dağınık (ChatGPT, Claude, Gemini)
- Background AI'lar (Cursor) kod yazıyor, ne yazdığını bilmiyorum
- PRD ile kod uyuşmuyor
- Aynı modülleri tekrar tekrar yazıyorum

**Çözüm:** Git repo'lara basit bir klasör yapısı + minimal CLI tool + 2-3 GitHub Action.

---

## 🎯 Scope (1 Hafta)

#### **İhtiyacım Olan Tek Şey:**
1. **Her repo'da standart klasör yapısı** (`/conversations/`, `/reports/`)
2. **Basit CLI tool** (Python, 5-6 komut)
3. **2 GitHub Action** (reminder + analyzer)
4. **1 pre-commit hook** (PRD özeti)

#### **İhtiyacım Olmayan:**
- Mobile app
- Web dashboard  
- Database
- API server
- User management
- Fancy UI
- Complex analytics

---

## 🛠 Technical Design

### Dosya Yapısı

```bash
/project-name/
├── PRD.md                          # Ana PRD dosyası
├── /conversations/
│   ├── 2025-10-27-chatgpt.json    # AI konuşmaları
│   └── index.md                    # Otomatik timeline
├── /reports/
│   └── drift.md                    # Code-PRD farkları
└── .nexus/
    └── config.yml                  # Local config
```

### CLI Tool (Python, ~500 satır)

```python
#!/usr/bin/env python3
"""nexus - Dead simple project memory tool"""

import os
import json
import git
import click
from datetime import datetime, timedelta
from pathlib import Path
import subprocess
import re

class Nexus:
    def __init__(self):
        self.repo = git.Repo('.')
        self.root = Path('.')
        
    def init(self):
        """Initialize nexus in current repo"""
        # Create folders
        (self.root / 'conversations').mkdir(exist_ok=True)
        (self.root / 'reports').mkdir(exist_ok=True)
        (self.root / '.nexus').mkdir(exist_ok=True)
        
        # Create default config
        config = {
            'reminder_days': 5,
            'ai_platforms': ['chatgpt', 'claude', 'gemini'],
            'auto_commit': True
        }
        
        with open('.nexus/config.yml', 'w') as f:
            yaml.dump(config, f)
        
        # Add pre-commit hook
        hook_path = '.git/hooks/pre-commit'
        hook_content = '''#!/bin/bash
# Auto-summarize PRD changes
if git diff --cached --name-only | grep -q "PRD.md"; then
    nexus prd-summary >> .git/COMMIT_EDITMSG
fi
'''
        with open(hook_path, 'w') as f:
            f.write(hook_content)
        os.chmod(hook_path, 0o755)
        
        print("✅ Nexus initialized!")
        
    def import_conversation(self, file_path, platform=None):
        """Import AI conversation"""
        # Auto-detect platform from filename
        if not platform:
            if 'chatgpt' in file_path.lower():
                platform = 'chatgpt'
            elif 'claude' in file_path.lower():
                platform = 'claude'
            else:
                platform = 'unknown'
        
        # Copy to conversations folder
        date_str = datetime.now().strftime('%Y-%m-%d')
        dest_file = f"conversations/{date_str}-{platform}.json"
        
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        # Extract key decisions (simple pattern matching)
        decisions = []
        for msg in data.get('messages', []):
            content = msg.get('content', '')
            if any(word in content.lower() for word in ['decided', 'will use', 'let\'s go with']):
                decisions.append(content[:100])
        
        # Save file
        with open(dest_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        # Auto-commit
        self.repo.index.add([dest_file])
        self.repo.index.commit(f"conv: Import {platform} ({len(decisions)} decisions)")
        
        print(f"✅ Imported {platform} conversation")
        print(f"📌 Found {len(decisions)} decisions")
        
        # Update timeline
        self.update_timeline()
        
    def analyze(self):
        """Analyze code-PRD drift"""
        report = []
        report.append("# Code-PRD Drift Report\n")
        report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")
        
        # Parse PRD for expected features
        prd_content = open('PRD.md').read() if os.path.exists('PRD.md') else ''
        
        # Find API endpoints in PRD
        prd_endpoints = re.findall(r'(/api/\S+)', prd_content)
        
        # Find actual endpoints in code
        code_endpoints = []
        for file in Path('.').rglob('*.js'):
            content = open(file).read()
            code_endpoints.extend(re.findall(r'app\.(get|post|put|delete)\([\'"](\S+)[\'"]', content))
        
        # Compare
        undocumented = [e for e in code_endpoints if e[1] not in prd_endpoints]
        
        if undocumented:
            report.append("## 🔴 Undocumented Endpoints\n\n")
            for method, endpoint in undocumented:
                report.append(f"- `{method.upper()} {endpoint}`\n")
        
        # Check for Cursor/AI commits
        recent_commits = list(self.repo.iter_commits('HEAD', max_count=20))
        ai_commits = [c for c in recent_commits if any(ai in c.message.lower() 
                      for ai in ['cursor', 'copilot', 'ai'])]
        
        if ai_commits:
            report.append("\n## 🤖 Recent AI Changes\n\n")
            for commit in ai_commits[:5]:
                report.append(f"- {commit.hexsha[:7]}: {commit.message.split('\\n')[0]}\n")
        
        # Save report
        report_text = ''.join(report)
        with open('reports/drift.md', 'w') as f:
            f.write(report_text)
        
        # Show summary
        issue_count = len(undocumented) + len(ai_commits)
        print(f"🔍 Analysis complete: {issue_count} issues found")
        
        if issue_count > 0:
            self.repo.index.add(['reports/drift.md'])
            self.repo.index.commit(f"analyze: {issue_count} drift issues detected")
            
    def status(self):
        """Show project status"""
        # Last commit
        last_commit = self.repo.head.commit
        days_ago = (datetime.now() - datetime.fromtimestamp(last_commit.committed_date)).days
        
        # Count conversations
        conv_count = len(list(Path('conversations').glob('*.json'))) if Path('conversations').exists() else 0
        
        # Check drift report
        drift_exists = Path('reports/drift.md').exists()
        
        print(f"""
📊 Project Status
─────────────────
Last Activity: {days_ago} days ago
Last Commit: {last_commit.message.split(chr(10))[0]}
Conversations: {conv_count}
Drift Report: {'✅ Available' if drift_exists else '❌ Not generated'}

{'⚠️  Project inactive for ' + str(days_ago) + ' days!' if days_ago >= 5 else '✅ Project is active'}
""")
        
    def update_timeline(self):
        """Generate conversation timeline"""
        timeline = ["# Conversation Timeline\n\n"]
        
        events = []
        
        # Collect conversations
        if Path('conversations').exists():
            for conv_file in Path('conversations').glob('*.json'):
                date = conv_file.stem.split('-')[0:3]
                platform = conv_file.stem.split('-')[-1]
                events.append({
                    'date': '-'.join(date),
                    'type': 'conversation',
                    'platform': platform,
                    'file': str(conv_file)
                })
        
        # Add recent commits
        for commit in list(self.repo.iter_commits('HEAD', max_count=10)):
            events.append({
                'date': datetime.fromtimestamp(commit.committed_date).strftime('%Y-%m-%d'),
                'type': 'commit',
                'message': commit.message.split('\n')[0],
                'sha': commit.hexsha[:7]
            })
        
        # Sort by date
        events.sort(key=lambda x: x['date'], reverse=True)
        
        # Group by date
        current_date = None
        for event in events:
            if event['date'] != current_date:
                timeline.append(f"\n### {event['date']}\n\n")
                current_date = event['date']
            
            if event['type'] == 'conversation':
                timeline.append(f"- 💬 **{event['platform']}** conversation imported\n")
            elif event['type'] == 'commit':
                timeline.append(f"- 📝 [{event['sha']}] {event['message']}\n")
        
        # Save timeline
        with open('conversations/index.md', 'w') as f:
            f.write(''.join(timeline))
            
    def prd_summary(self):
        """Generate PRD change summary for commit"""
        diff = self.repo.index.diff('HEAD', paths=['PRD.md'])
        
        if not diff:
            return ""
        
        # Simple summary based on changed sections
        changed_sections = []
        for d in diff:
            # Parse diff for section headers
            if d.a_path == 'PRD.md':
                # This is simplified - in reality would parse the diff properly
                changed_sections.append("PRD updated")
        
        return f"docs: {', '.join(changed_sections)}"
        
    def check_inactive(self):
        """Check all repos for inactivity"""
        # This would be called by GitHub Action
        last_commit = self.repo.head.commit
        days_inactive = (datetime.now() - datetime.fromtimestamp(last_commit.committed_date)).days
        
        if days_inactive >= 5:
            # Extract next steps from PRD
            next_steps = "No next steps defined"
            if Path('PRD.md').exists():
                content = open('PRD.md').read()
                match = re.search(r'## Next Steps(.*?)##', content, re.DOTALL)
                if match:
                    next_steps = match.group(1).strip()[:500]
            
            # Return JSON for GitHub Action to create issue
            result = {
                'inactive': True,
                'days': days_inactive,
                'next_steps': next_steps,
                'last_commit': str(last_commit.message)
            }
            
            print(json.dumps(result))
            return result
        
        return {'inactive': False}

@click.group()
def cli():
    """Nexus - Project memory tool"""
    pass

@cli.command()
def init():
    """Initialize nexus in current repo"""
    Nexus().init()

@cli.command()
@click.argument('file')
@click.option('--platform', help='Platform (chatgpt/claude/gemini)')
def import_conv(file, platform):
    """Import conversation file"""
    Nexus().import_conversation(file, platform)

@cli.command()
def analyze():
    """Analyze code-PRD drift"""
    Nexus().analyze()

@cli.command()
def status():
    """Show project status"""
    Nexus().status()

@cli.command()
def timeline():
    """Update conversation timeline"""
    Nexus().update_timeline()
    print("✅ Timeline updated: conversations/index.md")

@cli.command()
def check():
    """Check for inactive projects (for GitHub Action)"""
    Nexus().check_inactive()

if __name__ == '__main__':
    cli()
```

### GitHub Actions (2 dosya)

#### `.github/workflows/reminder.yml`
```yaml
name: Inactivity Check
on:
  schedule:
    - cron: '0 9 * * *'  # Her gün sabah 9
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
          
      - name: Check inactivity
        id: check
        run: |
          DAYS=$(git log -1 --format="%cr" | grep -o '[0-9]\+' | head -1)
          if [ "$DAYS" -ge "5" ]; then
            echo "CREATE_ISSUE=true" >> $GITHUB_OUTPUT
            echo "DAYS=$DAYS" >> $GITHUB_OUTPUT
            
            # Get next steps from PRD
            if [ -f "PRD.md" ]; then
              NEXT=$(grep -A5 "## Next Steps" PRD.md | tail -n +2 | head -5)
              echo "NEXT_STEPS<<EOF" >> $GITHUB_OUTPUT
              echo "$NEXT" >> $GITHUB_OUTPUT
              echo "EOF" >> $GITHUB_OUTPUT
            fi
          fi
      
      - name: Create issue
        if: steps.check.outputs.CREATE_ISSUE == 'true'
        uses: actions/github-script@v6
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `⏰ Inactive for ${steps.check.outputs.DAYS} days`,
              body: `## Next Steps\n${steps.check.outputs.NEXT_STEPS || 'Check PRD.md'}`,
              labels: ['reminder']
            })
```

#### `.github/workflows/analyze.yml`
```yaml
name: Analyze Drift
on:
  push:
    paths:
      - '**.js'
      - '**.py'
      - 'PRD.md'
  workflow_dispatch:

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install nexus
        run: |
          pip install click gitpython pyyaml
          echo "#!/usr/bin/env python3" > /usr/local/bin/nexus
          cat nexus.py >> /usr/local/bin/nexus
          chmod +x /usr/local/bin/nexus
      
      - name: Run analysis
        run: nexus analyze
      
      - name: Commit report
        run: |
          if [ -n "$(git status --porcelain reports/)" ]; then
            git config user.name "Nexus Bot"
            git config user.email "nexus@local"
            git add reports/
            git commit -m "auto: Drift analysis report"
            git push
          fi
```

---

## 🚀 Implementation Plan (7 Gün)

### Gün 1-2: Core CLI
```bash
# Python script yaz
- nexus init
- nexus import-conv
- nexus status
- Basic git operations
```

### Gün 3: Analysis
```bash
# Drift detection ekle
- PRD parsing
- Code endpoint detection  
- AI commit detection
- Report generation
```

### Gün 4: Git Hooks
```bash
# Pre-commit hook
- PRD change detection
- Auto summary
- Commit message enhancement
```

### Gün 5: GitHub Actions
```bash
# Workflows
- reminder.yml
- analyze.yml
- Test on real repos
```

### Gün 6: Polish & Test
```bash
# Real usage
- 5-10 repo'da test
- Bug fixes
- Performance tuning
```

### Gün 7: Deploy
```bash
# Production
- pip package (optional)
- All repos initialize
- Documentation
```

---

## 📦 Installation & Usage

### Quick Start
```bash
# 1. Copy nexus.py to PATH
curl -o /usr/local/bin/nexus https://raw.../nexus.py
chmod +x /usr/local/bin/nexus

# 2. Initialize in any repo
cd my-project
nexus init

# 3. Import conversation
nexus import-conv ~/Downloads/chatgpt-export.json

# 4. Check status
nexus status

# 5. Analyze drift
nexus analyze
```

### Daily Workflow
```bash
# Morning: Check all projects
for dir in ~/projects/*; do
  cd $dir
  nexus status
done

# After AI conversation
nexus import-conv chat.json

# After coding session  
nexus analyze

# View timeline
cat conversations/index.md
```

---

## 🔧 Configuration

### `.nexus/config.yml`
```yaml
# Minimal config
reminder_days: 5
auto_commit: true
analyze_on_push: true

# Optional
ignore_patterns:
  - node_modules
  - .env
  - build/
```

### Per-Repo Customization
```bash
# Different reminder threshold
echo "reminder_days: 3" >> .nexus/config.yml

# Disable auto-commit
echo "auto_commit: false" >> .nexus/config.yml
```

---

## 🎯 Success Criteria

**Hafta 1 Sonunda:**
- ✅ 10+ repo'da çalışıyor
- ✅ Günlük kullanımda
- ✅ Hiçbir proje unutulmuyor
- ✅ AI konuşmaları track ediliyor
- ✅ Drift tespit ediliyor

**Gerekmeyen:**
- ❌ Fancy UI
- ❌ Complex architecture
- ❌ Multiple users
- ❌ Cloud deployment
- ❌ Database

---

## 💡 Key Decisions

#### **Neden Python?**
- Hızlı yazılır (1-2 gün)
- Git/file operations kolay
- No build step
- Single file deployment

#### **Neden sadece 2 GitHub Action?**
- Reminder: Unutmamak için
- Analyzer: Drift detection için
- Başka bir şeye gerek yok

#### **Neden database yok?**
- Git zaten database
- JSON/Markdown yeterli
- Zero maintenance

#### **Neden mobile app yok?**
- GitHub mobile app var
- Markdown dosyaları okunabilir
- Gereksiz complexity

---

## 📝 Example PRD.md Format

```markdown
# Project Name

## Overview
Quick description

## Next Steps
- [ ] Implement auth
- [ ] Add API endpoints  
- [ ] Deploy to production

## API Endpoints
- GET /api/users
- POST /api/auth/login
- GET /api/posts

## Modules
- Authentication
- Database
- API Gateway

## Decisions
- Using PostgreSQL (2024-10-27)
- JWT for auth (2024-10-28)
```

---

## 🏁 Final Checklist

### Must Have (Day 1-5)
- [x] CLI tool (Python)
- [x] Git integration
- [x] Conversation import
- [x] Drift analysis
- [x] GitHub Actions

### Nice to Have (Day 6-7)
- [ ] Better diff parsing
- [ ] Module detection
- [ ] Cross-repo search
- [ ] Summary generation

### Won't Have
- [ ] Web UI
- [ ] Mobile app
- [ ] User accounts
- [ ] Analytics
- [ ] Payments

---

## 🚀 Go Live

```bash
# Final deployment
git clone nexus-tool
cd nexus-tool
pip install -r requirements.txt
cp nexus.py /usr/local/bin/nexus

# Initialize all projects
for dir in ~/projects/*; do
  cd $dir
  nexus init
  nexus analyze
done

# Done! 🎉
```

---

**That's it!** Hafif, basit, çalışan bir sistem. No bullshit, just Git + Python + 2 GitHub Actions.

**Time to ship:** 7 days max  
**Maintenance:** ~0 hours/week  
**Value:** Priceless (hiçbir proje unutulmayacak)