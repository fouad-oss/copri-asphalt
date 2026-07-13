/* Client-side canvas compression of the paper-receipt photo (legacy
   matCompressImage): max 1280px on the long side, JPEG q0.7 — small enough
   to live in the offline queue (localStorage) until it uploads. */

export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("read failed"))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("decode failed"))
      img.onload = () => {
        const max = 1280
        let w = img.width, h = img.height
        if (w > max || h > max) {
          const s = Math.min(max / w, max / h)
          w = Math.round(w * s); h = Math.round(h * s)
        }
        const canvas = document.createElement("canvas")
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("no canvas"))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.7))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
