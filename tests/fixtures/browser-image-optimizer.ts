import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Page } from '@playwright/test';
import type { optimizeJourneyImage } from '../../src/lib/journey/optimize-image';

declare global { interface Window { optimizeTestImage: typeof optimizeJourneyImage } }

// Execute the actual utility in a browser, with its actual shared validation.
// No application/test route or production test hook is introduced.
export async function installImageOptimizer(page: Page) {
  const source = ['src/lib/journey/image-validation.ts','src/lib/journey/optimize-image.ts'].map(path => readFileSync(path,'utf8').replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'')).join('\n');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  await page.addScriptTag({ content: `(() => { ${compiled}\nwindow.optimizeTestImage = optimizeJourneyImage; })();` });
}
