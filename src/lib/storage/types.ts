export type UploadInput = {
  buffer: Buffer;
  key: string;
  contentType?: string;
};

export type UploadResult = {
  url: string;
  key: string;
};

export interface StorageProvider {
  upload(input: UploadInput): Promise<UploadResult>;
  delete(keys: string[]): Promise<void>;
}
