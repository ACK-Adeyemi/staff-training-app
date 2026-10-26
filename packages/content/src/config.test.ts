// Chunk 6: product name is a single config value (brief 3).
import { describe, expect, it } from 'vitest';
import { productName } from './config';
import * as content from './index';

describe('config', () => {
  it('uses the placeholder product name until the real one is chosen', () => {
    expect(productName).toBe('[Product name]');
  });

  it('is re-exported from the package entry point', () => {
    expect(content.productName).toBe(productName);
  });
});
