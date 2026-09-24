export interface FileStorage {
  upload(buffer: Buffer, folder: string, mimeType: string): Promise<string>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');