import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { transform } from 'esbuild';
import { glob } from 'tinyglobby';
import ts from 'typescript';
import { emittedFile, writeEmittedFiles } from '@faravahar/girih-core';
import type { Diagnostic, EmittedFile } from '@faravahar/girih-core';

export interface BuildResult {
  files: EmittedFile[];
  diagnostics: Diagnostic[];
}

/**
 * Append `.js` to extensionless relative import/export specifiers. Generated
 * code only ever uses simple relative paths ('./Button', './internal/headless'),
 * so this narrow rewrite makes both the emitted JS and .d.ts resolve under every
 * consumer moduleResolution (bundler, node16, nodenext) — not just bundlers.
 */
function addJsExtensions(code: string): string {
  return code.replace(/((?:from|import)\s*\(?\s*['"])(\.\.?\/[^'"]+)(['"])/g, (match, pre, spec, post) => {
    if (/\.[a-z0-9]+$/i.test(spec)) return match; // already extensioned (e.g. .css)
    return `${pre}${spec}.js${post}`;
  });
}

/**
 * Compile a generated package's TypeScript source into publishable `dist/`:
 * per-file ESM JavaScript (esbuild) and bundled-free type declarations
 * (TypeScript compiler API). Dependencies (react, the runtime, the headless
 * layer) stay external — they are the consumer's to resolve.
 */
export async function buildPackage(packageDir: string): Promise<BuildResult> {
  const diagnostics: Diagnostic[] = [];
  const srcDir = join(packageDir, 'src');
  const distDir = join(packageDir, 'dist');

  const sourcePaths = (await glob(['**/*.ts', '**/*.tsx'], { cwd: srcDir })).sort();
  if (sourcePaths.length === 0) {
    return {
      files: [],
      diagnostics: [{ code: 'GIRIH6001', severity: 'error', message: `No TypeScript sources in ${srcDir} — run \`girih generate react\` first.` }],
    };
  }

  await rm(distDir, { recursive: true, force: true });

  // 1) JavaScript — transpile each file, preserving module structure.
  const jsFiles: EmittedFile[] = [];
  for (const rel of sourcePaths) {
    const source = await readFile(join(srcDir, rel), 'utf8');
    const result = await transform(source, {
      loader: rel.endsWith('.tsx') ? 'tsx' : 'ts',
      format: 'esm',
      target: 'es2022',
      jsx: 'automatic',
      sourcefile: rel,
    });
    const outRel = rel.replace(/\.tsx?$/, '.js');
    jsFiles.push(emittedFile(join('dist', outRel), addJsExtensions(result.code)));
  }

  // 2) Declarations — emit via the TypeScript compiler API, then rewrite specifiers.
  const dtsFiles = emitDeclarations(srcDir, distDir, sourcePaths, diagnostics);

  const files = [...jsFiles, ...dtsFiles];
  if (!diagnostics.some((d) => d.severity === 'error')) {
    await writeEmittedFiles(packageDir, files);
  }
  return { files, diagnostics };
}

function emitDeclarations(srcDir: string, distDir: string, sourcePaths: string[], diagnostics: Diagnostic[]): EmittedFile[] {
  const options: ts.CompilerOptions = {
    declaration: true,
    emitDeclarationOnly: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    rootDir: srcDir,
    outDir: distDir,
    strict: false,
    skipLibCheck: true,
    noEmitOnError: false,
  };

  const emitted: EmittedFile[] = [];
  const host = ts.createCompilerHost(options);
  const originalWrite = host.writeFile.bind(host);
  host.writeFile = (fileName, contents, ...rest) => {
    if (fileName.endsWith('.d.ts')) {
      const rel = relative(distDir, fileName);
      emitted.push(emittedFile(join('dist', rel), addJsExtensions(contents)));
      return;
    }
    originalWrite(fileName, contents, ...rest);
  };

  const program = ts.createProgram(
    sourcePaths.map((rel) => join(srcDir, rel)),
    options,
    host,
  );
  const result = program.emit();

  for (const diagnostic of [...ts.getPreEmitDiagnostics(program), ...result.diagnostics]) {
    // Only real errors block the build; the strict-mode contract is proven separately in e2e.
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const file = diagnostic.file ? relative(dirname(srcDir), diagnostic.file.fileName) : undefined;
    diagnostics.push({ code: `TS${diagnostic.code}`, severity: 'error', message, ...(file ? { file } : {}) });
  }
  return emitted;
}

export { addJsExtensions };
