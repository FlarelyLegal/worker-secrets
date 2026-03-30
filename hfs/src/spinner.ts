import ora, { type Ora } from "ora";

export interface Spinner {
  update(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
  start(): void;
}

export function startSpinner(text: string): Spinner {
  // Silent in non-TTY (pipes, CI) or when colors are disabled
  if (!process.stderr.isTTY) {
    return { update() {}, succeed() {}, fail() {}, stop() {}, start() {} };
  }
  const s: Ora = ora({ text, stream: process.stderr }).start();
  return {
    update(t: string) {
      s.text = t;
    },
    succeed(t?: string) {
      s.succeed(t);
    },
    fail(t?: string) {
      s.fail(t);
    },
    stop() {
      s.stop();
    },
    start() {
      s.start();
    },
  };
}
