// Type definitions for exif-js
declare module 'exif-js' {
  interface EXIFStatic {
    getData(img: HTMLImageElement | string, callback: () => void): any;
    getTag(img: any, tag: string): any;
    getAllTags(img: any): Record<string, any>;
    pretty(img: any): string;
  }

  const EXIF: EXIFStatic;
  export default EXIF;
}