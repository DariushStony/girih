export interface EmittedFile {
  /** Path relative to the emit root. */
  path: string;
  contents: string;
  /** sha256 of contents — used for drift detection and publish diffing. */
  hash: string;
}
export declare function emittedFile(path: string, contents: string): EmittedFile;
export declare function writeEmittedFiles(root: string, files: EmittedFile[]): Promise<void>;
/** Paths (relative to root) whose on-disk contents differ from the given files — the CI staleness gate. */
export declare function verifyEmittedFiles(root: string, files: EmittedFile[]): Promise<string[]>;
//# sourceMappingURL=files.d.ts.map
