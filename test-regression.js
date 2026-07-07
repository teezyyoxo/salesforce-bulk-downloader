const fs = require('fs');
const path = require('path');

const contentPath = path.join(__dirname, 'src', 'content.js');
const content = fs.readFileSync(contentPath, 'utf8');

function extractFunction(name) {
  const start = content.indexOf(`function ${name}(`);
  if (start === -1) {
    throw new Error(`Could not find function ${name}`);
  }

  let index = content.indexOf('{', start);
  if (index === -1) {
    throw new Error(`Could not find opening brace for function ${name}`);
  }

  let depth = 1;
  index += 1;

  while (index < content.length && depth > 0) {
    const char = content[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    }
    index += 1;
  }

  if (depth !== 0) {
    throw new Error(`Unbalanced braces while reading function ${name}`);
  }

  return content.slice(start, index);
}

function buildFunction(name) {
  const body = extractFunction(name);
  const wrapper = `function cleanText(value) { return String(value || '').replace(/\\s+/g, ' ').trim(); }
function hasFileExtension(value) { return /\\.[a-zA-Z0-9]{1,12}$/.test(cleanText(value)); }
${body}
return ${name};`;
  return new Function(wrapper)();
}

const stripText = buildFunction('stripFieldActionText');
const cleanCandidate = buildFunction('cleanFileNameCandidate');
const docTypeToExtension = buildFunction('docTypeToExtension');

const cases = [
  { input: 'ABC CompaniesPreview -', expected: 'ABC Companies' },
  { input: 'ABC Companies Preview', expected: 'ABC Companies' },
  { input: 'Preview ABC Companies', expected: 'ABC Companies' },
  { input: 'ABC CompaniesPreview', expected: 'ABC Companies' },
  { input: 'ABC Companies Preview -', expected: 'ABC Companies' }
];

const fileCases = [
  { input: 'Document.pdf', expected: 'Document.pdf' },
  { input: 'Adobe PDF Document.pdf', expected: 'Document.pdf' },
  { input: 'Document', expected: 'Document' },
  { input: 'DocumentPreview.pdf', expected: 'DocumentPreview.pdf' },
  { input: 'Document Preview.pdf', expected: 'Document Preview.pdf' },
  { input: 'Image fileimage001', expected: 'image001' },
  { input: 'ZIP filetravelers-prod-bigid-support-package-2026-06-23_14-41-19', expected: 'travelers-prod-bigid-support-package-2026-06-23_14-41-19' }
];

const docTypeCases = [
  { input: 'zip', expected: 'zip' },
  { input: 'pdf', expected: 'pdf' },
  { input: 'excel', expected: 'xlsx' },
  { input: 'word', expected: 'docx' },
  { input: 'ppt', expected: 'pptx' },
  { input: 'image', expected: '' },
  { input: 'unknown', expected: '' },
  { input: '', expected: '' }
];

console.log('Running regression tests...');
let failed = false;

for (const { input, expected } of cases) {
  const actual = stripText(input);
  if (actual !== expected) {
    failed = true;
    console.error(`stripFieldActionText FAILED: ${JSON.stringify(input)} => ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

for (const { input, expected } of fileCases) {
  const actual = cleanCandidate(input);
  if (actual !== expected) {
    failed = true;
    console.error(`cleanFileNameCandidate FAILED: ${JSON.stringify(input)} => ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

for (const { input, expected } of docTypeCases) {
  const actual = docTypeToExtension(input);
  if (actual !== expected) {
    failed = true;
    console.error(`docTypeToExtension FAILED: ${JSON.stringify(input)} => ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

if (!failed) {
  console.log('All regression tests passed.');
  process.exit(0);
}
process.exit(1);
