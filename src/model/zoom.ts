/** Which part of a screen to show: its top-left corner and its width, each a fraction of the screen. */
export interface CropRect {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}
