#!/usr/bin/env node
// Installs the tab-bankruptcy OpenClaw skill: fills this checkout's absolute path into the
// skill template (skills/tab-bankruptcy/SKILL.md uses {repo}) and runs `openclaw skills install`.
//   node tools/install-skill.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = ROOT.replace(/\\/g, '/');
const out = join(ROOT, 'out', 'skill', 'tab-bankruptcy');
mkdirSync(out, { recursive: true });
const skill = readFileSync(join(ROOT, 'skills', 'tab-bankruptcy', 'SKILL.md'), 'utf8').replaceAll('{repo}', repo);
writeFileSync(join(out, 'SKILL.md'), skill);
console.log(`Skill written with repo path ${repo}`);
execSync(`openclaw skills install "${out}"`, { stdio: 'inherit' });
console.log('Installed. Check it with: openclaw skills list');
