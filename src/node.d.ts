// Minimal ambient declarations for the handful of Node.js built-ins this
// project touches. Written by hand instead of pulling in @types/node so
// the project has zero third-party dependencies, not even for types.

declare module "fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module "path" {
  export function join(...segments: string[]): string;
}

declare const process: {
  argv: string[];
  exitCode?: number;
  exit(code?: number): never;
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
};
