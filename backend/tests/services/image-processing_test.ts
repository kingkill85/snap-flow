import { assertEquals } from '@std/assert';
import { processImageSafe } from '../../src/services/image-processing.ts';

Deno.test('processImageSafe returns original buffer for non-image data', async () => {
  const textBuffer = new TextEncoder().encode('Hello World, this is not an image');
  const result = await processImageSafe(textBuffer, { maxWidth: 600 });
  
  assertEquals(result.format, 'unknown');
  assertEquals(result.buffer.length, textBuffer.length);
  assertEquals(result.originalSize, textBuffer.length);
  assertEquals(result.processedSize, textBuffer.length);
});

Deno.test('processImageSafe handles small buffers gracefully', async () => {
  const smallBuffer = new Uint8Array([0x00, 0x01, 0x02]);
  const result = await processImageSafe(smallBuffer, { maxWidth: 600 });
  
  assertEquals(result.format, 'unknown');
  assertEquals(result.buffer.length, smallBuffer.length);
});
