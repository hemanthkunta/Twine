import { FullConfig, FullResult, Reporter, TestCase, TestResult, Suite } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

interface AgentTestResult {
  agentName: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration: number;
  errors: string[];
  screenshots: string[];
}

class AgentTestReporter implements Reporter {
  private results: AgentTestResult[] = [];
  private startTime: number = 0;
  private outputDir: string;

  constructor(outputDir: string = 'test-results/agent-report') {
    this.outputDir = outputDir;
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.startTime = Date.now();
    console.log('\n🤖 Agent Test Runner Started');
    console.log('==============================');
    console.log(`Projects: ${config.projects.map(p => p.name).join(', ')}`);
    console.log(`Test files: ${config.rootDir}`);
  }

  onTestBegin(test: TestCase) {
    const agentName = this.extractAgentName(test);
    console.log(`\n▶️  [${agentName}] ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const agentName = this.extractAgentName(test);
    const duration = result.duration;
    const status = result.status;
    
    const agentResult: AgentTestResult = {
      agentName,
      testName: test.title,
      status,
      duration,
      errors: result.errors.map(e => e.message),
      screenshots: result.attachments
        .filter(a => a.contentType === 'image/png')
        .map(a => a.path || ''),
    };

    this.results.push(agentResult);

    const icon = status === 'passed' ? '✅' : status === 'failed' ? '❌' : status === 'skipped' ? '⏭️' : '⏱️';
    console.log(`${icon} [${agentName}] ${test.title} (${duration}ms)`);
    
    if (result.errors.length > 0) {
      result.errors.forEach(err => {
        console.log(`   Error: ${err.message.split('\n')[0]}`);
      });
    }
  }

  onEnd(result: FullResult) {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    const timedOut = this.results.filter(r => r.status === 'timedOut').length;

    console.log('\n📊 Agent Test Summary');
    console.log('=====================');
    console.log(`Total: ${this.results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️ Skipped: ${skipped}`);
    console.log(`⏱️ Timed Out: ${timedOut}`);
    console.log(`⏱️ Total Duration: ${totalDuration}ms`);

    this.generateReport();
    this.generateAgentSummary();
  }

  private extractAgentName(test: TestCase): string {
    const fileName = test.location.file;
    const match = fileName.match(/tests[\\/]agents[\\/]?(.+?)\.test\.ts/);
    if (match) {
      return match[1].replace(/[\\/]/g, '-');
    }
    return 'unknown-agent';
  }

  private generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalTests: this.results.length,
      passed: this.results.filter(r => r.status === 'passed').length,
      failed: this.results.filter(r => r.status === 'failed').length,
      skipped: this.results.filter(r => r.status === 'skipped').length,
      timedOut: this.results.filter(r => r.status === 'timedOut').length,
      results: this.results,
    };

    const reportPath = path.join(this.outputDir, 'agent-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);
  }

  private generateAgentSummary() {
    const agentGroups = new Map<string, AgentTestResult[]>();
    
    for (const result of this.results) {
      if (!agentGroups.has(result.agentName)) {
        agentGroups.set(result.agentName, []);
      }
      agentGroups.get(result.agentName)!.push(result);
    }

    console.log('\n👥 Per-Agent Summary');
    console.log('====================');
    
    for (const [agentName, results] of agentGroups) {
      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const total = results.length;
      const icon = failed === 0 ? '✅' : '❌';
      console.log(`${icon} ${agentName}: ${passed}/${total} passed`);
    }
  }
}

export default AgentTestReporter;