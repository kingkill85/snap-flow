import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { fileStorageService } from '../../src/services/file-storage.ts';
import { env } from '../../src/config/env.ts';

Deno.test('FileStorageService - copyFile', async (t) => {
  const testUploadDir = env.UPLOAD_DIR || './uploads';
  
  await t.step('copyFile copies file to new location', async () => {
    // Create a test file
    const testContent = new TextEncoder().encode('test image content');
    const sourcePath = await fileStorageService.saveFile(
      testContent,
      'test-source.jpg',
      'test-source'
    );
    
    assertExists(sourcePath);
    
    // Copy to new location
    const destPath = await fileStorageService.copyFile(
      sourcePath,
      'test-dest',
      'copied-file.jpg'
    );
    
    assertExists(destPath);
    assertEquals(destPath, 'test-dest/copied-file.jpg');
    
    // Verify copied file exists
    const exists = await fileStorageService.fileExists(destPath);
    assertEquals(exists, true);
    
    // Cleanup
    await fileStorageService.deleteFile(sourcePath);
    await fileStorageService.deleteFile(destPath);
  });

  await t.step('copyFile generates unique filename when not provided', async () => {
    // Create a test file
    const testContent = new TextEncoder().encode('test content');
    const sourcePath = await fileStorageService.saveFile(
      testContent,
      'original.jpg',
      'test-source'
    );
    
    // Copy without specifying filename
    const destPath = await fileStorageService.copyFile(
      sourcePath,
      'test-dest'
    );
    
    assertExists(destPath);
    // Should have generated a unique filename with timestamp
    assertEquals(destPath.includes('-'), true);
    
    // Cleanup
    await fileStorageService.deleteFile(sourcePath);
    await fileStorageService.deleteFile(destPath);
  });

  await t.step('copyFile handles project folder structure', async () => {
    // Create a test file
    const testContent = new TextEncoder().encode('project image');
    const sourcePath = await fileStorageService.saveFile(
      testContent,
      'variant.jpg',
      'test-source'
    );
    
    // Copy to project-specific location
    const projectId = 123;
    const bomEntryId = 456;
    const destPath = await fileStorageService.copyFile(
      sourcePath,
      `projects/${projectId}/bom-images`,
      `${bomEntryId}-variant.jpg`
    );
    
    assertEquals(destPath, `projects/${projectId}/bom-images/${bomEntryId}-variant.jpg`);
    
    // Verify file exists
    const exists = await fileStorageService.fileExists(destPath);
    assertEquals(exists, true);
    
    // Cleanup
    await fileStorageService.deleteFile(sourcePath);
    await fileStorageService.deleteFile(destPath);
  });

  await t.step('copyFile returns original path on failure', async () => {
    // Try to copy a non-existent file
    const result = await fileStorageService.copyFile(
      'non-existent/path/file.jpg',
      'test-dest'
    );
    
    // Should return the original path as fallback
    assertEquals(result, 'non-existent/path/file.jpg');
  });
});
