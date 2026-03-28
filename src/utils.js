export function formatDateLabel(dateLike) {
  return new Date(dateLike).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(dateLike) {
  return new Date(dateLike).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function generateSessionName(dateLike = new Date()) {
  return `Session ${new Date(dateLike).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function fileToOptimizedBlob(file) {
  const imageBitmap = typeof createImageBitmap === "function" ? await createImageBitmap(file) : await fileToImage(file);
  const maxDimension = 1080;
  const scale = Math.min(1, maxDimension / Math.max(imageBitmap.width, imageBitmap.height));
  const width = Math.round(imageBitmap.width * scale);
  const height = Math.round(imageBitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  imageBitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
          return;
        }
        reject(new Error("Image compression failed."));
      },
      "image/webp",
      0.82,
    );
  });

  return blob;
}

async function fileToImage(file) {
  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image decoding failed."));
      element.src = url;
    });

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function clampTimer(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 90;
  }
  return Math.max(15, Math.min(300, parsed));
}
