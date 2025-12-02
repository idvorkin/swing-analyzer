// Cypress E2E support file
import './commands';

// Ignore TensorFlow/WebGL errors since we don't have WebGL in CI
Cypress.on('uncaught:exception', (err) => {
  if (
    err.message.includes('WebGL') ||
    err.message.includes('TensorFlow') ||
    err.message.includes('Failed to create') ||
    err.message.includes('GPU')
  ) {
    return false;
  }
  return true;
});
