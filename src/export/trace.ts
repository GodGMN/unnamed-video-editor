// Records what an export is doing step by step, so a hang can be pinned to the step that stopped moving.

export interface TraceStep {
  /** Short, shown in the dialog, e.g. "Decoding audio". */
  label: string;
  /** What the step works on, e.g. a file name. */
  subject: string;
  /** Short counter, e.g. "42 / 132 s". */
  progress: string;
  /** Milliseconds since the trace started. */
  startedAt: number;
  endedAt: number | null;
}

export class ExportTrace {
  readonly steps: TraceStep[] = [];
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly t0: number;
  private lastActivity: number;

  constructor(now = () => performance.now(), log = (line: string) => console.info(line)) {
    this.now = now;
    this.log = log;
    this.t0 = now();
    this.lastActivity = this.t0;
  }

  get current(): TraceStep | null {
    const last = this.steps.at(-1);
    return last && last.endedAt === null ? last : null;
  }

  /** Ends the running step and starts another. */
  step(label: string, subject = '', progress = '') {
    this.end();
    const at = this.now() - this.t0;
    this.steps.push({ label, subject, progress, startedAt: at, endedAt: null });
    this.lastActivity = this.now();
    this.log(`[export] +${secs(at)} ${describe(label, subject, progress)}`);
  }

  /** Updates the running step's counter; counts as activity but isn't logged. */
  progress(progress: string) {
    const step = this.current;
    if (step) step.progress = progress;
    this.lastActivity = this.now();
  }

  end() {
    const step = this.current;
    if (step) step.endedAt = this.now() - this.t0;
  }

  /** Seconds since the last step or progress update. */
  idleSeconds() {
    return (this.now() - this.lastActivity) / 1000;
  }

  /** Plain-text report to paste into a bug: context lines, then every step with its timing. */
  report(context: Record<string, string>) {
    const lines = Object.entries(context).map(([k, v]) => `${k}: ${v}`);
    lines.push('', 'steps:');
    for (const s of this.steps) {
      const took = s.endedAt === null
        ? `running ${secs(this.now() - this.t0 - s.startedAt)}, idle ${this.idleSeconds().toFixed(1)}s`
        : secs(s.endedAt - s.startedAt);
      lines.push(`  +${secs(s.startedAt)} ${describe(s.label, s.subject, s.progress)} (${took})`);
    }
    return lines.join('\n');
  }
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const describe = (label: string, subject: string, progress: string) =>
  [label, subject, progress].filter(Boolean).join(' · ');
