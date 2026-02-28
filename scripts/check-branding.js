const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const configPath = path.join(root, 'config.json');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'backups') continue;
      files.push(...walk(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function main() {
  let config;
  try {
    config = readJson(configPath);
  } catch (error) {
    fail(`Cannot parse config.json: ${error.message}`);
    return;
  }

  const branding = config.branding || {};
  const required = [
    'name',
    'phase',
    'presence',
    'panelTitle',
    'panelHeaderTitle',
    'panelHeaderSubtitle',
    'panelOverviewSubtitle',
    'alertPrefix'
  ];

  for (const key of required) {
    if (!branding[key] || typeof branding[key] !== 'string') {
      fail(`config.json missing branding.${key} string`);
    }
  }

  if (!config.footerText || typeof config.footerText !== 'string') {
    fail('config.json missing footerText string');
  }

  const scanFiles = walk(path.join(root, 'src')).filter(filePath => filePath.endsWith('.js'));
  const bannedPatterns = [
    /VPROJECT\s*•\s*Alpha/gi,
    /Bot Control Panel \(Alpha\)/gi,
    /\*\*Alpha\*\*/g
  ];

  for (const filePath of scanFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of bannedPatterns) {
      if (pattern.test(content)) {
        fail(`Obsolete alpha label found in ${path.relative(root, filePath)}`);
      }
    }
  }

  if (process.exitCode) {
    console.error('Branding consistency check failed.');
    process.exit(process.exitCode);
  }

  console.log('✅ Branding consistency check passed.');
}

main();
