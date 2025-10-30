import fs from 'fs-extra';
import path from 'path';
import glob from 'glob';

export interface Endpoint {
  path: string;
  method: string;
  file: string;
  line?: number;
  handler?: string;
}

export interface Model {
  name: string;
  file: string;
  fields: Field[];
  methods?: string[];
}

export interface Field {
  name: string;
  type: string;
  required?: boolean;
  default?: any;
}

export interface CodeAnalysis {
  endpoints: Endpoint[];
  models: Model[];
  config: any;
  filesAnalyzed: number;
  technologies: string[];
  dependencies: string[];
}

export class CodeAnalyzer {
  private projectPath: string;
  private supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php'];

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async analyze(options: { quick?: boolean; verbose?: boolean } = {}): Promise<CodeAnalysis> {
    const analysis: CodeAnalysis = {
      endpoints: [],
      models: [],
      config: {},
      filesAnalyzed: 0,
      technologies: [],
      dependencies: []
    };

    // Detect technologies
    analysis.technologies = await this.detectTechnologies();
    
    // Get dependencies
    analysis.dependencies = await this.extractDependencies();
    
    // Find and analyze code files
    const files = await this.findCodeFiles(options.quick);
    
    for (const file of files) {
      if (options.verbose) {
        console.log(`  Analyzing: ${file}`);
      }
      
      const ext = path.extname(file);
      const content = await fs.readFile(file, 'utf-8');
      
      // Extract endpoints
      const endpoints = this.extractEndpoints(content, file, ext);
      analysis.endpoints.push(...endpoints);
      
      // Extract models
      const models = this.extractModels(content, file, ext);
      analysis.models.push(...models);
      
      analysis.filesAnalyzed++;
    }
    
    // Extract configuration
    analysis.config = await this.extractConfiguration();
    
    return analysis;
  }

  private async findCodeFiles(quick: boolean = false): Promise<string[]> {
    const ignore = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/tmp/**',
      '**/*.min.js',
      '**/*.map'
    ];
    
    const files: string[] = [];
    
    for (const ext of this.supportedExtensions) {
      const pattern = quick ? `*${ext}` : `**/*${ext}`;
      const found = glob.sync(pattern, {
        cwd: this.projectPath,
        ignore,
        absolute: false
      });
      
      files.push(...found.map(f => path.join(this.projectPath, f)));
      
      if (quick && files.length > 50) {
        break; // Limit files in quick mode
      }
    }
    
    return files;
  }

  private extractEndpoints(content: string, file: string, ext: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    
    // Express.js patterns
    const expressPatterns = [
      /app\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`](.*?)['"`]/gi,
      /router\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`](.*?)['"`]/gi,
    ];
    
    // FastAPI/Flask patterns (Python)
    const pythonPatterns = [
      /@app\.route\s*\(\s*['"`](.*?)['"`].*?methods\s*=\s*\[(.*?)\]/gi,
      /@app\.(get|post|put|patch|delete)\s*\(\s*['"`](.*?)['"`]/gi,
    ];
    
    // Spring patterns (Java)
    const javaPatterns = [
      /@(Get|Post|Put|Patch|Delete)Mapping\s*\(\s*['"`](.*?)['"`]\)/gi,
      /@RequestMapping\s*\(.*?value\s*=\s*['"`](.*?)['"`].*?method\s*=\s*RequestMethod\.(GET|POST|PUT|PATCH|DELETE)/gi,
    ];
    
    // Select patterns based on file extension
    let patterns: RegExp[] = [];
    if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
      patterns = expressPatterns;
    } else if (ext === '.py') {
      patterns = pythonPatterns;
    } else if (ext === '.java') {
      patterns = javaPatterns;
    }
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const pathStr = match[2] || match[3];
        
        if (pathStr) {
          endpoints.push({
            method,
            path: this.normalizePath(pathStr),
            file: path.relative(this.projectPath, file),
            line: this.getLineNumber(content, match.index)
          });
        }
      }
    }
    
    return endpoints;
  }

  private extractModels(content: string, file: string, ext: string): Model[] {
    const models: Model[] = [];
    
    // JavaScript/TypeScript class patterns
    if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
      const classPattern = /(?:export\s+)?(?:default\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{([^}]*)\}/gs;
      let match;
      
      while ((match = classPattern.exec(content)) !== null) {
        const className = match[1];
        const classBody = match[2];
        
        // Skip React components
        if (className.includes('Component') || className.includes('Page') || className.includes('View')) {
          continue;
        }
        
        const fields = this.extractFieldsFromClass(classBody);
        if (fields.length > 0) {
          models.push({
            name: className,
            file: path.relative(this.projectPath, file),
            fields
          });
        }
      }
      
      // TypeScript interface patterns
      if (ext === '.ts' || ext === '.tsx') {
        const interfacePattern = /(?:export\s+)?interface\s+(\w+)\s*\{([^}]*)\}/gs;
        let match;
        
        while ((match = interfacePattern.exec(content)) !== null) {
          const interfaceName = match[1];
          const interfaceBody = match[2];
          
          const fields = this.extractFieldsFromInterface(interfaceBody);
          if (fields.length > 0) {
            models.push({
              name: interfaceName,
              file: path.relative(this.projectPath, file),
              fields
            });
          }
        }
      }
    }
    
    // Python class patterns
    if (ext === '.py') {
      const classPattern = /class\s+(\w+).*?:\n((?:\s{4}.*\n)*)/gm;
      let match;
      
      while ((match = classPattern.exec(content)) !== null) {
        const className = match[1];
        const classBody = match[2];
        
        const fields = this.extractFieldsFromPythonClass(classBody);
        if (fields.length > 0) {
          models.push({
            name: className,
            file: path.relative(this.projectPath, file),
            fields
          });
        }
      }
    }
    
    return models;
  }

  private extractFieldsFromClass(classBody: string): Field[] {
    const fields: Field[] = [];
    const lines = classBody.split('\n');
    
    for (const line of lines) {
      // Constructor parameters
      if (line.includes('constructor')) {
        const paramMatch = line.match(/constructor\s*\((.*?)\)/);
        if (paramMatch) {
          const params = paramMatch[1].split(',');
          for (const param of params) {
            const parts = param.trim().split(':');
            if (parts.length >= 2) {
              fields.push({
                name: parts[0].trim().replace(/public|private|protected/, '').trim(),
                type: parts[1].trim()
              });
            }
          }
        }
      }
      
      // Class properties
      const propMatch = line.match(/^\s*(public|private|protected)?\s*(\w+)\s*:?\s*([^=;]+)?/);
      if (propMatch && propMatch[2] && !propMatch[2].includes('(')) {
        fields.push({
          name: propMatch[2],
          type: propMatch[3]?.trim() || 'any'
        });
      }
    }
    
    return fields;
  }

  private extractFieldsFromInterface(interfaceBody: string): Field[] {
    const fields: Field[] = [];
    const lines = interfaceBody.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^\s*(\w+)(\?)?\s*:\s*([^;]+)/);
      if (match) {
        fields.push({
          name: match[1],
          type: match[3].trim(),
          required: !match[2]
        });
      }
    }
    
    return fields;
  }

  private extractFieldsFromPythonClass(classBody: string): Field[] {
    const fields: Field[] = [];
    const lines = classBody.split('\n');
    
    for (const line of lines) {
      // Look for class attributes
      const attrMatch = line.match(/^\s*self\.(\w+)\s*=\s*.*/);
      if (attrMatch) {
        fields.push({
          name: attrMatch[1],
          type: 'any' // Python is dynamically typed
        });
      }
      
      // Look for type hints
      const typeMatch = line.match(/^\s*(\w+)\s*:\s*(\w+)/);
      if (typeMatch) {
        fields.push({
          name: typeMatch[1],
          type: typeMatch[2]
        });
      }
    }
    
    return fields;
  }

  private async detectTechnologies(): Promise<string[]> {
    const technologies: string[] = [];
    
    // Check package.json for Node.js projects
    if (await fs.pathExists(path.join(this.projectPath, 'package.json'))) {
      technologies.push('Node.js');
      const pkg = await fs.readJSON(path.join(this.projectPath, 'package.json'));
      
      // Check for frameworks
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.express) technologies.push('Express');
      if (deps.react) technologies.push('React');
      if (deps.vue) technologies.push('Vue');
      if (deps.angular) technologies.push('Angular');
      if (deps.next) technologies.push('Next.js');
      if (deps.typescript) technologies.push('TypeScript');
    }
    
    // Check for Python projects
    if (await fs.pathExists(path.join(this.projectPath, 'requirements.txt'))) {
      technologies.push('Python');
      const content = await fs.readFile(path.join(this.projectPath, 'requirements.txt'), 'utf-8');
      if (content.includes('django')) technologies.push('Django');
      if (content.includes('flask')) technologies.push('Flask');
      if (content.includes('fastapi')) technologies.push('FastAPI');
    }
    
    // Check for Java projects
    if (await fs.pathExists(path.join(this.projectPath, 'pom.xml'))) {
      technologies.push('Java', 'Maven');
    }
    if (await fs.pathExists(path.join(this.projectPath, 'build.gradle'))) {
      technologies.push('Java', 'Gradle');
    }
    
    // Check for Go projects
    if (await fs.pathExists(path.join(this.projectPath, 'go.mod'))) {
      technologies.push('Go');
    }
    
    return [...new Set(technologies)]; // Remove duplicates
  }

  private async extractDependencies(): Promise<string[]> {
    const dependencies: string[] = [];
    
    // Extract from package.json
    if (await fs.pathExists(path.join(this.projectPath, 'package.json'))) {
      const pkg = await fs.readJSON(path.join(this.projectPath, 'package.json'));
      dependencies.push(...Object.keys(pkg.dependencies || {}));
    }
    
    // Extract from requirements.txt
    if (await fs.pathExists(path.join(this.projectPath, 'requirements.txt'))) {
      const content = await fs.readFile(path.join(this.projectPath, 'requirements.txt'), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      dependencies.push(...lines.map(l => l.split('==')[0].split('>=')[0].trim()));
    }
    
    return dependencies;
  }

  private async extractConfiguration(): Promise<any> {
    const config: any = {};
    
    // Check for .env file
    if (await fs.pathExists(path.join(this.projectPath, '.env'))) {
      const envContent = await fs.readFile(path.join(this.projectPath, '.env'), 'utf-8');
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        if (line.includes('=') && !line.startsWith('#')) {
          const [key] = line.split('=');
          config[key.trim()] = '[CONFIGURED]'; // Don't expose actual values
        }
      }
    }
    
    // Check for config files
    const configFiles = ['config.json', 'config.js', 'config.ts', 'settings.py'];
    for (const configFile of configFiles) {
      if (await fs.pathExists(path.join(this.projectPath, configFile))) {
        config.hasConfigFile = true;
        config.configFile = configFile;
        break;
      }
    }
    
    return config;
  }

  private normalizePath(pathStr: string): string {
    // Normalize path to always start with /
    if (!pathStr.startsWith('/')) {
      pathStr = '/' + pathStr;
    }
    
    // Remove trailing slashes except for root
    if (pathStr.length > 1 && pathStr.endsWith('/')) {
      pathStr = pathStr.slice(0, -1);
    }
    
    return pathStr;
  }

  private getLineNumber(content: string, position: number): number {
    const lines = content.substring(0, position).split('\n');
    return lines.length;
  }
}


