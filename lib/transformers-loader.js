/**
 * Transformers.js Loader
 * Loads the Transformers.js pipeline from local vendor folder
 */

console.log('[Transformers] Starting load from local vendor...');

import('../lib/vendor/transformers/transformers.min.js')
  .then(module => {
    window.transformersPipeline = module.pipeline;
    console.log('[Transformers] ✓ Loaded successfully from local vendor');
    console.log('[Transformers] Pipeline available at window.transformersPipeline');
  })
  .catch(error => {
    console.error('[Transformers] ✗ Failed to load from local vendor');
    console.error('[Transformers] Error:', error.message);
    console.error('[Transformers] Stack:', error.stack);
  });
