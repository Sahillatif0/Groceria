import { v2 as cloudinary } from "cloudinary";
// import fs from "fs";

export const connectCloudinary = async () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
};

// export const uploadOnCloudinary = async (localFilePath) => {
//   try {
//     if (!localFilePath) return null;
//     //upload the file on cloudinary
//     const response = await cloudinary.uploader.upload(localFilePath, {
//       resource_type: "auto",
//     });
//     // file has been uploaded successfull
//     //console.log("file is uploaded on cloudinary ", response.url);
//     fs.unlinkSync(localFilePath);
//     return response;
//   } catch (error) {
//     fs.unlinkSync(localFilePath); // remove the locally saved temporary file as the upload operation got failed
//     return null;
//   }
// };

// export const deleteFromCloudinary = async (fileID) => {
//   try {
//     if (!fileID) return;
//     // delete the file from cloudinary
//     const result = await cloudinary.uploader.destroy(fileID);
//     // console.log("File Uploaded",uploadResult)
//     // fs.unlinkSync(file)
//     return result;
//   } catch (error) {
//     // fs.unlinkSync(file)
//     console.log("Error Deleting File", error);
//     return null;
//   }
// };
