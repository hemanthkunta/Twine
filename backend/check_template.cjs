const fs = require('fs');
const content = require('fs').readFileSync('src/db/schema.ts', 'utf8');
const matches = content.match(/\$\{/g);
console.log('Found', matches?.length || 0, 'template expressions');