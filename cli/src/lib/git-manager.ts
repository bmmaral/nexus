import simpleGit, { SimpleGit, LogResult, DiffResult } from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export interface CommitInfo {
  hash: string;
  date: Date;
  message: string;
  author: string;
  files: string[];
}

export class GitManager {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
  }

  async getLastCommit(): Promise<CommitInfo | null> {
    try {
      const log = await this.git.log(['-1']);
      if (log.latest) {
        return {
          hash: log.latest.hash,
          date: new Date(log.latest.date),
          message: log.latest.message,
          author: log.latest.author_name,
          files: []
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async getCommitHistory(limit: number = 10): Promise<CommitInfo[]> {
    const log = await this.git.log([`-${limit}`]);
    return log.all.map(commit => ({
      hash: commit.hash,
      date: new Date(commit.date),
      message: commit.message,
      author: commit.author_name,
      files: []
    }));
  }

  async getDiff(file?: string): Promise<string> {
    if (file) {
      return await this.git.diff(['HEAD', file]);
    }
    return await this.git.diff(['HEAD']);
  }

  async getStagedDiff(file?: string): Promise<string> {
    if (file) {
      return await this.git.diff(['--cached', file]);
    }
    return await this.git.diff(['--cached']);
  }

  async getFileHistory(filePath: string, limit: number = 10): Promise<CommitInfo[]> {
    const log = await this.git.log([`-${limit}`, '--', filePath]);
    return log.all.map(commit => ({
      hash: commit.hash,
      date: new Date(commit.date),
      message: commit.message,
      author: commit.author_name,
      files: [filePath]
    }));
  }

  async addFiles(files: string | string[]): Promise<void> {
    await this.git.add(files);
  }

  async commit(message: string, options?: { author?: string }): Promise<void> {
    if (options?.author) {
      await this.git.addConfig('user.name', options.author.split('<')[0].trim());
      await this.git.addConfig('user.email', options.author.match(/<(.+)>/)?.[1] || 'nexus@bot.local');
    }
    
    await this.git.commit(message);
  }

  async push(remote: string = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.push(remote, branch);
    } else {
      await this.git.push();
    }
  }

  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.pull(remote, branch);
    } else {
      await this.git.pull();
    }
  }

  async getChangedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to)
    ];
  }

  async getUnstagedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return status.modified.filter(file => !status.staged.includes(file));
  }

  async getStagedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return status.staged;
  }

  async stashChanges(message?: string): Promise<void> {
    if (message) {
      await this.git.stash(['push', '-m', message]);
    } else {
      await this.git.stash();
    }
  }

  async stashPop(): Promise<void> {
    await this.git.stash(['pop']);
  }

  async checkoutBranch(branch: string, createNew: boolean = false): Promise<void> {
    if (createNew) {
      await this.git.checkoutBranch(branch, 'HEAD');
    } else {
      await this.git.checkout(branch);
    }
  }

  async getRemoteUrl(remote: string = 'origin'): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find(r => r.name === remote);
      return origin ? origin.refs.fetch : null;
    } catch {
      return null;
    }
  }

  async getRepoName(): Promise<string> {
    const remoteUrl = await this.getRemoteUrl();
    if (remoteUrl) {
      // Extract repo name from URL
      const match = remoteUrl.match(/\/([^/]+?)(?:\.git)?$/);
      if (match) {
        return match[1];
      }
    }
    // Fallback to directory name
    return path.basename(this.repoPath);
  }

  async getLastModifiedDate(filePath: string): Promise<Date | null> {
    try {
      const log = await this.git.log(['-1', '--', filePath]);
      if (log.latest) {
        return new Date(log.latest.date);
      }
      return null;
    } catch {
      return null;
    }
  }

  async calculateInactiveDays(): Promise<number> {
    const lastCommit = await this.getLastCommit();
    if (!lastCommit) {
      return 0;
    }
    
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastCommit.date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  async isAICommit(commit: CommitInfo): Promise<boolean> {
    const aiAuthors = ['cursor', 'github-actions', 'nexus-bot', 'copilot'];
    const authorLower = commit.author.toLowerCase();
    
    return aiAuthors.some(ai => authorLower.includes(ai)) ||
           commit.message.toLowerCase().includes('auto-generated') ||
           commit.message.toLowerCase().includes('auto:');
  }

  async getAICommits(limit: number = 10): Promise<CommitInfo[]> {
    const commits = await this.getCommitHistory(limit * 2); // Get more to filter
    const aiCommits: CommitInfo[] = [];
    
    for (const commit of commits) {
      if (await this.isAICommit(commit)) {
        aiCommits.push(commit);
        if (aiCommits.length >= limit) {
          break;
        }
      }
    }
    
    return aiCommits;
  }

  async createTag(tagName: string, message?: string): Promise<void> {
    if (message) {
      await this.git.addAnnotatedTag(tagName, message);
    } else {
      await this.git.addTag(tagName);
    }
  }

  async getTags(): Promise<string[]> {
    const tags = await this.git.tags();
    return tags.all;
  }
}
