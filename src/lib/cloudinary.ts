import { v2 as cloudinary } from 'cloudinary';

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.warn("Missing Cloudinary environment variables. Uploads will fail.");
  // In a real app, you might throw an error here or handle it differently
  // throw new Error("Missing Cloudinary environment variables");
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Use https
});

interface CloudinaryUploadResult {
    secure_url: string;
    public_id: string;
}

// Function to upload a file buffer and return URL and public_id
export async function uploadImageToCloudinary(fileBuffer: Buffer, fileName: string): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: fileName,
        resource_type: "image",
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary Upload Error:", error);
          return reject(new Error("Gagal mengupload gambar."));
        }
        if (!result || !result.secure_url || !result.public_id) {
             return reject(new Error("Hasil upload Cloudinary tidak valid atau tidak lengkap."));
        }
        console.log("Cloudinary Upload Success:", result.secure_url, result.public_id);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    uploadStream.end(fileBuffer);
  });
}

// Function to delete images from Cloudinary
export async function deleteImagesFromCloudinary(publicIds: string[]): Promise<void> {
    if (!publicIds || publicIds.length === 0) {
        return;
    }
    try {
        console.log(`Attempting to delete Cloudinary resources: ${publicIds.join(', ')}`);
        const result = await cloudinary.api.delete_resources(publicIds, {
            resource_type: 'image',
        });
        console.log("Cloudinary Deletion Result:", result);
        // Check result for errors if needed
    } catch (error) {
        console.error("Error deleting Cloudinary images:", error);
        // Decide if this error should block the user flow or just be logged
        // throw new Error("Gagal menghapus gambar lama."); 
    }
}

// Helper to convert File object to Buffer (Node.js environment)
export async function fileToBuffer(file: File): Promise<Buffer> {
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
} 