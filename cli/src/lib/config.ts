import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import os from 'os';

export interface NexusConfigData {
  version: string;
  initialized: string;
  automation: {
    conversationImport: {
      enabled: boolean;
      watchFolders: string[];
      patterns: string[];
      autoCommit: boolean;
      autoPush: boolean;
    };
    prdAnalysis: {
      enabled: boolean;
      triggers: string[];
      generateSummary: boolean;
      updateCommitMessage: boolean;
    };
    codeSync: {
      enabled: boolean;
      scanFrequency: string;
      reportThreshold: string;
      autoCreateIssue: boolean;
    };
    reminders: {
      enabled: boolean;
      inactivityDays: number;
      reminderChannels: string[];
      escalation: {
        [key: string]: string;
      };
    };
    moduleReuse: {
      enabled: boolean;
      scanRepos: string[];
      minSimilarity: number;
      autoSuggest: boolean;
    };
  };
  ai: {
    provider: string;
    model: string;
    apiKey?: string;
    temperature: number;
    maxTokens: number;
    useLocal: boolean;
  };
  git: {
    hooks: {
      preCommit: boolean;
      postCommit: boolean;
      prePush: boolean;
    };
    author: {
      name: string;
      email: string;
    };
  };
  mobile: {
    notificationsEnabled: boolean;
    syncInterval: number;
  };
  preferences: {
    colorTheme: string;
    verboseOutput: boolean;
    confirmActions: boolean;
    telemetry: boolean;
  };
}

export class NexusConfig {
  private configPath: string;
  private globalConfigPath: string;
  private config: NexusConfigData;

  constructor(projectPath: string = process.cwd()) {
    this.configPath = path.join(projectPath, '.nexus', 'config.yml');
    this.globalConfigPath = path.join(os.homedir(), '.nexus', 'global-config.yml');
    this.config = this.getDefaultConfig();
  }

  private getDefaultConfig(): NexusConfigData {
    return {
      version: '1.0.0',
      initialized: new Date().toISOString(),
      automation: {
        conversationImport: {
          enabled: true,
          watchFolders: [
            path.join(os.homedir(), 'Downloads'),
            path.join(os.homedir(), 'Documents', 'AI-Conversations')
          ],
          patterns: [
            'chatgpt-*.json',
            'claude-export-*.json',
            'conversation-*.md',
            'gemini-*.json'
          ],
          autoCommit: true,
          autoPush: false
        },
        prdAnalysis: {
          enabled: true,
          triggers: ['on_prd_change', 'on_push', 'daily_at:09:00'],
          generateSummary: true,
          updateCommitMessage: true
        },
        codeSync: {
          enabled: true,
          scanFrequency: 'on_push',
          reportThreshold: 'medium',
          autoCreateIssue: true
        },
        reminders: {
          enabled: true,
          inactivityDays: 5,
          reminderChannels: ['github_issue'],
          escalation: {
            '7_days': 'high_priority',
            '14_days': 'critical'
          }
        },
        moduleReuse: {
          enabled: true,
          scanRepos: ['~/projects/*', '~/work/*'],
          minSimilarity: 0.7,
          autoSuggest: true
        }
      },
      ai: {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        maxTokens: 100,
        useLocal: false
      },
      git: {
        hooks: {
          preCommit: true,
          postCommit: true,
          prePush: false
        },
        author: {
          name: 'Nexus Bot',
          email: 'nexus@bot.local'
        }
      },
      mobile: {
        notificationsEnabled: true,
        syncInterval: 3600 // 1 hour in seconds
      },
      preferences: {
        colorTheme: 'auto',
        verboseOutput: false,
        confirmActions: true,
        telemetry: false
      }
    };
  }

  async initialize(): Promise<void> {
    // Ensure config directory exists
    await fs.ensureDir(path.dirname(this.configPath));
    
    // Check if config already exists
    if (await fs.pathExists(this.configPath)) {
      await this.load();
    } else {
      // Create default config
      await this.save();
    }
    
    // Create global config if not exists
    if (!await fs.pathExists(this.globalConfigPath)) {
      await fs.ensureDir(path.dirname(this.globalConfigPath));
      const globalConfig = {
        version: '1.0.0',
        ai: {
          apiKey: process.env.OPENAI_API_KEY || '',
          defaultProvider: 'openai'
        },
        user: {
          name: process.env.USER || process.env.USERNAME || 'Developer',
          email: ''
        }
      };
      await fs.writeFile(this.globalConfigPath, yaml.stringify(globalConfig));
    }
  }

  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const content = await fs.readFile(this.configPath, 'utf-8');
        const loaded = yaml.parse(content) as Partial<NexusConfigData>;
        this.config = { ...this.getDefaultConfig(), ...loaded };
      }
    } catch (error) {
      console.error('Error loading config:', error);
      this.config = this.getDefaultConfig();
    }
  }

  async save(): Promise<void> {
    await fs.ensureDir(path.dirname(this.configPath));
    const yamlStr = yaml.stringify(this.config);
    await fs.writeFile(this.configPath, yamlStr);
  }

  get<K extends keyof NexusConfigData>(key: K): NexusConfigData[K];
  get(key: string): any {
    const keys = key.split('.');
    let value: any = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  set<K extends keyof NexusConfigData>(key: K, value: NexusConfigData[K]): void;
  set(key: string, value: any): void {
    const keys = key.split('.');
    let obj: any = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!obj[k] || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    obj[keys[keys.length - 1]] = value;
  }

  async update(updates: Partial<NexusConfigData>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.save();
  }

  list(): NexusConfigData {
    return this.config;
  }

  async reset(): Promise<void> {
    this.config = this.getDefaultConfig();
    await this.save();
  }

  async getGlobalConfig(): Promise<any> {
    try {
      if (await fs.pathExists(this.globalConfigPath)) {
        const content = await fs.readFile(this.globalConfigPath, 'utf-8');
        return yaml.parse(content);
      }
    } catch (error) {
      console.error('Error loading global config:', error);
    }
    return {};
  }

  async setGlobalConfig(key: string, value: any): Promise<void> {
    const globalConfig = await this.getGlobalConfig();
    const keys = key.split('.');
    let obj: any = globalConfig;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!obj[k] || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    obj[keys[keys.length - 1]] = value;
    
    await fs.ensureDir(path.dirname(this.globalConfigPath));
    await fs.writeFile(this.globalConfigPath, yaml.stringify(globalConfig));
  }

  isEnabled(feature: string): boolean {
    const value = this.get(feature as any);
    return typeof value === 'boolean' ? value : false;
  }
}
