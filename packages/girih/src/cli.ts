#!/usr/bin/env node
import { Command } from 'commander';
import { registerBrand } from './commands/brand.js';
import { registerBuild } from './commands/build.js';
import { registerCheck } from './commands/check.js';
import { registerCreate } from './commands/create.js';
import { registerDoctor } from './commands/doctor.js';
import { registerEject } from './commands/eject.js';
import { registerForks } from './commands/forks.js';
import { registerGenerate } from './commands/generate.js';
import { registerInit } from './commands/init.js';
import { registerPublish } from './commands/publish.js';
import { registerUpdate } from './commands/update.js';
import { SELF_VERSION } from './self.js';

const program = new Command();
program
  .name('girih')
  .description('Compile a multi-brand design system from tokens and component contracts.')
  .version(SELF_VERSION, '-v, --version');

// Registration order is the order `girih --help` lists them, so it runs roughly in
// the order a workspace is used: start one, inspect it, generate, then release.
registerCreate(program);
registerInit(program);
registerBrand(program);
registerCheck(program);
registerDoctor(program);
registerGenerate(program);
registerEject(program);
registerForks(program);
registerBuild(program);
registerPublish(program);
registerUpdate(program);

await program.parseAsync(process.argv);
