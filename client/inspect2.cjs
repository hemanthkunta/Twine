const lib = require('libsignal-protocol-typescript');
console.log('Default export keys:', Object.keys(lib.default || {}));
console.log('All exports:', Object.keys(lib));