const PROJECT_EXTENSIONS = /\.(json|uvepack)$/i;
const MEDIA_EXTENSIONS = /\.(mp4|m4v|mov|mkv|webm|avi|mts|m2ts|ts|3gp|ogv|mp3|m4a|aac|wav|flac|ogg|oga|opus|weba|a?png|jpe?g|webp|gif|avif|bmp|ico)$/i;

export const isProjectFile = (file: File) => PROJECT_EXTENSIONS.test(file.name);
export const isMediaFile = (file: File) => /^(video|audio|image)\//.test(file.type) || MEDIA_EXTENSIONS.test(file.name);

/** Sorts files dropped on the project library into project files, media, and files it cannot use. */
export function classifyDrop(files: File[]) {
  const projects: File[] = [], media: File[] = [], unsupported: File[] = [];
  for (const file of files) (isProjectFile(file) ? projects : isMediaFile(file) ? media : unsupported).push(file);
  return { projects, media, unsupported };
}

/** Names a project started from dropped media after its first file. */
export const projectNameFor = (file: File) => file.name.replace(/\.[^.]+$/, '').trim() || file.name;
