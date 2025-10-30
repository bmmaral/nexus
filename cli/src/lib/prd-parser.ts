import fs from 'fs-extra';
import MarkdownIt from 'markdown-it';

export interface PRDEndpoint {
  path: string;
  method: string;
  description: string;
  parameters?: any[];
  response?: any;
}

export interface PRDModel {
  name: string;
  fields: PRDField[];
  description?: string;
}

export interface PRDField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface PRDFeature {
  name: string;
  description: string;
  status?: 'planned' | 'in-progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

export interface PRDData {
  title: string;
  version?: string;
  lastUpdated?: string;
  endpoints: PRDEndpoint[];
  models: PRDModel[];
  features: PRDFeature[];
  config?: any;
  nextSteps?: string[];
  technologies?: string[];
}

export class PRDParser {
  private md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt();
  }

  async parse(prdPath: string): Promise<PRDData> {
    const content = await fs.readFile(prdPath, 'utf-8');
    return this.parseContent(content);
  }

  parseContent(content: string): PRDData {
    const data: PRDData = {
      title: '',
      endpoints: [],
      models: [],
      features: [],
      nextSteps: []
    };

    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      data.title = titleMatch[1].replace(/[—–-]\s*Product Requirements.*$/i, '').trim();
    }

    // Extract version
    const versionMatch = content.match(/version:\s*([^\n]+)/i);
    if (versionMatch) {
      data.version = versionMatch[1].trim();
    }

    // Extract last updated
    const updatedMatch = content.match(/last[_\s]?updated:\s*([^\n]+)/i);
    if (updatedMatch) {
      data.lastUpdated = updatedMatch[1].trim();
    }

    // Parse sections
    const sections = this.splitIntoSections(content);
    
    for (const [title, sectionContent] of sections.entries()) {
      const lowerTitle = title.toLowerCase();
      
      if (lowerTitle.includes('endpoint') || lowerTitle.includes('api')) {
        data.endpoints.push(...this.parseEndpoints(sectionContent));
      } else if (lowerTitle.includes('model') || lowerTitle.includes('schema') || lowerTitle.includes('data')) {
        data.models.push(...this.parseModels(sectionContent));
      } else if (lowerTitle.includes('feature')) {
        data.features.push(...this.parseFeatures(sectionContent));
      } else if (lowerTitle.includes('next step') || lowerTitle.includes('todo')) {
        data.nextSteps = this.parseNextSteps(sectionContent);
      } else if (lowerTitle.includes('tech') || lowerTitle.includes('stack')) {
        data.technologies = this.parseTechnologies(sectionContent);
      } else if (lowerTitle.includes('config')) {
        data.config = this.parseConfiguration(sectionContent);
      }
    }

    return data;
  }

  private splitIntoSections(content: string): Map<string, string> {
    const sections = new Map<string, string>();
    const lines = content.split('\n');
    
    let currentSection = 'root';
    let currentContent: string[] = [];
    
    for (const line of lines) {
      const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
      
      if (headerMatch) {
        // Save previous section
        if (currentContent.length > 0) {
          sections.set(currentSection, currentContent.join('\n'));
        }
        
        // Start new section
        currentSection = headerMatch[1];
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    
    // Save last section
    if (currentContent.length > 0) {
      sections.set(currentSection, currentContent.join('\n'));
    }
    
    return sections;
  }

  private parseEndpoints(content: string): PRDEndpoint[] {
    const endpoints: PRDEndpoint[] = [];
    
    // Parse table format
    const tableMatch = content.match(/\|.*?\|.*?\|.*?\|[\s\S]*?\n\n/);
    if (tableMatch) {
      const lines = tableMatch[0].split('\n').filter(l => l.includes('|'));
      
      // Skip header and separator
      for (let i = 2; i < lines.length; i++) {
        const parts = lines[i].split('|').map(p => p.trim()).filter(p => p);
        if (parts.length >= 3) {
          const pathMethod = parts[0].match(/(\w+)\s+(.+)/);
          if (pathMethod) {
            endpoints.push({
              method: pathMethod[1].toUpperCase(),
              path: pathMethod[2],
              description: parts[2] || parts[1]
            });
          } else {
            // Separate columns for method and path
            endpoints.push({
              path: parts[0],
              method: parts[1].toUpperCase(),
              description: parts[2]
            });
          }
        }
      }
    }
    
    // Parse list format
    const listPattern = /[-*]\s*(?:`?)(\w+)\s+(\/[^\s`]+)(?:`?)(?:\s*[:-]\s*(.+))?/g;
    let match;
    while ((match = listPattern.exec(content)) !== null) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        description: match[3] || ''
      });
    }
    
    // Parse code blocks with endpoint definitions
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    for (const block of codeBlocks) {
      const endpointPattern = /["']?(GET|POST|PUT|PATCH|DELETE)["']?\s*["']([^"']+)["']/gi;
      let codeMatch;
      while ((codeMatch = endpointPattern.exec(block)) !== null) {
        endpoints.push({
          method: codeMatch[1].toUpperCase(),
          path: codeMatch[2],
          description: ''
        });
      }
    }
    
    return endpoints;
  }

  private parseModels(content: string): PRDModel[] {
    const models: PRDModel[] = [];
    
    // Parse code blocks with JSON schema
    const codeBlocks = content.match(/```(?:json|javascript|typescript)?[\s\S]*?```/g) || [];
    
    for (const block of codeBlocks) {
      const cleanBlock = block.replace(/```[\w]*\n?/g, '').trim();
      
      try {
        const parsed = JSON.parse(cleanBlock);
        
        // Check if it's a model definition
        for (const [modelName, modelDef] of Object.entries(parsed)) {
          if (typeof modelDef === 'object' && modelDef !== null) {
            const fields = this.extractFieldsFromJSON(modelDef as any);
            if (fields.length > 0) {
              models.push({
                name: modelName,
                fields
              });
            }
          }
        }
      } catch {
        // Try to parse as TypeScript interface
        const interfaceMatch = cleanBlock.match(/interface\s+(\w+)\s*\{([^}]*)\}/g);
        if (interfaceMatch) {
          for (const iface of interfaceMatch) {
            const nameMatch = iface.match(/interface\s+(\w+)/);
            const bodyMatch = iface.match(/\{([^}]*)\}/);
            
            if (nameMatch && bodyMatch) {
              const fields = this.parseInterfaceFields(bodyMatch[1]);
              if (fields.length > 0) {
                models.push({
                  name: nameMatch[1],
                  fields
                });
              }
            }
          }
        }
      }
    }
    
    // Parse table format models
    const tablePattern = /###?\s*(\w+)[\s\S]*?\|.*?\|.*?\|[\s\S]*?\n\n/g;
    let tableMatch;
    while ((tableMatch = tablePattern.exec(content)) !== null) {
      const modelName = tableMatch[1];
      const tableContent = tableMatch[0];
      const fields = this.parseTableFields(tableContent);
      
      if (fields.length > 0) {
        models.push({
          name: modelName,
          fields
        });
      }
    }
    
    return models;
  }

  private extractFieldsFromJSON(obj: any): PRDField[] {
    const fields: PRDField[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      let type = 'any';
      
      if (typeof value === 'string') {
        type = value;
      } else if (typeof value === 'object' && value !== null) {
        if ('type' in value) {
          type = (value as any).type;
        } else if (Array.isArray(value)) {
          type = 'array';
        } else {
          type = 'object';
        }
      } else {
        type = typeof value;
      }
      
      fields.push({
        name: key,
        type,
        required: (value as any)?.required || false
      });
    }
    
    return fields;
  }

  private parseInterfaceFields(body: string): PRDField[] {
    const fields: PRDField[] = [];
    const lines = body.split(/[,;]/).filter(l => l.trim());
    
    for (const line of lines) {
      const match = line.match(/(\w+)(\?)?\s*:\s*([^;,]+)/);
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

  private parseTableFields(content: string): PRDField[] {
    const fields: PRDField[] = [];
    const lines = content.split('\n').filter(l => l.includes('|'));
    
    // Skip header and separator
    for (let i = 2; i < lines.length; i++) {
      const parts = lines[i].split('|').map(p => p.trim()).filter(p => p);
      if (parts.length >= 2) {
        fields.push({
          name: parts[0],
          type: parts[1],
          required: parts[2]?.toLowerCase() === 'yes' || parts[2]?.toLowerCase() === 'required',
          description: parts[3] || parts[2]
        });
      }
    }
    
    return fields;
  }

  private parseFeatures(content: string): PRDFeature[] {
    const features: PRDFeature[] = [];
    
    // Parse list format
    const lines = content.split('\n');
    for (const line of lines) {
      const listMatch = line.match(/[-*]\s*(?:\[.\])?\s*(.+?)(?:\s*:\s*(.+))?$/);
      if (listMatch) {
        const name = listMatch[1].replace(/\*\*/g, '').trim();
        const description = listMatch[2] || '';
        
        // Check for completion status
        let status: PRDFeature['status'] = 'planned';
        if (line.includes('[x]') || line.includes('[X]')) {
          status = 'completed';
        } else if (line.includes('in progress') || line.includes('in-progress')) {
          status = 'in-progress';
        }
        
        features.push({
          name,
          description,
          status
        });
      }
    }
    
    // Parse heading format
    const headingPattern = /####?\s*(.+)\n([^#]+)/g;
    let match;
    while ((match = headingPattern.exec(content)) !== null) {
      features.push({
        name: match[1].trim(),
        description: match[2].trim()
      });
    }
    
    return features;
  }

  private parseNextSteps(content: string): string[] {
    const steps: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const listMatch = line.match(/^[\d\-*]+\.?\s+(.+)$/);
      if (listMatch) {
        steps.push(listMatch[1].replace(/\[.\]/g, '').trim());
      }
    }
    
    return steps;
  }

  private parseTechnologies(content: string): string[] {
    const technologies: string[] = [];
    
    // Look for technology mentions
    const techPatterns = [
      /\*\*([^*]+)\*\*/g,  // Bold items
      /`([^`]+)`/g,         // Code items
      /[-*]\s*(.+?)(?:\s*[:-]|$)/g  // List items
    ];
    
    for (const pattern of techPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const tech = match[1].trim();
        if (tech.length < 20 && !tech.includes(' ')) { // Likely a technology name
          technologies.push(tech);
        }
      }
    }
    
    return [...new Set(technologies)]; // Remove duplicates
  }

  private parseConfiguration(content: string): any {
    const config: any = {};
    
    // Look for key-value pairs
    const kvPattern = /(\w+)\s*[:=]\s*([^\n]+)/g;
    let match;
    while ((match = kvPattern.exec(content)) !== null) {
      config[match[1]] = match[2].trim();
    }
    
    // Try to parse JSON blocks
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    for (const block of codeBlocks) {
      const cleanBlock = block.replace(/```[\w]*\n?/g, '').trim();
      try {
        const parsed = JSON.parse(cleanBlock);
        Object.assign(config, parsed);
      } catch {
        // Not JSON, skip
      }
    }
    
    return config;
  }
}


