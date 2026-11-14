
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'refound',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
  },
});

module.exports = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) =>
    /^image\/(jpe?g|png|webp|gif|avif)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Only image files are allowed')),
});
