const AVATAR_SIZE = 256
const MAX_SOURCE_BYTES = 10 * 1024 * 1024

// Turns a chosen picture into a small square JPEG data URL (centre-cropped, 256x256),
// which is what the server stores for the profile photo.
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Choose an image smaller than 10 MB.')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That image could not be read. Try a different one.')
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not process the image.')

    const side = Math.min(bitmap.width, bitmap.height)
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    )
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    bitmap.close()
  }
}
