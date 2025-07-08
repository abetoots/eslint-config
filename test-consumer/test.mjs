// Test importing from .mjs file
import eslintConfig from '@satoshibits/eslint-config';

console.log('Import from .mjs file successful!');
console.log('Config type:', typeof eslintConfig);
console.log('Is array?', Array.isArray(eslintConfig));
console.log('Config length:', eslintConfig.length);
console.log('First config:', eslintConfig[0]);