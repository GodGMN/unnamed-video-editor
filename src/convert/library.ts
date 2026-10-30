export interface ConvertedMedia {
  file: File;
  addToTimeline: boolean;
}

/**
 * Hands a finished conversion to the Media library.
 * TODO(#2): the media library doesn't hold real files yet; replace this stub once it does.
 */
export function addConvertedMedia(media: ConvertedMedia) {
  console.info('[convert] would add to Media library:', media.file.name, media.addToTimeline ? '(and timeline)' : '');
}
