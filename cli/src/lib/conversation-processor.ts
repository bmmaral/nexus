import fs from 'fs-extra';
import path from 'path';

export interface Message {
  role: string;
  content: string;
  timestamp?: string;
}

export interface Conversation {
  platform: string;
  messages: Message[];
  metadata?: any;
  summary?: string;
}

export interface Decision {
  text: string;
  timestamp?: string;
  confidence: number;
  context?: string;
  impact?: string;
  messageIndex?: number;
}

export class ConversationProcessor {
  private decisionPatterns = [
    /(?:decided?|chose|selected|going with|will use|opting for|picking)\s+(.+?)(?:\.|,|$|because|since|as)/gi,
    /(?:let's|let us|we'll|we will|I'll|I will)\s+(?:go with|use|implement|build|create)\s+(.+?)(?:\.|,|$)/gi,
    /(?:the best|better|preferred|recommended) (?:option|choice|solution|approach) (?:is|would be)\s+(.+?)(?:\.|,|$)/gi,
    /(?:should|must|need to|have to)\s+(?:use|implement|go with)\s+(.+?)(?:\.|,|$)/gi,
    /(?:conclusion|final decision|settled on|agreed on):\s*(.+?)(?:\.|,|$)/gi
  ];

  async parseConversation(filePath: string, platform: string): Promise<Conversation> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    switch (platform.toLowerCase()) {
      case 'chatgpt':
      case 'openai':
        return this.parseChatGPT(content);
      
      case 'claude':
      case 'anthropic':
        return this.parseClaude(content);
      
      case 'gemini':
      case 'bard':
        return this.parseGemini(content);
      
      default:
        return this.parseGeneric(content);
    }
  }

  private parseChatGPT(content: string): Conversation {
    try {
      const data = JSON.parse(content);
      const messages: Message[] = [];
      
      // Handle different ChatGPT export formats
      if (data.messages) {
        // Standard format
        messages.push(...data.messages.map((msg: any) => ({
          role: msg.role || 'user',
          content: msg.content?.text || msg.content || '',
          timestamp: msg.timestamp || msg.created_at
        })));
      } else if (Array.isArray(data)) {
        // Array of conversations
        data.forEach((conv: any) => {
          if (conv.messages) {
            messages.push(...conv.messages);
          }
        });
      }
      
      return {
        platform: 'chatgpt',
        messages,
        metadata: {
          model: data.model || 'unknown',
          exportDate: data.export_date || new Date().toISOString()
        }
      };
    } catch (error) {
      // Fallback to text parsing
      return this.parseTextConversation(content, 'User:', 'Assistant:');
    }
  }

  private parseClaude(content: string): Conversation {
    try {
      const data = JSON.parse(content);
      const messages: Message[] = [];
      
      if (data.messages) {
        messages.push(...data.messages);
      } else if (data.conversation) {
        // Alternative Claude format
        messages.push(...data.conversation);
      }
      
      return {
        platform: 'claude',
        messages,
        metadata: data.metadata
      };
    } catch {
      // Parse text format (Human: / Assistant:)
      return this.parseTextConversation(content, 'Human:', 'Assistant:');
    }
  }

  private parseGemini(content: string): Conversation {
    try {
      const data = JSON.parse(content);
      const messages: Message[] = [];
      
      if (data.messages) {
        messages.push(...data.messages);
      } else if (data.candidates) {
        // Gemini API response format
        data.candidates.forEach((candidate: any) => {
          if (candidate.content) {
            messages.push({
              role: 'assistant',
              content: candidate.content.parts?.[0]?.text || ''
            });
          }
        });
      }
      
      return {
        platform: 'gemini',
        messages,
        metadata: data.metadata
      };
    } catch {
      return this.parseGeneric(content);
    }
  }

  private parseTextConversation(content: string, userMarker: string, assistantMarker: string): Conversation {
    const messages: Message[] = [];
    const lines = content.split('\n');
    
    let currentRole = '';
    let currentContent: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith(userMarker)) {
        if (currentContent.length > 0) {
          messages.push({
            role: currentRole,
            content: currentContent.join('\n').trim()
          });
        }
        currentRole = 'user';
        currentContent = [line.replace(userMarker, '').trim()];
      } else if (line.startsWith(assistantMarker)) {
        if (currentContent.length > 0) {
          messages.push({
            role: currentRole,
            content: currentContent.join('\n').trim()
          });
        }
        currentRole = 'assistant';
        currentContent = [line.replace(assistantMarker, '').trim()];
      } else if (line.trim()) {
        currentContent.push(line);
      }
    }
    
    // Add last message
    if (currentContent.length > 0) {
      messages.push({
        role: currentRole,
        content: currentContent.join('\n').trim()
      });
    }
    
    return {
      platform: 'text',
      messages
    };
  }

  private parseGeneric(content: string): Conversation {
    // Try JSON first
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        return {
          platform: 'generic',
          messages: data
        };
      }
      if (data.messages) {
        return {
          platform: 'generic',
          messages: data.messages
        };
      }
    } catch {
      // Fallback to simple text parsing
    }
    
    // Simple text format
    const messages: Message[] = [{
      role: 'user',
      content: content
    }];
    
    return {
      platform: 'generic',
      messages
    };
  }

  async extractDecisions(conversation: Conversation): Promise<Decision[]> {
    const decisions: Decision[] = [];
    
    conversation.messages.forEach((message, index) => {
      if (message.role === 'assistant') {
        const content = message.content;
        
        for (const pattern of this.decisionPatterns) {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            const decisionText = match[1]?.trim();
            if (decisionText && decisionText.length > 10 && decisionText.length < 200) {
              decisions.push({
                text: decisionText,
                timestamp: message.timestamp,
                confidence: this.calculateConfidence(decisionText, content),
                context: this.extractContext(content, match.index || 0),
                impact: this.assessImpact(decisionText),
                messageIndex: index
              });
            }
          }
        }
      }
    });
    
    // Rank and deduplicate decisions
    return this.rankDecisions(decisions);
  }

  private calculateConfidence(decision: string, fullText: string): number {
    let confidence = 0.5; // Base confidence
    
    // Strong decision words increase confidence
    const strongWords = ['definitely', 'certainly', 'absolutely', 'must', 'critical', 'essential'];
    const weakWords = ['maybe', 'possibly', 'might', 'could', 'perhaps', 'consider'];
    
    strongWords.forEach(word => {
      if (decision.toLowerCase().includes(word)) confidence += 0.1;
    });
    
    weakWords.forEach(word => {
      if (decision.toLowerCase().includes(word)) confidence -= 0.1;
    });
    
    // Technical terms increase confidence
    const techTerms = ['api', 'database', 'framework', 'architecture', 'implementation', 'algorithm'];
    techTerms.forEach(term => {
      if (decision.toLowerCase().includes(term)) confidence += 0.05;
    });
    
    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  private extractContext(content: string, position: number): string {
    const contextRadius = 100;
    const start = Math.max(0, position - contextRadius);
    const end = Math.min(content.length, position + contextRadius);
    
    return content.substring(start, end).replace(/\n/g, ' ').trim();
  }

  private assessImpact(decision: string): string {
    const high = ['database', 'architecture', 'framework', 'security', 'authentication'];
    const medium = ['api', 'endpoint', 'model', 'schema', 'workflow'];
    const low = ['style', 'color', 'format', 'naming', 'comment'];
    
    const decisionLower = decision.toLowerCase();
    
    if (high.some(term => decisionLower.includes(term))) return 'high';
    if (medium.some(term => decisionLower.includes(term))) return 'medium';
    if (low.some(term => decisionLower.includes(term))) return 'low';
    
    return 'medium';
  }

  private rankDecisions(decisions: Decision[]): Decision[] {
    // Remove duplicates
    const unique = new Map<string, Decision>();
    
    decisions.forEach(decision => {
      const key = decision.text.toLowerCase().substring(0, 50);
      const existing = unique.get(key);
      
      if (!existing || decision.confidence > existing.confidence) {
        unique.set(key, decision);
      }
    });
    
    // Sort by confidence and impact
    const impactScore = { high: 3, medium: 2, low: 1 };
    
    return Array.from(unique.values()).sort((a, b) => {
      const scoreA = a.confidence * (impactScore[a.impact as keyof typeof impactScore] || 2);
      const scoreB = b.confidence * (impactScore[b.impact as keyof typeof impactScore] || 2);
      return scoreB - scoreA;
    });
  }

  async generateSummary(conversation: Conversation, decisions: Decision[]): Promise<string> {
    // Simple local summarization (can be enhanced with AI)
    const messageCount = conversation.messages.length;
    const decisionCount = decisions.length;
    
    if (decisionCount > 0) {
      const topDecision = decisions[0].text;
      return `${messageCount} messages, ${decisionCount} decisions. Key: ${topDecision.substring(0, 50)}...`;
    }
    
    // Extract key topics from messages
    const topics = this.extractTopics(conversation);
    if (topics.length > 0) {
      return `${messageCount} messages discussing: ${topics.slice(0, 3).join(', ')}`;
    }
    
    return `${messageCount} messages imported from ${conversation.platform}`;
  }

  private extractTopics(conversation: Conversation): string[] {
    const topics = new Set<string>();
    const keywords = [
      'database', 'api', 'frontend', 'backend', 'authentication',
      'deployment', 'testing', 'design', 'architecture', 'performance',
      'security', 'user experience', 'documentation', 'refactoring'
    ];
    
    conversation.messages.forEach(message => {
      const content = message.content.toLowerCase();
      keywords.forEach(keyword => {
        if (content.includes(keyword)) {
          topics.add(keyword);
        }
      });
    });
    
    return Array.from(topics);
  }
}


